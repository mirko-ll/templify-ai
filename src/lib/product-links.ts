import { extractProductGroupSlug, toUtmSlug } from "./product-grouping";

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

/**
 * Trailing offer code of a URL slug — the last token after dropping variant
 * suffixes (`-lp`), bundle counts (`-11`, `-1p1`) and localized "free" markers.
 * "…-cevapmaker" → "cevapmaker", "…-chopibox-2" → "chopibox",
 * "…-discoglo-11-gratis" → "discoglo". Used only as a fallback for the utm
 * value; the primary source is the offer code extracted from the title.
 */
function trailingSlugCode(slug: string): string {
  const tokens = decodeURIComponent(slug || "")
    .split("-")
    .filter(Boolean);
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1].toLowerCase();
    if (last === "lp" || /^\d+(?:p\d+)?$/.test(last) || FREE_SLUG_WORDS.has(last)) {
      tokens.pop();
    } else {
      break;
    }
  }
  return tokens[tokens.length - 1] || "";
}

/** Common trailing "free" markers seen in offer slugs (Latin scripts). */
const FREE_SLUG_WORDS = new Set([
  "gratis",
  "free",
  "gratuit",
  "gratuito",
  "gratuita",
  "gratuite",
  "omaggio",
  "kostenlos",
  "zdarma",
  "zadarmo",
  "besplatno",
  "brezplacno",
  "darmo",
  "nemokamai",
  "nemokama",
  "dovanu",
  "bezmaksas",
  "ingyen",
  "cadou",
  "ucretsiz",
  "bedava",
  "ilmainen",
]);

/**
 * The `utm_campaign` value for a product: its stable offer/brand code
 * (e.g. "cevapmaker", "discoglo", "sixpack"), slugified.
 *
 * The code is extracted from the title the same way the catalog groups
 * products, so every country's link for one product shares a single campaign
 * value — the report then aggregates by product instead of by each country's
 * localized title. Previously this used the normalized title, which is the
 * localized *description* (the text before the "|"), differs per country, and
 * collapses to an empty string for non-Latin titles.
 *
 * Falls back to the URL slug's trailing code, then the normalized title/title,
 * so a product whose title carries no detectable code still gets a value.
 */
function utmCampaignValue(
  title: string,
  normalizedTitle: string | null | undefined,
  slug: string
): string {
  return (
    toUtmSlug(extractProductGroupSlug(title || "")) ||
    toUtmSlug(trailingSlugCode(slug)) ||
    toUtmSlug(normalizedTitle || title || "")
  );
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

  const slug =
    listing.slug ||
    decodeURIComponent(url.pathname.replace(/\/$/, "").split("/").pop() || "");

  const values: Record<string, string> = {
    url: stripTrailingSlash(listing.url),
    rawUrl: listing.url,
    origin: url.origin,
    path: stripTrailingSlash(url.pathname),
    slug,
    countryCode: listing.countryCode || "",
    title: product.title,
    normalizedTitle: product.normalizedTitle || "",
    utmCampaign: utmCampaignValue(product.title, product.normalizedTitle, slug),
    price,
    priceInt: priceInt(price),
  };

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    return values[key] ?? "";
  });
}
