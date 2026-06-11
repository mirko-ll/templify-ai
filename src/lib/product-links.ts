export interface CampaignUrlRule {
  campaignUrlTemplate?: string;
  countryCampaignUrlTemplates?: Record<string, string>;
  domainCampaignUrlTemplates?: Record<string, string>;
  defaultPrice?: string;
}

export interface CampaignUrlProduct {
  title: string;
  normalizedTitle?: string | null;
}

export interface CampaignUrlListing {
  url: string;
  slug?: string | null;
  countryCode?: string | null;
}

function toUtmSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function priceInt(value: string) {
  const parsed = Number.parseFloat(value.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? String(Math.trunc(parsed)) : "";
}

/**
 * Format a bare price value the way a country writes its prices, copying the
 * currency symbol and its position/spacing from a sample ("519 Kč" → "189 Kč",
 * "62,99€" → "7,50€"). An integer-only value also adopts the sample's decimal
 * ending ("14" + sample "14,99€" → "14,99€") — these shops' URL price schemes
 * carry only the integer part and the landing page appends the catalog's
 * standard ",99" itself, so the email must match what the page will show.
 * Falls back to a trailing € when the sample is unusable.
 */
export function formatPriceLike(value: string, sample: string): string {
  const trimmed = (sample ?? "").trim();
  let amount = value.trim();
  if (!/[.,]\d{1,2}$/.test(amount)) {
    const decimals = trimmed.match(/\d([.,]\d{2})(?!.*\d)/);
    if (decimals) amount = `${amount}${decimals[1]}`;
  }
  const suffix = trimmed.match(/[\d.,]+(\s?)([^\d\s.,]+)$/);
  if (suffix) return `${amount}${suffix[1]}${suffix[2]}`;
  const prefix = trimmed.match(/^([^\d\s.,]+)(\s?)[\d.,]/);
  if (prefix) return `${prefix[1]}${prefix[2]}${amount}`;
  return `${amount} €`;
}

export function buildCampaignUrl(params: {
  product: CampaignUrlProduct;
  listing: CampaignUrlListing;
  rule?: CampaignUrlRule | null;
  price?: string | null;
}) {
  const { product, listing, rule } = params;
  const price = (params.price || rule?.defaultPrice || "").trim();
  const url = new URL(listing.url);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const countryCode = listing.countryCode?.toUpperCase() || "";
  const domainTemplate =
    rule?.domainCampaignUrlTemplates?.[hostname] ||
    rule?.domainCampaignUrlTemplates?.[url.hostname.toLowerCase()];
  const countryTemplate = countryCode
    ? rule?.countryCampaignUrlTemplates?.[countryCode]
    : undefined;
  const template =
    domainTemplate?.trim() ||
    countryTemplate?.trim() ||
    rule?.campaignUrlTemplate?.trim();

  if (!template) {
    return listing.url;
  }

  const values: Record<string, string> = {
    url: stripTrailingSlash(listing.url),
    rawUrl: listing.url,
    origin: url.origin,
    path: stripTrailingSlash(url.pathname),
    slug: listing.slug || decodeURIComponent(url.pathname.replace(/\/$/, "").split("/").pop() || ""),
    countryCode: listing.countryCode || "",
    title: product.title,
    normalizedTitle: product.normalizedTitle || "",
    utmCampaign: toUtmSlug(product.normalizedTitle || product.title),
    price,
    priceInt: priceInt(price),
  };

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    return values[key] ?? "";
  });
}
