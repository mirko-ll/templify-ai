// Loads what the picking engine needs for one client with plain SELECTs. The
// SQL runner is injected so the app (Prisma $queryRawUnsafe) and the read-only
// dry-run script (mysql2 in a READ ONLY transaction) share the same queries.

import { parsePriceNumber } from "@/lib/price-number";
import { baseKeyOf, normalizeSlug } from "./keys";
import type { CatalogGroup, EngineInput, ReportEntry, SendRecord } from "./types";

export type SqlQuery = (sql: string, params?: unknown[]) => Promise<any[]>;

/** Prefer these countries' titles for display / the LLM (readable Latin-script copy). */
const TITLE_COUNTRIES = ["SI", "HR", "SK", "CZ", "IT", "ES", "DE"];
const STATUS_RANK: Record<string, number> = { ACTIVE: 3, POSSIBLY_UNAVAILABLE: 2, ARCHIVED: 1 };
const PRICE_SAMPLE_DAYS = 90;
const SEND_LOOKBACK_DAYS = 400;
const MAX_RESEND_HOPS = 3;

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * A listing's shop price as a number, or null when the scraped text isn't a
 * price. Some pages put the shipping fee in the sale-price slot ("2,99 €
 * doprava", "3,49 € spedizione"); real prices end at the currency or a unit
 * ("12,99 € /kus"), so a trailing word without "/" is rejected.
 */
export function listingPrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const tail = text.replace(/^[^\d]*[\d.,\s]+/, "").replace(/€|EUR/gi, "").trim();
  if (/\p{L}/u.test(tail) && !tail.includes("/")) return null;
  return parsePriceNumber(text);
}

function isEuroListing(listing: { currency: string | null; salePrice: string | null; priceRaw: string | null }) {
  const iso = listing.currency?.trim().toUpperCase();
  if (iso) return iso === "EUR";
  return /€|\bEUR\b/.test(`${listing.salePrice ?? ""} ${listing.priceRaw ?? ""}`);
}

export async function loadEligibleCountries(query: SqlQuery, clientId: string): Promise<string[]> {
  const rows = await query(
    "SELECT countryCode FROM ClientCountryConfig WHERE clientId = ? AND isActive = 1 AND mailingListId IS NOT NULL",
    [clientId]
  );
  return [...new Set(rows.map((r) => String(r.countryCode).toUpperCase()))].sort();
}

