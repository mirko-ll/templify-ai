// Slot filling: for each requested slot, take the rotation's bucket, keep the
// candidates that pass every hard rule on that date, and shortlist the best.
// The shortlist's first entry is the deterministic pick; reasons.ts may let the
// LLM choose another entry of the same shortlist.

import { plannedBucketFor } from "./rotation";
import { activeSeasons, isOffSeason, seasonStatus } from "./seasons";
import { DAY, localDateOf, monthOf } from "./time";
import { groupsByBaseKey, type Pools } from "./pools";
import {
  BUCKETS,
  BUCKET_LABELS,
  type Bucket,
  type Candidate,
  type CatalogGroup,
  type EngineInput,
  type SendRecord,
  type ShortlistEntry,
  type SlotPick,
  type SlotRequest,
} from "./types";

export const SHORTLIST_SIZE = 5;
/** In-season products get this boost in the non-seasonal buckets. */
const IN_SEASON_BOOST = 1.2;
/**
 * Soft variety: outside best sellers (which are meant to be resent), a product
 * emailed in the last few weeks ranks lower, so the same FB winners don't come
 * back every 10 days just because their ranking is sticky.
 */
const RECENT_SEND_DAYS = 21;
const RECENT_SEND_FACTOR = 0.6;

/** A send with its local date, for the monthly cap and same-day checks. */
interface DatedSend extends SendRecord {
  localDate: string;
  category: string | null;
  /** Reserved by this run (not yet stored anywhere). */
  reserved?: boolean;
}

export interface PickContext {
  input: EngineInput;
  pools: Pools;
  minCountries: number;
  groupByKey: Map<string, CatalogGroup>;
  byBase: Map<string, CatalogGroup[]>;
  sends: DatedSend[];
}

export function createPickContext(input: EngineInput, pools: Pools): PickContext {
  const groupByKey = new Map(input.groups.map((g) => [g.groupKey, g]));
  const { timezone, rules } = input.settings;
  return {
    input,
    pools,
    minCountries: Math.max(1, Math.ceil(rules.minInStockCountryShare * input.eligibleCountries.length)),
    groupByKey,
    byBase: groupsByBaseKey(input.groups),
    sends: input.sends.map((s) => ({
      ...s,
      localDate: localDateOf(s.sendAt, timezone),
      category: groupByKey.get(s.groupKey)?.category ?? null,
    })),
  };
}

/** Countries the group can go to: the client's eligible countries where it is in stock. */
export function sellableCountries(group: CatalogGroup, eligible: string[]): string[] {
  const inStock = new Set(group.inStockCountries);
  return eligible.filter((code) => inStock.has(code));
}

/** A send to leave out of the rules — the slot's own current pick when re-checking it. */
export interface IgnoreSend {
  baseKey: string;
  sendAt: Date;
}

const SAME_SEND_MS = 90 * 60_000;

function isIgnored(send: SendRecord, ignore?: IgnoreSend): boolean {
  return (
    !!ignore &&
    send.baseKey === ignore.baseKey &&
    Math.abs(send.sendAt.getTime() - ignore.sendAt.getTime()) <= SAME_SEND_MS
  );
}

/** Why a product can't go out in this slot, or null when it can. */
export function blockReason(
  ctx: PickContext,
  group: CatalogGroup,
  slot: SlotRequest,
  bucket: Bucket,
  ignore?: IgnoreSend
): string | null {
  const { rules, seasons } = ctx.input.settings;
  if (group.status !== "ACTIVE") return "not active in the shop";
  if (sellableCountries(group, ctx.input.eligibleCountries).length < ctx.minCountries) return "out of stock";
  if (isOffSeason(group.tags, seasons, slot.date)) return "off season";
  if (bucket === "SEASONAL" && seasonStatus(group.tags, seasons, slot.date).inSeason.length === 0) {
    return "not in season";
  }
  const windowMs = rules.noRepeatDays * DAY;
  const month = monthOf(slot.date);
  let inMonth = 0;
  for (const send of ctx.sends) {
    if (send.baseKey !== group.baseKey || isIgnored(send, ignore)) continue;
    if (Math.abs(send.sendAt.getTime() - slot.sendAt.getTime()) < windowMs) return `sent within ${rules.noRepeatDays} days`;
    if (monthOf(send.localDate) === month) inMonth += 1;
  }
  if (inMonth >= rules.bestMaxPerMonth) return `already ${inMonth}× this month`;
  return null;
}

function sentRecently(ctx: PickContext, baseKey: string, slot: SlotRequest): boolean {
  const from = slot.sendAt.getTime() - RECENT_SEND_DAYS * DAY;
  return ctx.sends.some(
    (s) => s.baseKey === baseKey && s.sendAt.getTime() >= from && s.sendAt.getTime() < slot.sendAt.getTime()
  );
}

