import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { denyUnlessClientAccess } from "@/lib/client-access";
import { buildCampaignUrl, type CampaignUrlRule } from "@/lib/product-links";
import {
  groupProducts,
  type GroupableProduct,
  type ProductGroup,
} from "@/lib/product-grouping";

/** Offer info (title, description, image) is shown from this country when present. */
const PREFERRED_INFO_COUNTRY = "SI";

/**
 * Translate the `status` query into a Prisma filter.
 * Absent / "ACTIVE" → active only (the planner relies on this default);
 * "ALL" → active + needs-review (the catalog's working set);
 * "ARCHIVED" / specific status → that status.
 */
function statusFilter(statusParam: string | undefined): Prisma.ProductWhereInput {
  if (!statusParam || statusParam === "ACTIVE") return { status: "ACTIVE" };
  if (statusParam === "ALL") return { status: { not: "ARCHIVED" } };
  return { status: statusParam as any };
}

type GroupRow = {
  groupKey: string | null;
  _max: { updatedAt: Date | null; lastSeenAt: Date | null };
  _count: { _all: number };
};

/** Recency timestamp used for the "recent" sort. */
function recencyOf(row: GroupRow): number {
  const date = row._max.lastSeenAt ?? row._max.updatedAt;
  return date ? date.getTime() : 0;
}

function sortGroupRows(rows: GroupRow[], sort: string): GroupRow[] {
  if (sort === "title") {
    return [...rows].sort((a, b) => (a.groupKey ?? "").localeCompare(b.groupKey ?? ""));
  }
  if (sort === "countries") {
    // One product row per country, so the member count is a faithful proxy.
    return [...rows].sort(
      (a, b) => b._count._all - a._count._all || (a.groupKey ?? "").localeCompare(b.groupKey ?? "")
    );
  }
  return [...rows].sort((a, b) => recencyOf(b) - recencyOf(a)); // "recent"
}

