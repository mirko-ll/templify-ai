// Candidate pools: every product that could fill a slot of each bucket, with a
// score and the numbers behind it. Pools are built once per run from "now";
// date-dependent checks (stock, repeats, seasons) happen per slot in pick.ts.

import { seasonalTags } from "./seasons";
import { DAY } from "./time";
import { BUCKETS, type Bucket, type Candidate, type CatalogGroup, type EngineInput } from "./types";

/** Weights of the latest, previous and pre-previous sales report in the best-seller score. */
const REPORT_WEIGHTS = [1, 0.6, 0.3];
/** A product first seen this recently that sells like a top-N best seller "graduates". */
const GRADUATE_RANK = 20;
const GRADUATE_MAX_AGE_DAYS = 60;
/** A product first seen within this many days of the client's first sync isn't "new". */
const ONBOARDING_GUARD_DAYS = 3;
const RIVAL_NEW_LISTED_DAYS = 30;
const RIVAL_NEW_FIRST_AD_DAYS = 21;
/**
 * An older product whose very first own ad (as far as the Ad Library goes back)
 * started this recently counts as "relaunched" — new to the shop's customers.
 */
const RELAUNCH_FIRST_AD_DAYS = 30;

export type Pools = Record<Bucket, Candidate[]> & {
  /** baseKeys that moved from new products to best sellers. */
  graduated: Set<string>;
};

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function isoDay(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/** Group lookup by baseKey; the shortest group key (the single, not the 1+1) first. */
export function groupsByBaseKey(groups: CatalogGroup[]): Map<string, CatalogGroup[]> {
  const map = new Map<string, CatalogGroup[]>();
  for (const group of groups) {
    const list = map.get(group.baseKey) ?? [];
    list.push(group);
    map.set(group.baseKey, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.groupKey.length - b.groupKey.length);
  return map;
}

/** Past sends (ITEM) per baseKey, split by "YYYY-MM" of the UTC send date. */
function pastSendsByBase(input: EngineInput) {
  const total = new Map<string, number>();
  const byMonth = new Map<string, number>();
  for (const send of input.sends) {
    if (send.source !== "ITEM" || send.sendAt > input.now) continue;
    total.set(send.baseKey, (total.get(send.baseKey) ?? 0) + 1);
    const key = `${send.baseKey}|${send.sendAt.toISOString().slice(0, 7)}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }
  return { total, byMonth };
}

function bestSellerPool(input: EngineInput, byBase: Map<string, CatalogGroup[]>) {
  const months = [...new Set(input.reports.map((r) => monthKey(r.year, r.month)))].sort().reverse().slice(0, 3);
  const sends = pastSendsByBase(input);
  const groupByKey = new Map(input.groups.map((g) => [g.groupKey, g]));

  const perBase = new Map<
    string,
    { profit: number[]; orders: number[]; variantProfit: Map<string, number> }
  >();
  for (const entry of input.reports) {
    const index = months.indexOf(monthKey(entry.year, entry.month));
    const group = groupByKey.get(entry.groupKey);
    if (index < 0 || !group) continue;
    const base = group.baseKey;
    const row = perBase.get(base) ?? { profit: [0, 0, 0], orders: [0, 0, 0], variantProfit: new Map() };
    row.profit[index] += entry.profit;
    row.orders[index] += entry.orders;
    row.variantProfit.set(entry.groupKey, (row.variantProfit.get(entry.groupKey) ?? 0) + entry.profit);
    perBase.set(base, row);
  }

  const latestRanked = [...perBase.entries()]
    .map(([base, row]) => ({ base, profit: row.profit[0] }))
    .filter((x) => x.profit > 0)
    .sort((a, b) => b.profit - a.profit);
  const rankOf = new Map(latestRanked.map((x, i) => [x.base, i + 1]));
  const threshold = latestRanked[Math.min(GRADUATE_RANK, latestRanked.length) - 1]?.profit ?? Infinity;

  const graduated = new Set<string>();
  const candidates: Candidate[] = [];
  for (const [base, row] of perBase) {
    const score = row.profit.reduce((sum, p, i) => sum + p * REPORT_WEIGHTS[i], 0);
    if (score <= 0) continue;
    const variant = [...row.variantProfit.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const firstSeen = Math.min(...(byBase.get(base) ?? []).map((g) => g.firstSeenAt.getTime()));
    const isGraduate =
      row.profit[0] >= threshold && input.now.getTime() - firstSeen <= GRADUATE_MAX_AGE_DAYS * DAY;
    if (isGraduate) graduated.add(base);
    const sendsLatest = months[0] ? sends.byMonth.get(`${base}|${months[0]}`) ?? 0 : 0;
    candidates.push({
      bucket: "BEST_SELLER",
      groupKey: variant,
      baseKey: base,
      score,
      signals: {
        months,
        profit: row.profit.slice(0, months.length).map((p) => Math.round(p)),
        orders: row.orders.slice(0, months.length),
        rankLatest: rankOf.get(base) ?? null,
        sendsLatestMonth: sendsLatest,
        profitPerSendLatest: sendsLatest > 0 ? Math.round(row.profit[0] / sendsLatest) : null,
        ...(isGraduate ? { graduated: true, graduatedMonth: months[0] } : {}),
      },
    });
  }
  return { candidates, graduated };
}

function newProductPool(
  input: EngineInput,
  byBase: Map<string, CatalogGroup[]>,
  graduated: Set<string>
): Candidate[] {
  const { rules } = input.settings;
  const now = input.now.getTime();
  const sends = pastSendsByBase(input);
  const pastSendTimes = new Map<string, number[]>();
  for (const send of input.sends) {
    if (send.source !== "ITEM" || send.sendAt > input.now) continue;
    pastSendTimes.set(send.baseKey, [...(pastSendTimes.get(send.baseKey) ?? []), send.sendAt.getTime()]);
  }
  const guardUntil = input.firstSyncAt ? input.firstSyncAt.getTime() + ONBOARDING_GUARD_DAYS * DAY : -Infinity;

  const own = new Map<string, { firstSeen: number }>();
  for (const [base, groups] of byBase) {
    const firstSeen = Math.min(...groups.map((g) => g.firstSeenAt.getTime()));
    if (firstSeen < guardUntil) continue;
    if (now - firstSeen > rules.newWindowDays * DAY) continue;
    own.set(base, { firstSeen });
  }

  const rivals = new Map<string, Array<{ brand: string; listedSince: string | null; firstAdAt: string | null; activeAds: number; reach7d: number }>>();
  const ownAds = new Map<string, { activeAds: number; newAds7d: number; firstAdAt: number | null }>();
  for (const p of input.intel) {
    if (!p.baseKey) continue;
    if (p.isOwnBrand) {
      const cur = ownAds.get(p.baseKey) ?? { activeAds: 0, newAds7d: 0, firstAdAt: null };
      cur.activeAds += p.activeAds;
      cur.newAds7d += p.newAds7d;
      const first = p.firstAdAt?.getTime() ?? null;
      if (first !== null && (cur.firstAdAt === null || first < cur.firstAdAt)) cur.firstAdAt = first;
      ownAds.set(p.baseKey, cur);
      continue;
    }
    const listedNew = p.listedSince && now - p.listedSince.getTime() <= RIVAL_NEW_LISTED_DAYS * DAY;
    const adNew = p.firstAdAt && now - p.firstAdAt.getTime() <= RIVAL_NEW_FIRST_AD_DAYS * DAY;
    if (!listedNew && !adNew) continue;
    const list = rivals.get(p.baseKey) ?? [];
    if (!list.some((r) => r.brand === p.brandName)) {
      list.push({
        brand: p.brandName,
        listedSince: isoDay(p.listedSince),
        firstAdAt: isoDay(p.firstAdAt),
        activeAds: p.activeAds,
        reach7d: p.reach7d,
      });
    }
    rivals.set(p.baseKey, list);
  }

  // Relaunched: in the shop for a while, but its first own ad started recently.
  const relaunched = new Map<string, number>();
  for (const [base, ads] of ownAds) {
    if (own.has(base) || ads.firstAdAt === null) continue;
    if (now - ads.firstAdAt <= RELAUNCH_FIRST_AD_DAYS * DAY && ads.activeAds > 0) relaunched.set(base, ads.firstAdAt);
  }

  const candidates: Candidate[] = [];
  for (const base of new Set([...own.keys(), ...rivals.keys(), ...relaunched.keys()])) {
    if (graduated.has(base)) continue;
    const groups = byBase.get(base);
    if (!groups?.length) continue;
    const relaunchAt = relaunched.get(base) ?? null;
    // A relaunch is tested afresh: only emails since its first new ad count.
    const timesSent =
      relaunchAt !== null
        ? (pastSendTimes.get(base) ?? []).filter((t) => t >= relaunchAt).length
        : sends.total.get(base) ?? 0;
    if (timesSent >= rules.newMaxTests) continue;

    const ownEntry = own.get(base);
    const ageDays = ownEntry ? Math.floor((now - ownEntry.firstSeen) / DAY) : null;
    const rivalList = rivals.get(base) ?? [];
    const rivalReach = rivalList.reduce((s, r) => s + r.reach7d, 0);
    const ads = ownAds.get(base) ?? { activeAds: 0, newAds7d: 0, firstAdAt: null };
    const recency =
      ageDays !== null
        ? Math.max(0, 1 - ageDays / rules.newWindowDays)
        : relaunchAt !== null
          ? 0.75 * Math.max(0, 1 - (now - relaunchAt) / (RELAUNCH_FIRST_AD_DAYS * DAY))
          : 0;
    const score =
      2 * recency +
      1 * rivalList.length +
      0.25 * Math.log10(1 + rivalReach) +
      0.4 * Math.log1p(ads.activeAds) +
      0.3 * Math.log1p(ads.newAds7d) +
      (timesSent === 0 ? 0.5 : 0);

    candidates.push({
      bucket: "NEW_PRODUCT",
      groupKey: groups[0].groupKey,
      baseKey: base,
      score,
      signals: {
        firstSeenAt: ownEntry ? new Date(ownEntry.firstSeen).toISOString().slice(0, 10) : null,
        ageDays,
        ownFirstAdAt: ads.firstAdAt !== null ? new Date(ads.firstAdAt).toISOString().slice(0, 10) : null,
        ...(relaunchAt !== null
          ? { relaunched: true, inShopSince: new Date(Math.min(...groups.map((g) => g.firstSeenAt.getTime()))).toISOString().slice(0, 10) }
          : {}),
        rivals: rivalList.sort((a, b) => b.reach7d - a.reach7d),
        ownActiveAds: ads.activeAds,
        ownNewAds7d: ads.newAds7d,
        timesSent,
      },
    });
  }
  return candidates;
}

function fbWinnerPool(input: EngineInput, byBase: Map<string, CatalogGroup[]>): Candidate[] {
  const perBase = new Map<
    string,
    { brands: Map<string, { name: string; own: boolean; activeAds: number; reach7d: number; score: number }>; bestGroup: string | null; bestScore: number }
  >();
  for (const p of input.intel) {
    if (!p.baseKey || p.activeAds <= 0) continue;
    const row = perBase.get(p.baseKey) ?? { brands: new Map(), bestGroup: null, bestScore: -Infinity };
    const brand = row.brands.get(p.brandId) ?? { name: p.brandName, own: p.isOwnBrand, activeAds: 0, reach7d: 0, score: 0 };
    brand.activeAds += p.activeAds;
    brand.reach7d += p.reach7d;
    brand.score = Math.max(brand.score, p.score);
    row.brands.set(p.brandId, brand);
    if (p.score > row.bestScore) {
      row.bestScore = p.score;
      row.bestGroup = p.groupKey;
    }
    perBase.set(p.baseKey, row);
  }

  const candidates: Candidate[] = [];
  for (const [base, row] of perBase) {
    const groups = byBase.get(base);
    if (!groups?.length) continue;
    const brands = [...row.brands.values()].sort((a, b) => b.reach7d - a.reach7d);
    candidates.push({
      bucket: "FB_WINNER",
      groupKey: row.bestGroup ?? groups[0].groupKey,
      baseKey: base,
      score: row.bestScore + 0.5 * (brands.length - 1),
      signals: {
        brands: brands.map((b) => ({ name: b.name, own: b.own, activeAds: b.activeAds, reach7d: b.reach7d })),
        totalActiveAds: brands.reduce((s, b) => s + b.activeAds, 0),
        totalReach7d: brands.reduce((s, b) => s + b.reach7d, 0),
        intelScore: Math.round(row.bestScore * 100) / 100,
      },
    });
  }
  return candidates;
}

function seasonalPool(input: EngineInput, best: Candidate[], fb: Candidate[], fresh: Candidate[]): Candidate[] {
  const tags = seasonalTags(input.settings.seasons);
  const maxOf = (list: Candidate[]) => Math.max(1e-9, ...list.map((c) => c.score));
  const bestBy = new Map(best.map((c) => [c.baseKey, c]));
  const fbBy = new Map(fb.map((c) => [c.baseKey, c]));
  const newBy = new Map(fresh.map((c) => [c.baseKey, c]));
  const bestMax = maxOf(best);
  const fbMax = maxOf(fb);

  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const group of input.groups) {
    const groupTags = group.tags.filter((t) => tags.has(t));
    if (!groupTags.length || seen.has(group.groupKey)) continue;
    seen.add(group.groupKey);
    const b = bestBy.get(group.baseKey);
    const f = fbBy.get(group.baseKey);
    const n = newBy.get(group.baseKey);
    candidates.push({
      bucket: "SEASONAL",
      groupKey: group.groupKey,
      baseKey: group.baseKey,
      score: 0.2 + (b ? b.score / bestMax : 0) + (f ? f.score / fbMax : 0) + (n ? 0.5 : 0),
      signals: {
        seasonTags: groupTags,
        ...(b ? { profit: b.signals.profit, months: b.signals.months } : {}),
        ...(f ? { totalActiveAds: f.signals.totalActiveAds, totalReach7d: f.signals.totalReach7d, brands: f.signals.brands } : {}),
        ...(n ? { firstSeenAt: n.signals.firstSeenAt } : {}),
      },
    });
  }
  return candidates;
}

/** Stable pseudo-random 0…1 for a string (FNV-1a) — the discovery rotation. */
function hash01(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

/** Days a category has had no email (999 = never in the send history). */
function daysSinceCategory(input: EngineInput): Map<string, number> {
  const groupCategory = new Map(input.groups.map((g) => [g.groupKey, g.category]));
  const last = new Map<string, number>();
  for (const send of input.sends) {
    const category = groupCategory.get(send.groupKey);
    if (!category || send.sendAt > input.now) continue;
    last.set(category, Math.max(last.get(category) ?? 0, send.sendAt.getTime()));
  }
  const out = new Map<string, number>();
  for (const [category, at] of last) out.set(category, Math.floor((input.now.getTime() - at) / DAY));
  return out;
}

/**
 * Discovery: good catalog products that have never been emailed and have no
 * other claim (not a best seller, not new). Ranked by how widely they're
 * stocked, how long their category has gone without an email, any ad history,
 * and a weekly rotation — so each week different products come up and the
 * bucket works its way through the long tail instead of repeating one list.
 */
function discoveryPool(
  input: EngineInput,
  byBase: Map<string, CatalogGroup[]>,
  taken: Set<string>
): Candidate[] {
  const emailed = new Set(input.sends.filter((s) => s.source === "ITEM").map((s) => s.baseKey));
  const categoryGap = daysSinceCategory(input);
  const advertised = new Map<string, number>();
  for (const p of input.intel) if (p.baseKey) advertised.set(p.baseKey, (advertised.get(p.baseKey) ?? 0) + p.totalAds);
  const countries = Math.max(1, input.eligibleCountries.length);
  const eligible = new Set(input.eligibleCountries);
  const week = Math.floor(input.now.getTime() / (7 * DAY));

  const candidates: Candidate[] = [];
  for (const [base, groups] of byBase) {
    if (emailed.has(base) || taken.has(base)) continue;
    const group = groups.find((g) => g.status === "ACTIVE" && g.imageUrl && g.refPriceEur);
    if (!group) continue;
    const inStock = group.inStockCountries.filter((c) => eligible.has(c)).length;
    if (!inStock) continue;
    const gap = group.category ? categoryGap.get(group.category) ?? 999 : 30;
    const ads = advertised.get(base) ?? 0;
    const score =
      1.0 * (inStock / countries) +
      0.8 * Math.min(1, gap / 30) +
      (ads > 0 ? 0.3 : 0) +
      0.9 * hash01(`${base}:${week}`);
    candidates.push({
      bucket: "DISCOVERY",
      groupKey: group.groupKey,
      baseKey: base,
      score,
      signals: {
        neverEmailed: true,
        inShopSince: new Date(Math.min(...groups.map((g) => g.firstSeenAt.getTime()))).toISOString().slice(0, 10),
        inStockCountries: inStock,
        eligibleCountries: countries,
        category: group.category,
        categoryGapDays: gap >= 999 ? null : gap,
        ...(ads > 0 ? { pastAds: ads } : {}),
      },
    });
  }
  return candidates;
}

/** Build every bucket's pool, each sorted best first. */
export function buildPools(input: EngineInput): Pools {
  const byBase = groupsByBaseKey(input.groups);
  const { candidates: best, graduated } = bestSellerPool(input, byBase);
  const fresh = newProductPool(input, byBase, graduated);
  const fb = fbWinnerPool(input, byBase);
  const seasonal = seasonalPool(input, best, fb, fresh);
  const discovery = discoveryPool(input, byBase, new Set([...best, ...fresh, ...fb].map((c) => c.baseKey)));
  const pools = {
    BEST_SELLER: best,
    NEW_PRODUCT: fresh,
    FB_WINNER: fb,
    SEASONAL: seasonal,
    DISCOVERY: discovery,
    graduated,
  } as Pools;
  for (const bucket of BUCKETS) pools[bucket].sort((a, b) => b.score - a.score);
  return pools;
}
