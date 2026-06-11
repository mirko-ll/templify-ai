import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";

const PAGE_SIZE = 20;

/** Statuses worth offering for a resend — drafts, failures and cancels are not. */
const RESENDABLE_STATUSES = ["READY", "SCHEDULED", "SENDING", "SENT"] as const;

/**
 * Campaign-level subject/name hold the base-language template; the localized
 * per-country subject lives on the targets. Slovenian is the house base
 * language (see PREFERRED_BASE_COUNTRY in campaign-plan-generation), so the
 * picker prefers the SI rendering.
 */
const SUBJECT_PRIORITY_COUNTRY = "SI";

/** Suffix the backend resend route stamps on cloned campaigns' names. */
const RESEND_NAME_SUFFIX = " · resend";

/** First product image from the stored productInfo JSON, if any. */
function extractImageUrl(productInfoJson: string | null): string | null {
  if (!productInfoJson) return null;
  try {
    const info = JSON.parse(productInfoJson) as { images?: unknown };
    if (Array.isArray(info?.images)) {
      const first = info.images.find(
        (url): url is string => typeof url === "string" && /^https?:\/\//i.test(url)
      );
      return first ?? null;
    }
  } catch {
    // Legacy/malformed snapshot — the picker just shows no thumbnail.
  }
  return null;
}

/**
 * Campaigns the planner can re-schedule as-is: per-country prepared HTML still
 * exists, so the backend resend endpoint can clone them for a new send date.
 * Supports the picker's debounced search over name/subject/product nickname.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const access = await denyUnlessClientAccess(id, userId);
  if (access.response) return access.response;

  const search = new URL(request.url).searchParams.get("search")?.trim() ?? "";

  const where = {
    clientId: id,
    status: { in: [...RESENDABLE_STATUSES] },
    countryTargets: { some: { preparedHtml: { not: null } } },
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { subject: { contains: search } },
            { productNickname: { contains: search } },
            // The picker displays localized subjects — let search match them too.
            { countryTargets: { some: { preparedSubject: { contains: search } } } },
          ],
        }
      : {}),
  };

  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        status: true,
        subject: true,
        productNickname: true,
        productInfoJson: true,
        scheduledAt: true,
        sentAt: true,
        createdAt: true,
        // No preparedHtml here — it's LongText and the campaign-level filter
        // already guarantees prepared content exists.
        countryTargets: {
          select: { countryCode: true, externalId: true, preparedSubject: true },
        },
      },
    }),
    prisma.campaign.count({ where }),
  ]);

  const payload = campaigns.map((campaign) => {
    const siSubject = campaign.countryTargets
      .find(
        (target) => target.countryCode.toUpperCase() === SUBJECT_PRIORITY_COUNTRY
      )
      ?.preparedSubject?.trim();
    return {
      id: campaign.id,
      name: campaign.name.endsWith(RESEND_NAME_SUFFIX)
        ? campaign.name.slice(0, -RESEND_NAME_SUFFIX.length)
        : campaign.name,
      isResend: campaign.name.endsWith(RESEND_NAME_SUFFIX),
      status: campaign.status,
      subject: siSubject || campaign.subject,
      productNickname: campaign.productNickname,
      imageUrl: extractImageUrl(campaign.productInfoJson),
      scheduledAt: campaign.scheduledAt ? campaign.scheduledAt.toISOString() : null,
      sentAt: campaign.sentAt ? campaign.sentAt.toISOString() : null,
      createdAt: campaign.createdAt.toISOString(),
      countries: Array.from(
        new Set(
          campaign.countryTargets.map((target) => target.countryCode.toUpperCase())
        )
      ).sort(),
      newsletterIds: campaign.countryTargets
        .map((target) => target.externalId)
        .filter((value): value is string => Boolean(value)),
    };
  });

  return NextResponse.json({ campaigns: payload, total });
}