/** The candidate's group, or another variant of the same product that can go out. */
function resolveGroup(ctx: PickContext, candidate: Candidate, slot: SlotRequest, bucket: Bucket) {
  const preferred = ctx.groupByKey.get(candidate.groupKey);
  const variants = [preferred, ...(ctx.byBase.get(candidate.baseKey) ?? [])].filter(
    (g, i, arr): g is CatalogGroup => !!g && arr.indexOf(g) === i
  );
  for (const group of variants) {
    if (!blockReason(ctx, group, slot, bucket)) return group;
  }
  return null;
}

function toEntry(ctx: PickContext, candidate: Candidate, group: CatalogGroup, score: number): ShortlistEntry {
  return {
    ...candidate,
    groupKey: group.groupKey,
    score,
    title: group.title,
    imageUrl: group.imageUrl,
    category: group.category,
    countryCodes: sellableCountries(group, ctx.input.eligibleCountries),
  };
}

/** Ranked, rule-passing options for one slot of one bucket. */
export function shortlistFor(
  ctx: PickContext,
  bucket: Bucket,
  slot: SlotRequest,
  limit = SHORTLIST_SIZE
): ShortlistEntry[] {
  const { seasons } = ctx.input.settings;
  const dayCategories = new Set(
    ctx.sends.filter((s) => s.localDate === slot.date && s.category).map((s) => s.category as string)
  );
  const options: ShortlistEntry[] = [];
  const seenBase = new Set<string>();
  for (const candidate of ctx.pools[bucket]) {
    if (seenBase.has(candidate.baseKey)) continue;
    const group = resolveGroup(ctx, candidate, slot, bucket);
    if (!group) continue;
    seenBase.add(candidate.baseKey);
    let score = candidate.score;
    if (bucket !== "SEASONAL" && seasonStatus(group.tags, seasons, slot.date).inSeason.length > 0) {
      score *= IN_SEASON_BOOST;
    }
    if (bucket !== "BEST_SELLER" && sentRecently(ctx, group.baseKey, slot)) score *= RECENT_SEND_FACTOR;
    options.push(toEntry(ctx, candidate, group, score));
    // Enough to rank: the pool is sorted; boosts/penalties only reshuffle near neighbours.
    if (options.length >= limit * 8) break;
  }
  options.sort((a, b) => b.score - a.score);
  // Prefer a different category from the day's other email; fall back if all share it.
  const diverse = options.filter((o) => !o.category || !dayCategories.has(o.category));
  const rest = options.filter((o) => o.category && dayCategories.has(o.category));
  return [...diverse, ...rest].slice(0, limit);
}

/** Fallback order when a bucket has nothing: the other buckets by weight, highest first. */
export function bucketOrder(planned: Bucket, weights: Record<Bucket, number>): Bucket[] {
  const others = BUCKETS.filter((b) => b !== planned && (weights[b] ?? 0) > 0).sort(
    (a, b) => (weights[b] ?? 0) - (weights[a] ?? 0)
  );
  return [planned, ...others];
}

/** Record a pick so later slots in the same run respect the repeat and cap rules. */
export function reserve(ctx: PickContext, slot: SlotRequest, entry: ShortlistEntry) {
  ctx.sends.push({
    baseKey: entry.baseKey,
    groupKey: entry.groupKey,
    sendAt: slot.sendAt,
    source: "SLOT",
    localDate: slot.date,
    category: entry.category,
    reserved: true,
  });
}

/** Remove the given sends (slots being re-picked) so they no longer block anything. */
export function releaseSends(ctx: PickContext, released: IgnoreSend[]) {
  ctx.sends = ctx.sends.filter((send) => !released.some((r) => isIgnored(send, r)));
}

/** Fill `slots` in order. Each pick is reserved before the next slot is planned. */
export function planSlots(ctx: PickContext, slots: SlotRequest[]): SlotPick[] {
  const { rotation, rotationStart, weights, seasons } = ctx.input.settings;
  const picks: SlotPick[] = [];
  for (const slot of [...slots].sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime())) {
    const events: SlotPick["events"] = [];
    let planned: Bucket;
    if (slot.forceBucket) planned = slot.forceBucket;
    else {
      const planning = plannedBucketFor(rotation, rotationStart, seasons, slot.date, slot.slotIndex);
      planned = planning.bucket;
      if (planning.boostedBy) {
        events.push({
          type: "SEASON_BOOST",
          detail: `${planning.boostedBy.name} season: seasonal products get ${planning.boostedBy.boost}% of sends`,
        });
      }
    }
    let bucket = planned;
    let shortlist: ShortlistEntry[] = [];
    for (const option of bucketOrder(planned, weights)) {
      shortlist = shortlistFor(ctx, option, slot);
      if (shortlist.length) {
        bucket = option;
        break;
      }
      const why =
        option === "SEASONAL" && activeSeasons(seasons, slot.date).length === 0
          ? "no season is running"
          : "no product passes the rules";
      events.push({ type: "FALLBACK", detail: `${BUCKET_LABELS[option]}: ${why}` });
    }
    if (shortlist.length) reserve(ctx, slot, shortlist[0]);
    picks.push({ slot, plannedBucket: planned, bucket, shortlist, events });
  }
  return picks;
}
