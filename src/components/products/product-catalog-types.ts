import type { ProductSourceConfig } from "@/lib/product-source-config";

export type { ProductSourceConfig };

export interface ProductSyncRun {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  discoveredCount: number;
  createdCount: number;
  updatedCount: number;
  missingCount: number;
  failedCount: number;
  errorMessage?: string | null;
}

export interface ProductSource {
  id: string;
  name: string | null;
  url: string;
  countryCode: string | null;
  crawlDepth: number;
  isEnabled: boolean;
  config: ProductSourceConfig | null;
  lastSyncedAt: string | null;
  syncRuns: ProductSyncRun[];
}

export interface ProductListing {
  id: string;
  countryCode: string | null;
  url: string;
  priceRaw: string | null;
  regularPrice: string | null;
  salePrice: string | null;
  currency: string | null;
  availability: string;
}

export interface ProductImage {
  id: string;
  url: string;
  rank: number;
}

export interface Product {
  id: string;
  title: string;
  description: string | null;
  bestImageUrl: string | null;
  status: string;
  lastSeenAt: string | null;
  listings: ProductListing[];
  images: ProductImage[];
}

export interface CampaignPlan {
  id: string;
  name: string;
  month: number;
  year: number;
  mode: "MANUAL" | "ASSISTED";
  status: string;
  items: Array<{
    id: string;
    type: string;
    /** Denormalized product data captured at plan time (title is SI-preferred). */
    productSnapshot?: {
      title?: string | null;
      slug?: string | null;
    } | null;
    product?: {
      id: string;
      title: string;
      bestImageUrl: string | null;
    } | null;
  }>;
}

export interface SourceFormState {
  name: string;
  url: string;
  countryCode: string;
  campaignUrlTemplate: string;
  countryCampaignUrlTemplates: string;
  domainCampaignUrlTemplates: string;
  defaultPrice: string;
}

export const defaultSourceForm: SourceFormState = {
  name: "",
  url: "",
  countryCode: "",
  campaignUrlTemplate: "",
  countryCampaignUrlTemplates: "",
  domainCampaignUrlTemplates: "",
  defaultPrice: "",
};

/** One parsed line of the bulk source paste. */
export interface BulkSourceRow {
  /** The raw input line — round-tripped back into the textarea on failure. */
  line: string;
  /** Final source URL (scheme + sitemap path applied). Null = unparseable. */
  url: string | null;
  hostname: string | null;
  /** Detected or explicit ISO country code, "" when nothing matched. */
  countryCode: string;
}

/** 2-letter TLDs that aren't usable as a country (or need remapping). */
const TLD_NOT_A_COUNTRY = new Set(["eu"]);
const TLD_COUNTRY_REMAP: Record<string, string> = { UK: "GB" };

function detectCountry(url: URL): string {
  const labels = url.hostname.toLowerCase().split(".");
  const tld = labels[labels.length - 1];
  if (tld.length === 2 && !TLD_NOT_A_COUNTRY.has(tld)) {
    const code = tld.toUpperCase();
    return TLD_COUNTRY_REMAP[code] ?? code;
  }
  // Country shops on a generic TLD: si.shop.com or shop.com/si/…
  const sub = labels[0];
  if (labels.length > 2 && /^[a-z]{2}$/.test(sub) && sub !== "ww") {
    return sub.toUpperCase();
  }
  const segment = url.pathname.split("/").filter(Boolean)[0] ?? "";
  if (/^[a-z]{2}$/i.test(segment)) return segment.toUpperCase();
  return "";
}

/**
 * Parse the bulk-add textarea: one shop per line, either a bare domain or a
 * full URL, with an optional explicit country after it ("superzebra.com SI").
 * The country is otherwise detected from the ccTLD (".si" → SI, ".uk" → GB),
 * a 2-letter subdomain, or a 2-letter first path segment. Bare domains get
 * the shared sitemap path appended.
 */
export function parseBulkSourceLines(
  text: string,
  sitemapPath: string
): BulkSourceRow[] {
  const path = sitemapPath.trim()
    ? `/${sitemapPath.trim().replace(/^\/+/, "")}`
    : "";
  return linesToArray(text).map((line) => {
    const [rawUrl, ...rest] = line.split(/\s+/);
    const explicit = rest.find((token) => /^[a-z]{2}$/i.test(token));
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl)
      ? rawUrl
      : `https://${rawUrl}`;
    let url: URL;
    try {
      url = new URL(withScheme);
      if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) {
        throw new Error("not a web URL");
      }
    } catch {
      return { line, url: null, hostname: null, countryCode: "" };
    }
    const countryCode = explicit?.toUpperCase() ?? detectCountry(url);
    if (path && (url.pathname === "/" || !url.pathname) && !url.search) {
      url.pathname = path;
    }
    return { line, url: url.toString(), hostname: url.hostname, countryCode };
  });
}

/** Parse "KEY=value" lines into a record, transforming each key. */
export function parseTemplateOverrides(
  value: string,
  transformKey: (key: string) => string
): Record<string, string> {
  return Object.fromEntries(
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex === -1) return null;
        const key = transformKey(line.slice(0, separatorIndex).trim());
        const template = line.slice(separatorIndex + 1).trim();
        return key && template ? [key, template] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry))
  );
}

/** Render a "{ KEY: value }" map as editable "KEY=value" lines. */
export function recordToLines(record: Record<string, string> | undefined | null): string {
  if (!record) return "";
  return Object.entries(record)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

/** Split a textarea of one-value-per-line into a trimmed, non-empty array. */
export function linesToArray(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Render an array as one-value-per-line text for a textarea. */
export function arrayToLines(value: string[] | undefined | null): string {
  return Array.isArray(value) ? value.join("\n") : "";
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat("sl-SI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
