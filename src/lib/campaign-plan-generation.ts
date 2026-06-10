import { prisma } from "@/lib/prisma";
import { callTemplaitoBackend } from "@/lib/templaito-backend";
import { pickCanonicalListing } from "@/lib/product-grouping";

/**
 * Background worker that turns a monthly campaign plan's items into scheduled
 * SqualoMail campaigns.
 *
 * For each QUEUED item it reuses the exact `/app` pipeline: build per-country
 * campaign URLs from the product snapshot, call the Next.js `/api/scrape` route
 * to generate the email HTML (the only place generation lives), then schedule a
 * campaign for that day via the backend. Per-item status is persisted so the
 * run survives the browser closing and can be retried.
 *
 * Invoked fire-and-forget from the generate route — it must never throw.
 */

const APP_URL =
  process.env.NEXTAUTH_URL ||
  process.env.APP_URL ||
  `http://localhost:${process.env.PORT || 3002}`;

const CONCURRENCY = 2;

type PlanItem = Awaited<ReturnType<typeof loadQueuedItems>>[number];

async function loadQueuedItems(planId: string) {
  return prisma.campaignPlanItem.findMany({
    where: { planId, status: "QUEUED" },
    orderBy: { position: "asc" },
  });
}

interface SnapshotListing {
  countryCode?: string | null;
  url?: string | null;
  campaignUrl?: string | null;
  slug?: string | null;
}

function snapshotListings(snapshot: unknown): SnapshotListing[] {
  if (
    snapshot &&
    typeof snapshot === "object" &&
    Array.isArray((snapshot as { listings?: unknown }).listings)
  ) {
    return (snapshot as { listings: SnapshotListing[] }).listings;
  }
  return [];
}


function snapshotTitle(snapshot: unknown): string | undefined {
  if (snapshot && typeof snapshot === "object") {
    const title = (snapshot as { title?: unknown }).title;
    if (typeof title === "string" && title.trim()) return title.trim();
  }
  return undefined;
}

