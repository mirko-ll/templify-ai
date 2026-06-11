import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";
import { buildCampaignUrl, type CampaignUrlRule } from "@/lib/product-links";

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 50;
}

/**
 * Clear the client's synced catalog so the next sync rebuilds it from scratch
 * (e.g. after a grouping fix). Listings and images cascade with their products;
 * plan items keep their snapshots (productId just goes null); campaigns are
 * untouched. Sources and sync-run history stay.
 */
export async function DELETE(
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

  const { count } = await prisma.product.deleteMany({ where: { clientId: id } });
  return NextResponse.json({ ok: true, deleted: count });
}

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

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const status = searchParams.get("status")?.trim().toUpperCase();
  const limit = parseLimit(searchParams.get("limit"));

  const products = await prisma.product.findMany({
    where: {
      clientId: id,
      ...(status && status !== "ALL"
        ? { status: status as any }
        : status === "ALL"
          ? {}
          : { status: { not: "ARCHIVED" } }),
      ...(search
        ? {
            OR: [
              { title: { contains: search } },
              { normalizedTitle: { contains: search.toLowerCase() } },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
    include: {
      images: {
        orderBy: { rank: "asc" },
        take: 6,
      },
      listings: {
        orderBy: [{ countryCode: "asc" }, { updatedAt: "desc" }],
        take: 20,
        include: {
          source: {
            select: {
              id: true,
              name: true,
              config: true,
            },
          },
        },
      },
    },
  });

  const counts = await prisma.product.groupBy({
    by: ["status"],
    where: { clientId: id },
    _count: { _all: true },
  });

  return NextResponse.json({
    products: products.map((product) => ({
      ...product,
      listings: product.listings.map((listing) => {
        const sourceConfig =
          listing.source?.config &&
          typeof listing.source.config === "object" &&
          !Array.isArray(listing.source.config)
            ? (listing.source.config as CampaignUrlRule)
            : null;
        return {
          ...listing,
          campaignUrl: buildCampaignUrl({
            product,
            listing,
            rule: sourceConfig,
          }),
          campaignUrlRule: sourceConfig,
        };
      }),
    })),
    counts: counts.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {}),
  });
}

export async function PATCH(
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

  const productIds = Array.isArray(body?.productIds)
    ? body.productIds.filter((value: unknown): value is string => typeof value === "string")
    : [];

  if (body?.action !== "archive") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  if (productIds.length === 0) {
    return NextResponse.json({ error: "productIds are required" }, { status: 400 });
  }

  const result = await prisma.product.updateMany({
    where: {
      clientId: id,
      id: { in: productIds },
    },
    data: {
      status: "ARCHIVED",
    },
  });

  return NextResponse.json({ success: true, count: result.count });
}