export async function loadCatalogGroups(query: SqlQuery, clientId: string): Promise<CatalogGroup[]> {
  const products = await query(
    `SELECT id, groupKey, title, status, category, firstSeenAt, bestImageUrl,
            JSON_EXTRACT(metadata, '$.extraction.categories') AS cats
       FROM Product WHERE clientId = ? AND groupKey IS NOT NULL`,
    [clientId]
  );
  const listings = await query(
    "SELECT productId, countryCode, availability, salePrice, priceRaw, currency, slug FROM ProductListing WHERE clientId = ?",
    [clientId]
  );
  const listingsByProduct = new Map<string, any[]>();
  for (const listing of listings) {
    const list = listingsByProduct.get(listing.productId) ?? [];
    list.push(listing);
    listingsByProduct.set(listing.productId, list);
  }

  type Acc = {
    groupKey: string;
    titles: Map<string, string>;
    anyTitle: string;
    imageUrl: string | null;
    status: string;
    tags: Set<string>;
    categories: Map<string, number>;
    firstSeenAt: Date;
    inStock: Set<string>;
    prices: number[];
    slugs: Set<string>;
  };
  const groups = new Map<string, Acc>();
  for (const product of products) {
    const key = String(product.groupKey);
    const acc: Acc = groups.get(key) ?? {
      groupKey: key,
      titles: new Map(),
      anyTitle: product.title,
      imageUrl: null,
      status: "ARCHIVED",
      tags: new Set(),
      categories: new Map(),
      firstSeenAt: toDate(product.firstSeenAt) ?? new Date(),
      inStock: new Set(),
      prices: [],
      slugs: new Set(),
    };
    if ((STATUS_RANK[product.status] ?? 0) > (STATUS_RANK[acc.status] ?? 0)) acc.status = product.status;
    const seen = toDate(product.firstSeenAt);
    if (seen && seen < acc.firstSeenAt) acc.firstSeenAt = seen;
    if (!acc.imageUrl && product.bestImageUrl) acc.imageUrl = product.bestImageUrl;
    if (product.category) {
      const cat = String(product.category).toLowerCase();
      acc.tags.add(cat);
      acc.categories.set(cat, (acc.categories.get(cat) ?? 0) + 1);
    }
    const cats = parseJson(product.cats);
    if (Array.isArray(cats)) for (const c of cats) if (typeof c === "string" && c.trim()) acc.tags.add(c.trim().toLowerCase());

    for (const listing of listingsByProduct.get(product.id) ?? []) {
      const country = String(listing.countryCode ?? "").toUpperCase();
      if (country && !acc.titles.has(country)) acc.titles.set(country, product.title);
      if (listing.slug) acc.slugs.add(normalizeSlug(String(listing.slug)));
      if (listing.availability !== "IN_STOCK" || product.status !== "ACTIVE") continue;
      if (country) acc.inStock.add(country);
      if (isEuroListing(listing)) {
        const price = listingPrice(listing.salePrice) ?? listingPrice(listing.priceRaw);
        if (price) acc.prices.push(price);
      }
    }
    groups.set(key, acc);
  }

  return [...groups.values()].map((acc) => ({
    groupKey: acc.groupKey,
    baseKey: baseKeyOf(acc.groupKey),
    title: TITLE_COUNTRIES.map((c) => acc.titles.get(c)).find(Boolean) ?? acc.anyTitle,
    imageUrl: acc.imageUrl,
    status: acc.status,
    tags: [...acc.tags],
    category: [...acc.categories.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    firstSeenAt: acc.firstSeenAt,
    inStockCountries: [...acc.inStock].sort(),
    refPriceEur: median(acc.prices),
    slugs: [...acc.slugs],
  }));
}

interface PlanItemRow {
  groupKey: string | null;
  sendDate: unknown;
  status: string;
  priceOverride: string | null;
  campaignId: string | null;
  resendSource: string | null;
}

async function loadPlanItems(query: SqlQuery, clientId: string, now: Date): Promise<PlanItemRow[]> {
  const since = new Date(now.getTime() - SEND_LOOKBACK_DAYS * 86_400_000);
  const rows = await query(
    `SELECT i.groupKey, i.sendDate, i.status, i.priceOverride, i.campaignId,
            JSON_UNQUOTE(JSON_EXTRACT(i.productSnapshot, '$.resend.sourceCampaignId')) AS resendSource
       FROM CampaignPlanItem i JOIN CampaignPlan p ON p.id = i.planId
      WHERE p.clientId = ? AND p.status <> 'CANCELLED' AND i.sendDate IS NOT NULL AND i.sendDate >= ?`,
    [clientId, since]
  );
  return rows.map((r) => ({
    ...r,
    resendSource: r.resendSource && r.resendSource !== "null" ? String(r.resendSource) : null,
  }));
}

/** Every planned or sent email as a SendRecord; resends count as their original product. */
export function sendsFromItems(items: PlanItemRow[], now: Date): SendRecord[] {
  const groupByCampaign = new Map<string, string>();
  const resendByCampaign = new Map<string, string>();
  for (const item of items) {
    if (!item.campaignId) continue;
    if (item.groupKey) groupByCampaign.set(item.campaignId, item.groupKey);
    if (item.resendSource) resendByCampaign.set(item.campaignId, item.resendSource);
  }
  const resolve = (item: PlanItemRow): string | null => {
    let groupKey = item.groupKey;
    let source = item.resendSource;
    for (let hop = 0; source && hop < MAX_RESEND_HOPS; hop++) {
      groupKey = groupByCampaign.get(source) ?? null;
      source = resendByCampaign.get(source) ?? null;
    }
    return groupKey && !groupKey.startsWith("resend:") ? groupKey : null;
  };

  const out: SendRecord[] = [];
  for (const item of items) {
    const sendAt = toDate(item.sendDate);
    if (!sendAt) continue;
    if (item.status === "FAILED" && sendAt < now) continue; // never went out
    const groupKey = resolve(item);
    if (!groupKey) continue;
    out.push({ baseKey: baseKeyOf(groupKey), groupKey, sendAt, source: "ITEM" });
  }
  return out;
}

export async function loadReports(query: SqlQuery, clientId: string): Promise<ReportEntry[]> {
  const reports = await query(
    "SELECT year, month FROM ProductPerformanceReport WHERE clientId = ? ORDER BY year DESC, month DESC LIMIT 3",
    [clientId]
  );
  if (!reports.length) return [];
  const where = reports.map(() => "(year = ? AND month = ?)").join(" OR ");
  const rows = await query(
    `SELECT year, month, groupKey, profit, orders, revenue FROM ProductPerformanceEntry
      WHERE clientId = ? AND groupKey IS NOT NULL AND (${where})`,
    [clientId, ...reports.flatMap((r) => [r.year, r.month])]
  );
  return rows.map((r) => ({
    year: Number(r.year),
    month: Number(r.month),
    groupKey: String(r.groupKey),
    profit: Number(r.profit) || 0,
    orders: Number(r.orders) || 0,
    revenue: Number(r.revenue) || 0,
  }));
}

export async function loadFirstSyncAt(query: SqlQuery, clientId: string): Promise<Date | null> {
  const rows = await query("SELECT MIN(startedAt) AS firstSync FROM ProductSyncRun WHERE clientId = ?", [clientId]);
  return toDate(rows[0]?.firstSync);
}

/** Months need at least this many orders for a trustworthy cost per order. */
const COST_MIN_ORDERS = 5;

/**
 * Cost per order in email-price euros, per group: in a report month the email
 * went out at price p and earned `profit` of `revenue`, so the rest of each
 * euro of price is cost — cost ≈ p × (1 − profit ÷ revenue). Works the same
 * for single products and 1+1 bundles (revenue scales with the offer price).
 * The latest month with enough orders wins.
 */
export function costsFromReports(
  reports: ReportEntry[],
  items: Array<{ groupKey: string | null; sendDate: unknown; priceOverride: string | null }>,
  now: Date
): Map<string, { cost: number; month: string }> {
  const monthPrices = new Map<string, number[]>();
  for (const item of items) {
    const at = toDate(item.sendDate);
    const price = parsePriceNumber(item.priceOverride);
    if (!at || !price || !item.groupKey || at > now) continue;
    const key = `${item.groupKey}|${at.toISOString().slice(0, 7)}`;
    monthPrices.set(key, [...(monthPrices.get(key) ?? []), price]);
  }
  const costs = new Map<string, { cost: number; month: string }>();
  const latestFirst = [...reports].sort((a, b) => b.year - a.year || b.month - a.month);
  for (const entry of latestFirst) {
    if (costs.has(entry.groupKey)) continue;
    if (entry.orders < COST_MIN_ORDERS || !entry.revenue || entry.revenue <= 0 || entry.profit >= entry.revenue) continue;
    const month = `${entry.year}-${String(entry.month).padStart(2, "0")}`;
    const prices = monthPrices.get(`${entry.groupKey}|${month}`);
    if (!prices?.length) continue;
    const price = prices.reduce((a, b) => a + b, 0) / prices.length;
    const cost = price * (1 - entry.profit / entry.revenue);
    if (cost > 0) costs.set(entry.groupKey, { cost, month });
  }
  return costs;
}

/** Everything except settings and intel (those come from the config row and oadmin). */
export async function loadEngineData(
  query: SqlQuery,
  clientId: string,
  now: Date
): Promise<Omit<EngineInput, "settings" | "intel" | "now">> {
  const [eligibleCountries, groups, items, reports, firstSyncAt] = await Promise.all([
    loadEligibleCountries(query, clientId),
    loadCatalogGroups(query, clientId),
    loadPlanItems(query, clientId, now),
    loadReports(query, clientId),
    loadFirstSyncAt(query, clientId),
  ]);

  const groupByKey = new Map(groups.map((g) => [g.groupKey, g]));
  const lastPrices = new Map<string, { price: string; groupKey: string; at: Date }>();
  const priceSamples: EngineInput["priceSamples"] = [];
  for (const item of items) {
    const at = toDate(item.sendDate);
    const price = item.priceOverride?.trim();
    if (!at || !price || !item.groupKey) continue;
    const current = lastPrices.get(item.groupKey);
    if (!current || at > current.at) lastPrices.set(item.groupKey, { price, groupKey: item.groupKey, at });
    const ref = groupByKey.get(item.groupKey)?.refPriceEur;
    const value = parsePriceNumber(price);
    if (ref && value && now.getTime() - at.getTime() <= PRICE_SAMPLE_DAYS * 86_400_000) {
      priceSamples.push({ price: value, refPriceEur: ref });
    }
  }

  return {
    eligibleCountries,
    groups,
    sends: sendsFromItems(items, now),
    reports,
    firstSyncAt,
    lastPrices,
    priceSamples,
    costs: costsFromReports(reports, items, now),
    // Filled from stored SqualoMail stats and PriceTest rows by the app (store.ts).
    clickHistory: new Map(),
    priceTests: { active: new Set(), recent: new Set(), revertedTo: new Map() },
  };
}
