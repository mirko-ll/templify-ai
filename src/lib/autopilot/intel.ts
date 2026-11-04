// Competitor intel from oadmin (Ad Library products of the client's own brand
// and its rivals), matched to the client's catalog. Matching is exact, never
// fuzzy: the intel `token` is the same offer code the client's group keys use
// ("BUGBUSTER"), and `slug:` keys are product-page slugs shared with the
// client's own listings. On Superzebra's data this matches ~99% of products
// that have live ads.

import { baseKeyOf, normalizeSlug } from "./keys";
import type { CatalogGroup, IntelMapping, IntelProduct } from "./types";

/** One row of oadmin's GET /integrations/templaito/products. */
export interface IntelExportRow {
  brandId: string;
  brandName: string | null;
  productKey: string;
  token: string | null;
  keys: string[];
  name: string | null;
  englishName: string | null;
  imageUrl: string | null;
  activeAds: number | null;
  totalAds: number | null;
  newAds7d: number | null;
  newAds30d: number | null;
  reach: number | null;
  reach7d: number | null;
  score: number | null;
  listedSince: string | Date | null;
  listedSinceSource: string | null;
  firstAdAt: string | Date | null;
  lastAdAt: string | Date | null;
}

export interface IntelExport {
  products: IntelExportRow[];
  meta: { count: number; lastAggregatedAt: Record<string, string> };
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Fetch the export for the mapped brands. Throws on HTTP or config errors. */
export async function fetchIntelExport(
  mapping: IntelMapping,
  opts: { baseUrl?: string; apiKey?: string; fetchImpl?: typeof fetch } = {}
): Promise<IntelExport> {
  const baseUrl = opts.baseUrl ?? process.env.OADMIN_INTEL_URL;
  const apiKey = opts.apiKey ?? process.env.OADMIN_INTEL_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("OADMIN_INTEL_URL / OADMIN_INTEL_API_KEY are not set");
  const brandIds = [mapping.ownBrandId, ...mapping.competitorBrandIds].filter(Boolean) as string[];
  if (!brandIds.length) return { products: [], meta: { count: 0, lastAggregatedAt: {} } };

  const url = `${baseUrl.replace(/\/+$/, "")}/integrations/templaito/products?brandIds=${encodeURIComponent(brandIds.join(","))}`;
  const response = await (opts.fetchImpl ?? fetch)(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`oadmin intel export failed: HTTP ${response.status}`);
  return (await response.json()) as IntelExport;
}

/** Fetch oadmin's tracked brands (for the settings dropdowns). */
export async function fetchIntelBrands(
  opts: { baseUrl?: string; apiKey?: string } = {}
): Promise<Array<{ id: string; name: string; source: string }>> {
  const baseUrl = opts.baseUrl ?? process.env.OADMIN_INTEL_URL;
  const apiKey = opts.apiKey ?? process.env.OADMIN_INTEL_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("OADMIN_INTEL_URL / OADMIN_INTEL_API_KEY are not set");
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/integrations/templaito/brands`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`oadmin brands failed: HTTP ${response.status}`);
  return ((await response.json()) as { brands: Array<{ id: string; name: string; source: string }> }).brands;
}

/**
 * Match export rows to catalog groups: token → baseKey first, then any `slug:`
 * key against the client's listing slugs. Unmatched rows are kept (groupKey
 * null) so the settings page can show the match rate.
 */
export function matchIntel(
  rows: IntelExportRow[],
  groups: CatalogGroup[],
  mapping: IntelMapping
): IntelProduct[] {
  // Several groups can share a baseKey ("FOILBLISS", "FOILBLISS 1+1"); prefer the single.
  const byBase = new Map<string, CatalogGroup>();
  const bySlug = new Map<string, CatalogGroup>();
  for (const group of groups) {
    const current = byBase.get(group.baseKey);
    if (!current || group.groupKey.length < current.groupKey.length) byBase.set(group.baseKey, group);
    for (const slug of group.slugs) if (!bySlug.has(slug)) bySlug.set(slug, group);
  }

  return rows.map((row) => {
    let group: CatalogGroup | undefined;
    if (row.token) group = byBase.get(baseKeyOf(row.token));
    if (!group) {
      for (const key of row.keys ?? []) {
        if (!key.startsWith("slug:")) continue;
        group = bySlug.get(normalizeSlug(key.slice(5)));
        if (group) break;
      }
    }
    return {
      brandId: row.brandId,
      brandName: row.brandName ?? "?",
      isOwnBrand: row.brandId === mapping.ownBrandId,
      productKey: row.productKey,
      token: row.token,
      name: row.englishName || row.name,
      baseKey: group?.baseKey ?? null,
      groupKey: group?.groupKey ?? null,
      activeAds: row.activeAds ?? 0,
      totalAds: row.totalAds ?? 0,
      newAds7d: row.newAds7d ?? 0,
      newAds30d: row.newAds30d ?? 0,
      reach: row.reach ?? 0,
      reach7d: row.reach7d ?? 0,
      score: row.score ?? 0,
      listedSince: toDate(row.listedSince),
      listedSinceSource: row.listedSinceSource,
      firstAdAt: toDate(row.firstAdAt),
      lastAdAt: toDate(row.lastAdAt),
      imageUrl: row.imageUrl,
    };
  });
}

/** Share of rows with live ads that matched a catalog group, per brand. */
export function intelMatchStats(products: IntelProduct[]) {
  const stats = new Map<string, { brandName: string; active: number; matched: number }>();
  for (const p of products) {
    if (p.activeAds <= 0) continue;
    const entry = stats.get(p.brandId) ?? { brandName: p.brandName, active: 0, matched: 0 };
    entry.active += 1;
    if (p.groupKey) entry.matched += 1;
    stats.set(p.brandId, entry);
  }
  return [...stats.entries()].map(([brandId, s]) => ({ brandId, ...s }));
}
