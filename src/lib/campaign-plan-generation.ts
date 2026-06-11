import { prisma } from "@/lib/prisma";
import { callTemplaitoBackend } from "@/lib/templaito-backend";
import { pickCanonicalListing } from "@/lib/product-grouping";
import { buildCampaignUrl, type CampaignUrlRule } from "@/lib/product-links";

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

/**
 * Preferred base country for generation. The first country sent to /api/scrape
 * becomes the base: the AI writes from its product page, and its title/subject
 * become the campaign's name/nickname shown in the Campaigns panel.
 */
const PREFERRED_BASE_COUNTRY = "SI";

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
  title?: string | null;
  normalizedTitle?: string | null;
  campaignUrlRule?: CampaignUrlRule | null;
  priceRaw?: string | null;
  regularPrice?: string | null;
  salePrice?: string | null;
  currency?: string | null;
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

/** Parse a European-format price string ("519 Kč", "62,99€", "4.990 Ft") to a number. */
export function parsePriceNumber(value: string | null | undefined): number | null {
  const cleaned = (value ?? "").replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** What currency a listing's scraped prices are in: EUR, something else, or unknown. */
function listingCurrency(listing: SnapshotListing): "EUR" | "OTHER" | null {
  const iso = listing.currency?.trim().toUpperCase();
  if (iso === "EUR") return "EUR";
  if (iso && /^[A-Z]{3}$/.test(iso)) return "OTHER";
  const text = `${listing.priceRaw ?? ""} ${listing.regularPrice ?? ""} ${listing.salePrice ?? ""}`;
  if (text.includes("€") || /\bEUR\b/.test(text)) return "EUR";
  if (/Kč|Ft|zł|lei|лв|дин|РСД/iu.test(text)) return "OTHER";
  return null;
}

/** The listing's most representative price for ratio math (regular beats sale). */
function listingPrice(
  listing: SnapshotListing
): { value: number; text: string } | null {
  for (const text of [listing.regularPrice, listing.salePrice, listing.priceRaw]) {
    const value = parsePriceNumber(text);
    if (value !== null) return { value, text: text as string };
  }
  return null;
}

function listingPriceNumber(listing: SnapshotListing): number | null {
  return listingPrice(listing)?.value ?? null;
}

/**
 * Estimate the local price a non-EUR country's landing page will DISPLAY.
 *
 * These shops' URL price parameter is always in EUR — the landing page itself
 * converts to the local currency (full "N,99" euro price × shop rate, floored,
 * with ",99" re-appended: 18,99 € → 94,99 lei). Mirror that using the shop's
 * own implied rate, derived from the catalog's listed prices for this product
 * ("94,99 lei" vs "18,99 €" → ×5). Returns the integer part only — the
 * sale-price backfill re-adds the country's standard decimals.
 *
 * EUR (and unknown-currency) listings return the price unchanged; null means
 * no safe estimate — callers then skip the email backfill for that country.
 */
export function localizeEurPrice(
  eurPrice: string,
  listing: SnapshotListing,
  euroReference: SnapshotListing | null
): string | null {
  const currency = listingCurrency(listing);
  if (currency !== "OTHER") return eurPrice;
  const eurValue = parsePriceNumber(eurPrice);
  const local = listingPrice(listing);
  const ref = euroReference ? listingPrice(euroReference) : null;
  if (!eurValue || !local || !ref) return null;
  // The page converts the full euro price ("13" displays as 13,99 €) — adopt
  // the euro decimal ending from the price string the rate was derived from.
  let displayEur = eurValue;
  if (!/[.,]\d{1,2}$/.test(eurPrice.trim())) {
    const decimals = ref.text.match(/\d[.,](\d{2})(?!.*\d)/);
    if (decimals) displayEur = eurValue + Number.parseFloat(`0.${decimals[1]}`);
  }
  return String(Math.floor(displayEur * (local.value / ref.value)));
}

/** Campaign id a resend day clones, if this is one (set by the day editor's resend form). */
function resendSourceId(snapshot: unknown): string | null {
  if (snapshot && typeof snapshot === "object") {
    const source = (snapshot as { resend?: { sourceCampaignId?: unknown } }).resend
      ?.sourceCampaignId;
    if (typeof source === "string" && source.trim()) return source;
  }
  return null;
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

/**
 * Resend day: the backend clones the source campaign's prepared per-country
 * emails (same content, same mailing lists) for the new send date — no
 * scraping or AI generation involved, so the item goes straight to SCHEDULED.
 */
async function scheduleResendItem(item: PlanItem, sourceCampaignId: string) {
  if (!item.sendDate) {
    await setItem(item.id, "FAILED", "Missing send date.");
    return;
  }

  const source = await prisma.campaign.findUnique({
    where: { id: sourceCampaignId },
    select: {
      id: true,
      countryTargets: {
        where: { preparedHtml: { not: null } },
        select: { id: true },
      },
    },
  });
  if (!source || source.countryTargets.length === 0) {
    await setItem(
      item.id,
      "FAILED",
      "The original campaign no longer has prepared content to resend. Pick a different campaign for this day."
    );
    return;
  }

  const resent = await callTemplaitoBackend<{ id?: string | null }>({
    path: `/integrations/squalomail/campaigns/${sourceCampaignId}/resend`,
    method: "POST",
    body: JSON.stringify({ sendDate: item.sendDate.toISOString() }),
  });

  await prisma.campaignPlanItem.update({
    where: { id: item.id },
    data: {
      status: "SCHEDULED",
      errorMessage: null,
      campaignId: resent?.id ?? null,
    },
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

        // Resend days clone an existing campaign — skip the whole generation
        // pipeline (template, scrape, schedule) below.
        const sourceCampaignId = resendSourceId(item.productSnapshot);
        if (sourceCampaignId) {
          await scheduleResendItem(item, sourceCampaignId);
          return;
        }

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
        // A per-day price override is applied by rebuilding the campaign link —
        // landing pages read the price from the URL, so the scraped content
        // (email HTML and the {price} variable) picks it up automatically.
        const priceOverride =
          typeof item.priceOverride === "string" && item.priceOverride.trim()
            ? item.priceOverride.trim()
            : null;
        // SI first: the scrape treats the first country as the base, so the
        // generated copy (and the campaign's display name) is Slovenian
        // whenever the day sends to SI.
        const orderedCodes = Object.keys(listingsByCountry).sort((a, b) =>
          a === PREFERRED_BASE_COUNTRY
            ? -1
            : b === PREFERRED_BASE_COUNTRY
              ? 1
              : a.localeCompare(b)
        );
        const countryUrls: Record<string, string[]> = {};
        // What each country's landing page will DISPLAY as the offer price —
        // feeds the salePrice backfill so the email matches the page.
        const countryDisplayPrices: Record<string, string> = {};
        // A canonical EUR-priced listing of this product — the rate reference
        // for estimating non-EUR display prices (the URL itself stays in EUR).
        const euroListings = snapshotListings(item.productSnapshot).filter(
          (listing) =>
            listingCurrency(listing) === "EUR" &&
            listingPriceNumber(listing) !== null
        );
        const euroReference =
          euroListings.length > 0 ? pickCanonicalListing(euroListings) : null;
        for (const code of orderedCodes) {
          const listings = listingsByCountry[code];
          const chosen = pickCanonicalListing(listings);
          let url = chosen.campaignUrl || chosen.url;
          // The URL price parameter is ALWAYS in EUR — the shops convert to
          // the local currency on the page — so the override goes into every
          // country's link as typed (and the default prices are EUR too).
          let appliedEurPrice = chosen.campaignUrlRule?.defaultPrice?.trim() || null;
          if (priceOverride && chosen.url && chosen.campaignUrlRule) {
            try {
              url = buildCampaignUrl({
                product: {
                  title:
                    chosen.title || snapshotTitle(item.productSnapshot) || "",
                  normalizedTitle: chosen.normalizedTitle ?? null,
                },
                listing: {
                  url: chosen.url,
                  slug: chosen.slug,
                  countryCode: chosen.countryCode,
                },
                rule: chosen.campaignUrlRule,
                price: priceOverride,
              });
              appliedEurPrice = priceOverride;
            } catch {
              // Malformed listing URL — keep the prebuilt campaign link.
            }
          }
          if (url) {
            countryUrls[code] = [url];
            if (appliedEurPrice) {
              const display = localizeEurPrice(appliedEurPrice, chosen, euroReference);
              if (display) countryDisplayPrices[code] = display;
            }
          }
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

        // 1. Generate the email HTML via the existing scrape pipeline. The
        // per-country DISPLAY prices ride along so the scrape can backfill sale
        // prices the landing pages only render client-side — BEFORE the email
        // copy is written (otherwise the CTA quotes the regular price).
        const scrapeResponse = await fetch(`${APP_URL}/api/scrape`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: plan.clientId,
            countryUrls,
            countryPrices: countryDisplayPrices,
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
        const scheduled = await callTemplaitoBackend<{ campaignId?: string | null }>({
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

        // Keep the link to the created campaign so the planner can show the
        // generated template and detect backend publish failures.
        await prisma.campaignPlanItem.update({
          where: { id: item.id },
          data: {
            status: "SCHEDULED",
            errorMessage: null,
            campaignId: scheduled?.campaignId ?? null,
          },
        });
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