async function setItem(
  itemId: string,
  status: "GENERATING" | "SCHEDULED" | "FAILED",
  errorMessage?: string | null
) {
  await prisma.campaignPlanItem.update({
    where: { id: itemId },
    data: { status, errorMessage: errorMessage ?? null },
  });
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

export async function runPlanGeneration(planId: string): Promise<void> {
  try {
    const plan = await prisma.campaignPlan.findUnique({ where: { id: planId } });
    if (!plan) return;

    const items = await loadQueuedItems(planId);
    if (items.length === 0) return;

    // SqualoMail must be connected before we schedule anything.
    const integration = await prisma.clientIntegration.findFirst({
      where: { clientId: plan.clientId, provider: "SQUALOMAIL", status: "CONNECTED" },
      select: { id: true, metadata: true },
    });
    if (!integration) {
      await prisma.campaignPlanItem.updateMany({
        where: { planId, status: "QUEUED" },
        data: {
          status: "FAILED",
          errorMessage: "SqualoMail is not connected for this client.",
        },
      });
      return;
    }

    // mailing list id → name (for naming newsletters when a country has overrides).
    const mailingListNames: Record<string, string> = {};
    const lists =
      integration.metadata &&
      typeof integration.metadata === "object" &&
      !Array.isArray(integration.metadata)
        ? (integration.metadata as { lists?: Array<{ id?: string; name?: string }> })
            .lists
        : undefined;
    if (Array.isArray(lists)) {
      for (const list of lists) {
        if (list?.id) mailingListNames[list.id] = list.name ?? "";
      }
    }

    // Countries we can actually send to (active + a mailing list configured).
    const eligibleConfigs = await prisma.clientCountryConfig.findMany({
      where: { clientId: plan.clientId, isActive: true, mailingListId: { not: null } },
      select: { countryCode: true },
    });
    const eligibleCountries = new Set(
      eligibleConfigs.map((config) => config.countryCode.toUpperCase())
    );

    const prompts = await prisma.prompt.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        description: true,
        systemPrompt: true,
        userPrompt: true,
        designEngine: true,
        templateType: true,
      },
    });
    const promptById = new Map(prompts.map((prompt) => [prompt.id, prompt]));

    const defaults = (
      plan.strategy as {
        defaults?: {
          templateId?: string;
          subject?: string;
          preheader?: string;
          senderName?: string;
          mailingListOverrides?: Record<string, string[]>;
        };
      } | null
    )?.defaults;
    const defaultTemplateId = defaults?.templateId ?? null;
    const defaultSubject = defaults?.subject ?? "";
    const defaultPreheader = defaults?.preheader ?? "";
    const defaultSenderName = defaults?.senderName ?? "";
    const defaultListOverrides = defaults?.mailingListOverrides ?? {};

    await mapWithConcurrency(items, CONCURRENCY, async (item: PlanItem) => {
      try {
        await setItem(item.id, "GENERATING");

        const prompt =
          (item.templateId && promptById.get(item.templateId)) ||
          (defaultTemplateId && promptById.get(defaultTemplateId)) ||
          null;
        if (!prompt) {
          await setItem(item.id, "FAILED", "No active email template selected.");
          return;
        }

        if (!item.sendDate) {
          await setItem(item.id, "FAILED", "Missing send date.");
          return;
        }

        // Countries this day was explicitly limited to. Empty/absent = send to
        // every eligible country the product has a listing for.
        const selectedCodes = Array.isArray(item.countryCodes)
          ? (item.countryCodes as unknown[])
              .filter((code): code is string => typeof code === "string")
              .map((code) => code.toUpperCase())
          : [];
        const countryFilter = selectedCodes.length > 0 ? new Set(selectedCodes) : null;

        // Group eligible listings by country, then send a single canonical URL
        // per country (variant pages like …-lp / …-2 share a SKU and would
        // otherwise schedule the same product several times for one country).
        const listingsByCountry: Record<string, SnapshotListing[]> = {};
        for (const listing of snapshotListings(item.productSnapshot)) {
          const code = listing.countryCode?.toUpperCase();
          const url = listing.campaignUrl || listing.url;
          if (
            code &&
            url &&
            eligibleCountries.has(code) &&
            (!countryFilter || countryFilter.has(code))
          ) {
            (listingsByCountry[code] ||= []).push(listing);
          }
        }
        const countryUrls: Record<string, string[]> = {};
        for (const [code, listings] of Object.entries(listingsByCountry)) {
          const chosen = pickCanonicalListing(listings);
          const url = chosen.campaignUrl || chosen.url;
          if (url) countryUrls[code] = [url];
        }
        const primaryUrl = Object.values(countryUrls)[0]?.[0];
        if (!primaryUrl) {
          await setItem(
            item.id,
            "FAILED",
            "Product has no listing for an active mailing-list country."
          );
          return;
        }

        // 1. Generate the email HTML via the existing scrape pipeline.
        const scrapeResponse = await fetch(`${APP_URL}/api/scrape`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: plan.clientId,
            countryUrls,
            url: primaryUrl,
            templateType: {
              name: prompt.name,
              description: prompt.description,
              system: prompt.systemPrompt,
              user: prompt.userPrompt,
              designEngine: prompt.designEngine,
            },
          }),
        });
        if (!scrapeResponse.ok) {
          const text = await scrapeResponse.text().catch(() => "");
          await setItem(
            item.id,
            "FAILED",
            `Generation failed (${scrapeResponse.status}). ${text.slice(0, 300)}`
          );
          return;
        }
        const data = await scrapeResponse.json();
        const emailTemplate = data.emailTemplate;
        const productInfo = data.productInfo;
        const countryResults = data.countryResults;
        if (!emailTemplate?.html || !countryResults) {
          await setItem(item.id, "FAILED", "Generation returned no email content.");
          return;
        }

        // Image override: force the chosen image by putting it first in every
        // country's images, then pointing singleImageIndex at it. This reuses the
        // backend's proven override path and works for custom URLs too (the backend
        // swaps the scraped image for this one in the HTML).
        let imageOverrides: { singleImageIndex: number } | undefined;
        if (item.selectedImageUrl) {
          const chosen = item.selectedImageUrl;
          const prepend = (imgs: unknown) =>
            [chosen, ...(Array.isArray(imgs) ? imgs : []).filter((u) => u !== chosen)];
          for (const code of Object.keys(countryResults)) {
            const result = countryResults[code];
            if (result?.type === "SINGLE" && result.productInfo) {
              result.productInfo.images = prepend(result.productInfo.images);
            }
          }
          if (productInfo) productInfo.images = prepend(productInfo.images);
          imageOverrides = { singleImageIndex: 0 };
        }

        const subject =
          (item.subject?.trim() || defaultSubject.trim()) ||
          data.previewTemplate?.subject ||
          emailTemplate.subject ||
          "";
        const preheader = item.preheader?.trim() || defaultPreheader.trim() || "";
        const productNickname =
          productInfo?.title || snapshotTitle(item.productSnapshot) || undefined;

        // Effective mailing-list overrides: per-day → shared default, limited to the
        // day's eligible countries. Empty means "use each country's configured list".
        // A null column means "inherit shared defaults"; a (possibly empty) object
        // means the day was configured explicitly (empty = use country defaults).
        const itemOverrides =
          item.mailingListOverrides &&
          typeof item.mailingListOverrides === "object" &&
          !Array.isArray(item.mailingListOverrides)
            ? (item.mailingListOverrides as Record<string, string[]>)
            : null;
        const effectiveOverrides = itemOverrides ?? defaultListOverrides;
        const mailingListOverrides: Record<string, string[]> = {};
        for (const code of Object.keys(countryUrls)) {
          const ids = effectiveOverrides?.[code];
          if (Array.isArray(ids) && ids.length > 0) mailingListOverrides[code] = ids;
        }
        const hasOverrides = Object.keys(mailingListOverrides).length > 0;

        // 2. Schedule the campaign for this day (backend localizes/translates/queues).
        await callTemplaitoBackend({
          path: "/integrations/squalomail/campaigns",
          method: "POST",
          body: JSON.stringify({
            clientId: plan.clientId,
            baseCountry: data.baseCountry ?? null,
            subject,
            preheader,
            senderName: defaultSenderName,
            sendDate: item.sendDate.toISOString(),
            emailTemplate,
            countryResults,
            imageOverrides,
            mailingListOverrides: hasOverrides ? mailingListOverrides : undefined,
            mailingListNames: hasOverrides ? mailingListNames : undefined,
            productUrl: primaryUrl,
            productNickname,
            productInfo,
            templateId: prompt.id,
          }),
        });

        await setItem(item.id, "SCHEDULED");
      } catch (error) {
        console.error(`[PLAN-GEN] Item ${item.id} failed`, error);
        await setItem(
          item.id,
          "FAILED",
          error instanceof Error ? error.message.slice(0, 500) : "Unknown error"
        ).catch(() => null);
      }
    });

    // Mark the plan scheduled once nothing is left pending and at least one succeeded.
    const remaining = await prisma.campaignPlanItem.count({
      where: { planId, status: { in: ["QUEUED", "GENERATING"] } },
    });
    const scheduled = await prisma.campaignPlanItem.count({
      where: { planId, status: "SCHEDULED" },
    });
    if (remaining === 0 && scheduled > 0) {
      await prisma.campaignPlan.update({
        where: { id: planId },
        data: { status: "SCHEDULED" },
      });
    }
  } catch (error) {
    console.error(`[PLAN-GEN] Plan ${planId} generation crashed`, error);
  }
}