/**
 * GET grouped products for the planner picker and the catalog browser.
 *
 * Products are stored per country; each shares a `groupKey` (set at sync time)
 * so offers can be grouped and paginated in SQL rather than in memory. The page
 * of group keys is selected first (cheap aggregate), then only that page's full
 * products are loaded and shaped into offer cards. With no `page` param the full
 * set is returned (the planner picker).
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

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const status = searchParams.get("status")?.trim().toUpperCase();
  const country = searchParams.get("country")?.trim().toUpperCase();
  const availability = searchParams.get("availability")?.trim().toUpperCase();
  // Categories are stored lowercased at sync time.
  const category = searchParams.get("category")?.trim().toLowerCase();
  const paginated = searchParams.has("page");
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    Math.max(1, Number.parseInt(searchParams.get("pageSize") ?? "24", 10) || 24),
    100
  );
  // Browser defaults to recency; the planner picker (unpaginated) stays alphabetical.
  const sort = searchParams.get("sort")?.trim() || (paginated ? "recent" : "title");

  // Filter the underlying product rows. Country/availability live on listings,
  // so they're expressed as a single relation filter (a listing matching both).
  const listingSome: Prisma.ProductListingWhereInput = {};
  if (country) listingSome.countryCode = country;
  if (availability) listingSome.availability = availability as any;
  const where: Prisma.ProductWhereInput = {
    clientId: id,
    ...statusFilter(status),
    // Match the offer code (groupKey), the description, or any listing's own
    // localized title — so e.g. a Slovenian word finds an offer even when it's
    // stored as a single merged row whose Product.title is another language.
    ...(search
      ? {
          OR: [
            { groupKey: { contains: search.toUpperCase() } },
            { description: { contains: search } },
            { listings: { some: { title: { contains: search } } } },
          ],
        }
      : {}),
    // A group matches when any member product carries the category (offers
    // inherit their main product's category at sync time).
    ...(category ? { category } : {}),
    ...(Object.keys(listingSome).length > 0 ? { listings: { some: listingSome } } : {}),
  };

  // Phase 1: one row per offer (cheap aggregate) — drives total, sort, paging.
  const groupRows = (
    await prisma.product.groupBy({
      by: ["groupKey"],
      where,
      _max: { updatedAt: true, lastSeenAt: true },
      _count: { _all: true },
    })
  ).filter((row): row is GroupRow => Boolean(row.groupKey));

  const sortedRows = sortGroupRows(groupRows, sort);
  const total = sortedRows.length;
  const pageRows = paginated
    ? sortedRows.slice((page - 1) * pageSize, page * pageSize)
    : sortedRows;
  const pageKeys = pageRows
    .map((row) => row.groupKey)
    .filter((key): key is string => Boolean(key));

  // Phase 2: load full products only for this page's offers, then shape them.
  const products =
    pageKeys.length > 0
      ? await prisma.product.findMany({
          where: { clientId: id, ...statusFilter(status), groupKey: { in: pageKeys } },
          include: {
            images: { orderBy: { rank: "asc" }, take: 20 },
            listings: {
              orderBy: [{ countryCode: "asc" }, { updatedAt: "desc" }],
              take: 30,
              include: { source: { select: { id: true, name: true, config: true } } },
            },
          },
        })
      : [];

  const groupable: GroupableProduct[] = products.map((product) => ({
    id: product.id,
    title: product.title,
    normalizedTitle: product.normalizedTitle,
    description: product.description,
    bestImageUrl: product.bestImageUrl,
    category: product.category,
    status: product.status,
    updatedAt: product.updatedAt?.toISOString() ?? null,
    lastSeenAt: product.lastSeenAt?.toISOString() ?? null,
    images: product.images.map((image) => ({ url: image.url })),
    listings: product.listings.map((listing) => {
      const rule =
        listing.source?.config &&
        typeof listing.source.config === "object" &&
        !Array.isArray(listing.source.config)
          ? (listing.source.config as CampaignUrlRule)
          : null;
      return {
        id: listing.id,
        productId: product.id,
        countryCode: listing.countryCode,
        title: listing.title,
        normalizedTitle: product.normalizedTitle,
        url: listing.url,
        campaignUrl: buildCampaignUrl({ product, listing, rule }),
        campaignUrlRule: rule,
        slug: listing.slug,
        priceRaw: listing.priceRaw,
        regularPrice: listing.regularPrice,
        salePrice: listing.salePrice,
        currency: listing.currency,
        availability: listing.availability,
      };
    }),
  }));

  // Preserve the phase-1 ordering (groupProducts re-derives the same key).
  const byKey = new Map<string, ProductGroup>();
  for (const group of groupProducts(groupable, PREFERRED_INFO_COUNTRY))
    byKey.set(group.key, group);
  const groups = pageKeys
    .map((key) => byKey.get(key))
    .filter((group): group is ProductGroup => Boolean(group));

  // Facets: every country the client has a listing in, every category the
  // catalog knows + per-status product counts.
  const [countryRows, categoryRows, statusCounts] = await Promise.all([
    prisma.productListing.findMany({
      where: { clientId: id, countryCode: { not: null } },
      distinct: ["countryCode"],
      select: { countryCode: true },
      orderBy: { countryCode: "asc" },
    }),
    prisma.product.findMany({
      where: { clientId: id, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
    prisma.product.groupBy({
      by: ["status"],
      where: { clientId: id },
      _count: { _all: true },
    }),
  ]);

  return NextResponse.json({
    groups,
    total,
    page: paginated ? page : 1,
    pageSize: paginated ? pageSize : total,
    facets: {
      countries: countryRows
        .map((row) => row.countryCode)
        .filter((code): code is string => Boolean(code)),
      categories: categoryRows
        .map((row) => row.category)
        .filter((value): value is string => Boolean(value)),
      counts: statusCounts.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      }, {}),
    },
  });
}
