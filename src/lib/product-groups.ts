import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildCampaignUrl, type CampaignUrlRule } from "@/lib/product-links";
import { groupProducts, type GroupableProduct, type ProductGroup } from "@/lib/product-grouping";

/** Offer info (title, description, image) is shown from this country when present. */
export const PREFERRED_INFO_COUNTRY = "SI";

/**
 * Load full products for the given group keys and shape them into offer cards
 * (the same ProductGroup the planner picker shows and stores as an item's
 * productSnapshot). Returned in `groupKeys` order; unknown keys are skipped.
 */
export async function loadProductGroups(
  clientId: string,
  groupKeys: string[],
  statusWhere: Prisma.ProductWhereInput = { status: "ACTIVE" }
): Promise<ProductGroup[]> {
  if (groupKeys.length === 0) return [];
  const products = await prisma.product.findMany({
    where: { clientId, ...statusWhere, groupKey: { in: groupKeys } },
    include: {
      images: { orderBy: { rank: "asc" }, take: 20 },
      listings: {
        orderBy: [{ countryCode: "asc" }, { updatedAt: "desc" }],
        take: 30,
        include: { source: { select: { id: true, name: true, config: true } } },
      },
    },
  });

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

  // Preserve the requested ordering (groupProducts re-derives the same key).
  const byKey = new Map<string, ProductGroup>();
  for (const group of groupProducts(groupable, PREFERRED_INFO_COUNTRY)) byKey.set(group.key, group);
  return groupKeys.map((key) => byKey.get(key)).filter((group): group is ProductGroup => Boolean(group));
}
