/**
 * Shared normalization for a product source's `config` JSON.
 *
 * Used by both the create (POST) and edit (PATCH) routes so a source's stored
 * config always has a consistent, clamped shape regardless of where it came
 * from. The config carries two concerns: how products are *discovered/crawled*
 * and how campaign tracking *links* are built.
 */

export type RenderMode = "static" | "browser";

export interface ProductSourceConfig {
  // Discovery / crawling
  productUrlPatterns: string[];
  crawlUrlPatterns: string[];
  excludeUrlPatterns: string[];
  maxPages: number;
  maxCrawlPages: number;
  renderMode: RenderMode;
  scrollRounds: number;
  scrollDelayMs: number;
  loadMoreSelector: string;
  loadMoreClickLimit: number;
  loadMoreDelayMs: number;
  useSitemap: boolean;
  sitemapUrls: string[];
  maxSitemapPages: number;
  // Campaign links
  campaignUrlTemplate: string;
  countryCampaignUrlTemplates: Record<string, string>;
  domainCampaignUrlTemplates: Record<string, string>;
  defaultPrice: string;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(Math.floor(value), max))
    : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Normalize a "{ KEY: template }" map, trimming and transforming each key. */
function templateMap(
  value: unknown,
  transformKey: (key: string) => string
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, template]) => typeof template === "string" && template.trim())
      .map(([key, template]) => [transformKey(key.trim()), String(template).trim()])
  );
}

/**
 * Validate + clamp a raw config value. Returns null when the value isn't an
 * object (so callers can store `undefined` and leave config unset).
 */
export function normalizeProductSourceConfig(
  value: unknown
): ProductSourceConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;

  return {
    productUrlPatterns: stringArray(raw.productUrlPatterns),
    crawlUrlPatterns: stringArray(raw.crawlUrlPatterns),
    excludeUrlPatterns: stringArray(raw.excludeUrlPatterns),
    maxPages: clampInt(raw.maxPages, 10000, 1, 10000),
    maxCrawlPages: clampInt(raw.maxCrawlPages, 60, 1, 300),
    renderMode: raw.renderMode === "browser" ? "browser" : "static",
    scrollRounds: clampInt(raw.scrollRounds, 3, 0, 20),
    scrollDelayMs: clampInt(raw.scrollDelayMs, 1200, 250, 10000),
    loadMoreSelector:
      typeof raw.loadMoreSelector === "string" ? raw.loadMoreSelector.trim() : "",
    loadMoreClickLimit: clampInt(raw.loadMoreClickLimit, 10, 0, 100),
    loadMoreDelayMs: clampInt(raw.loadMoreDelayMs, 1500, 250, 15000),
    useSitemap: typeof raw.useSitemap === "boolean" ? raw.useSitemap : true,
    sitemapUrls: stringArray(raw.sitemapUrls),
    maxSitemapPages: clampInt(raw.maxSitemapPages, 30, 1, 200),
    campaignUrlTemplate:
      typeof raw.campaignUrlTemplate === "string" ? raw.campaignUrlTemplate.trim() : "",
    countryCampaignUrlTemplates: templateMap(raw.countryCampaignUrlTemplates, (key) =>
      key.toUpperCase()
    ),
    domainCampaignUrlTemplates: templateMap(raw.domainCampaignUrlTemplates, (key) =>
      key.toLowerCase().replace(/^www\./, "")
    ),
    defaultPrice: typeof raw.defaultPrice === "string" ? raw.defaultPrice.trim() : "",
  };
}
