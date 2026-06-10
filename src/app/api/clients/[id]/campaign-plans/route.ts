import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";

function monthDefaults() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

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
    include: {
      items: {
        orderBy: { position: "asc" },
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
    },
  });

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

  // Manual months are a single editable draft per (client, year, month) — reuse
  // the existing draft instead of creating duplicates each time the planner opens.
  if (mode === "MANUAL") {
    const existing = await prisma.campaignPlan.findFirst({
      where: { clientId: id, year, month, mode: "MANUAL", status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      include: planInclude,
    });
    if (existing) {
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
