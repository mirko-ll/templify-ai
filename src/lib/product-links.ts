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
