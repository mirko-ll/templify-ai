/**
 * Page scrapes pick up badges, flags and UI icons alongside the product gallery
 * (e.g. vigoshop's `general/flags/eu-warehouse.svg` "ships from EU warehouse"
 * badge). Product photos are never SVG, so those are treated as non-product.
 */
export function isProductImageUrl(url: unknown): url is string {
  return (
    typeof url === "string" &&
    /^https?:\/\//i.test(url) &&
    !/\.svg(?:[?#]|$)|\/flags\//i.test(url)
  );
}

/**
 * Drops non-product images and puts the best image first, so "image 0" — the
 * default selection and the slot the per-country localization swaps by index —
 * is the real product photo.
 */
export function cleanProductImages<
  T extends { images?: unknown; bestImageUrl?: unknown }
>(info: T): T & { images: string[]; bestImageUrl: string } {
  const images = Array.isArray(info.images)
    ? info.images.filter(isProductImageUrl)
    : [];
  const best = isProductImageUrl(info.bestImageUrl)
    ? info.bestImageUrl
    : images[0] ?? "";
  return {
    ...info,
    bestImageUrl: best,
    images: best ? [best, ...images.filter((url) => url !== best)] : images,
  };
}

type StoredCountryResult = {
  productInfo?: { images?: unknown; bestImageUrl?: unknown };
  multiProductInfo?: { products?: unknown };
};

/** cleanProductImages applied to every product in a stored countryResults map. */
export function cleanCountryResultImages(countryResults: unknown): unknown {
  if (!countryResults || typeof countryResults !== "object") return countryResults;
  const cleaned: Record<string, unknown> = {};
  for (const [code, raw] of Object.entries(countryResults as Record<string, unknown>)) {
    const entry = raw as StoredCountryResult | null;
    if (!entry || typeof entry !== "object") {
      cleaned[code] = raw;
      continue;
    }
    const products = entry.multiProductInfo?.products;
    cleaned[code] = {
      ...entry,
      ...(entry.productInfo ? { productInfo: cleanProductImages(entry.productInfo) } : {}),
      ...(Array.isArray(products)
        ? {
            multiProductInfo: {
              ...entry.multiProductInfo,
              products: products.map((p) =>
                p && typeof p === "object" ? cleanProductImages(p) : p
              ),
            },
          }
        : {}),
    };
  }
  return cleaned;
}
