import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  maybeCompletePlan,
  syncCampaignPlanItems,
} from "@/lib/campaign-plan-sync";
import { denyUnlessClientAccess } from "@/lib/client-access";

function monthDefaults() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

const planInclude = {
  items: {
    orderBy: { position: "asc" as const },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          bestImageUrl: true,
          status: true,
        },
      },
    },
  },
};

export async function GET(
  _request: NextRequest,
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

  const { searchParams } = new URL(_request.url);
  const monthParam = Number.parseInt(searchParams.get("month") ?? "", 10);
  const yearParam = Number.parseInt(searchParams.get("year") ?? "", 10);
  const month =
    Number.isFinite(monthParam) && monthParam >= 1 && monthParam <= 12
      ? monthParam
      : undefined;
  const year =
    Number.isFinite(yearParam) && yearParam >= 2020 ? yearParam : undefined;

  const plans = await prisma.campaignPlan.findMany({
    where: {
      clientId: id,
      ...(month ? { month } : {}),
      ...(year ? { year } : {}),
    },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
    take: 24,
    include: planInclude,
  });

  // Single-month lookups back the planner view, so keep item statuses honest
  // there (publish failures, dead generation runner). The unfiltered tab list
  // skips the per-plan queries and only closes out finished months.
  const syncItems = Boolean(month && year);
  for (const plan of plans) {
    if (syncItems && (await syncCampaignPlanItems(plan.items))) {
      const fresh = await prisma.campaignPlan.findFirst({
        where: { id: plan.id },
        include: planInclude,
      });
      if (fresh) Object.assign(plan, fresh);
    }
    // Close out scheduled plans whose month has passed so the list reflects
    // reality without anyone having to open the planner.
    if (await maybeCompletePlan(plan, plan.items)) {
      plan.status = "COMPLETED";
    }
  }

  return NextResponse.json({ plans });
}

export async function POST(
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

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const defaults = monthDefaults();
  const month =
    typeof body?.month === "number" && body.month >= 1 && body.month <= 12
      ? Math.floor(body.month)
      : defaults.month;
  const year =
    typeof body?.year === "number" && body.year >= 2020
      ? Math.floor(body.year)
      : defaults.year;
  const mode = body?.mode === "ASSISTED" ? "ASSISTED" : "MANUAL";
  const name =
    typeof body?.name === "string" && body.name.trim()
      ? body.name.trim()
      : `${year}-${String(month).padStart(2, "0")} Campaign Plan`;

  // Manual months are a single plan per (client, year, month) — reuse it in
  // any live status, so a generated (SCHEDULED) month reopens with its items
  // instead of spawning an empty duplicate draft.
  if (mode === "MANUAL") {
    const candidates = await prisma.campaignPlan.findMany({
      where: {
        clientId: id,
        year,
        month,
        mode: "MANUAL",
        status: { in: ["DRAFT", "APPROVED", "SCHEDULED", "COMPLETED"] },
      },
      include: planInclude,
    });
    if (candidates.length > 0) {
      // Months touched before this lookup existed may hold duplicates (a
      // generated plan plus an empty auto-created draft) — prefer the plan
      // that has items, then the most recently updated.
      candidates.sort(
        (a, b) =>
          (b.items.length > 0 ? 1 : 0) - (a.items.length > 0 ? 1 : 0) ||
          b.updatedAt.getTime() - a.updatedAt.getTime()
      );
      let existing = candidates[0];
      if (await syncCampaignPlanItems(existing.items)) {
        existing =
          (await prisma.campaignPlan.findUnique({
            where: { id: existing.id },
            include: planInclude,
          })) ?? existing;
      }
      if (await maybeCompletePlan(existing, existing.items)) {
        existing = { ...existing, status: "COMPLETED" };
      }
      return NextResponse.json({ plan: existing });
    }
  }

  const products =
    mode === "ASSISTED"
      ? await prisma.product.findMany({
          where: {
            clientId: id,
            status: "ACTIVE",
          },
          orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }],
          take: 2,
          include: {
            listings: { take: 5 },
            images: { orderBy: { rank: "asc" }, take: 1 },
          },
        })
      : [];

  const plan = await prisma.campaignPlan.create({
    data: {
      clientId: id,
      name,
      month,
      year,
      mode,
      strategy:
        mode === "ASSISTED"
          ? { defaultMix: ["WINNER", "TEST"], requiresApproval: true }
          : { manualEveryMonth: true },
      items:
        products.length > 0
          ? {
              create: products.map((product, index) => ({
                productId: product.id,
                type: index === 0 ? "WINNER" : "TEST",
                position: index,
                selectedImageUrl: product.bestImageUrl,
                countryCodes: product.listings
                  .map((listing) => listing.countryCode)
                  .filter(Boolean),
                productSnapshot: {
                  title: product.title,
                  canonicalUrl: product.canonicalUrl,
                  bestImageUrl: product.bestImageUrl,
                  listings: product.listings.map((listing) => ({
                    countryCode: listing.countryCode,
                    url: listing.url,
                    priceRaw: listing.priceRaw,
                    regularPrice: listing.regularPrice,
                    salePrice: listing.salePrice,
                    currency: listing.currency,
                    availability: listing.availability,
                  })),
                  images: product.images.map((image) => ({
                    url: image.url,
                    rank: image.rank,
                  })),
                },
              })),
            }
          : undefined,
    },
    include: planInclude,
  });

  return NextResponse.json({ plan }, { status: 201 });
}
