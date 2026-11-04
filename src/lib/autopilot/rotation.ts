import { activeSeasons } from "./seasons";
import { daysBetween } from "./time";
import { BUCKETS, type Bucket, type Season } from "./types";

export const ROTATION_WEEKS = 4;
export const DAYS_PER_WEEK = 7;

/**
 * The boss's mix: 50% best sellers, about 30% new products (25% + 5% discovery
 * of never-emailed catalog products), the rest FB winners and seasonal.
 */
export const DEFAULT_WEIGHTS: Record<Bucket, number> = {
  BEST_SELLER: 50,
  NEW_PRODUCT: 25,
  FB_WINNER: 15,
  SEASONAL: 5,
  DISCOVERY: 5,
};

const B: Bucket = "BEST_SELLER";
const N: Bucket = "NEW_PRODUCT";
const F: Bucket = "FB_WINNER";
const S: Bucket = "SEASONAL";
const D: Bucket = "DISCOVERY";

/**
 * Default grid for two daily sends, after the boss's 4-week example (sell-out
 * replaced by FB winners / seasonal): every morning resends a best seller,
 * evenings test — W1 new products, W2 and W4 FB winners mixed with new
 * products, W3 seasonal mixed with new products, plus one discovery evening in
 * W1, W3 and W4. 28 / 14 / 8 / 3 / 3 of 56 sends ≈ the 50 / 25 / 15 / 5 / 5 mix.
 */
const DEFAULT_TWO_SLOT_GRID: Bucket[][][] = [
  [[B, N], [B, N], [B, N], [B, D], [B, N], [B, N], [B, N]],
  [[B, F], [B, N], [B, F], [B, N], [B, F], [B, N], [B, F]],
  [[B, S], [B, N], [B, D], [B, S], [B, N], [B, S], [B, N]],
  [[B, F], [B, N], [B, F], [B, N], [B, F], [B, D], [B, F]],
];

/** Default rotation for `slotCount` daily slots. */
export function defaultRotation(slotCount: number): Bucket[][][] {
  if (slotCount === 2) return DEFAULT_TWO_SLOT_GRID.map((week) => week.map((day) => [...day]));
  return buildRotation(DEFAULT_WEIGHTS, slotCount);
}

/**
 * A grid that follows `weights`, laid out the way the boss plans: best sellers
 * take the morning (first) sends first; every other send is shared out evenly
 * over the 4 weeks, so no bucket clumps into a single week.
 */
export function buildRotation(weights: Record<Bucket, number>, slotCount: number): Bucket[][][] {
  const days = ROTATION_WEEKS * DAYS_PER_WEEK;
  const target = targetCounts(weights, days * slotCount);
  const grid: Bucket[][][] = Array.from({ length: ROTATION_WEEKS }, () =>
    Array.from({ length: DAYS_PER_WEEK }, () => Array<Bucket>(slotCount).fill("BEST_SELLER"))
  );
  const cellOf = (day: number) => grid[Math.floor(day / DAYS_PER_WEEK)][day % DAYS_PER_WEEK];

  // Mornings: best sellers first — every morning, or evenly spaced mornings when
  // their share is smaller than one send a day.
  const bestMornings = Math.min(days, target.BEST_SELLER);
  const bestDays = new Set(Array.from({ length: bestMornings }, (_, i) => Math.floor((i * days) / bestMornings)));
  const quota = { ...target, BEST_SELLER: target.BEST_SELLER - bestMornings };

  // Every other send, in send order, goes to the bucket furthest behind its fair
  // share so far — an even spread with no bucket clumped into one week.
  const cells: Array<[number, number]> = [];
  for (let day = 0; day < days; day++) {
    for (let slot = 0; slot < slotCount; slot++) {
      if (!(slot === 0 && bestDays.has(day))) cells.push([day, slot]);
    }
  }
  const assigned = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  cells.forEach(([day, slot], i) => {
    let pick: Bucket = "BEST_SELLER";
    let lagMax = -Infinity;
    for (const bucket of BUCKETS) {
      if (assigned[bucket] >= quota[bucket]) continue;
      const lag = (quota[bucket] * (i + 1)) / cells.length - assigned[bucket];
      if (lag > lagMax + 1e-9) {
        lagMax = lag;
        pick = bucket;
      }
    }
    assigned[pick] += 1;
    cellOf(day)[slot] = pick;
  });
  return grid;
}

/** The bucket the rotation assigns to a local date's slot. */
export function bucketFor(
  rotation: Bucket[][][],
  rotationStart: string,
  date: string,
  slotIndex: number
): Bucket {
  const days = daysBetween(rotationStart, date);
  const cycle = ROTATION_WEEKS * DAYS_PER_WEEK;
  const offset = ((days % cycle) + cycle) % cycle;
  const week = Math.floor(offset / DAYS_PER_WEEK);
  const day = offset % DAYS_PER_WEEK;
  const row = rotation[week]?.[day] ?? [];
  return row.length ? row[slotIndex % row.length] : "BEST_SELLER";
}

/** Position of a date's slot in the 4-week cycle: [week, day]. */
function cyclePosition(rotationStart: string, date: string): [number, number] {
  const cycle = ROTATION_WEEKS * DAYS_PER_WEEK;
  const offset = ((daysBetween(rotationStart, date) % cycle) + cycle) % cycle;
  return [Math.floor(offset / DAYS_PER_WEEK), offset % DAYS_PER_WEEK];
}

/**
 * The bucket a slot gets once running seasons are applied. A season's `boost`
 * is the share of all sends it wants; the gap above the grid's own seasonal
 * cells is filled by turning new-product / FB sends seasonal first, and only
 * when that isn't enough (e.g. 100%) best-seller sends too — evenly spread
 * over the 4 weeks either way.
 */
export function plannedBucketFor(
  rotation: Bucket[][][],
  rotationStart: string,
  seasons: Season[],
  date: string,
  slotIndex: number
): { bucket: Bucket; boostedBy: Season | null } {
  const bucket = bucketFor(rotation, rotationStart, date, slotIndex);
  if (bucket === "SEASONAL") return { bucket, boostedBy: null };
  const season = activeSeasons(seasons, date)
    .filter((s) => (s.boost ?? 0) > 0)
    .sort((a, b) => (b.boost ?? 0) - (a.boost ?? 0))[0];
  if (!season) return { bucket, boostedBy: null };

  const cells = rotation.flatMap((week, w) => week.flatMap((day, d) => day.map((b, s) => ({ w, d, s, b }))));
  const seasonal = cells.filter((c) => c.b === "SEASONAL").length;
  const needed = Math.round(((season.boost ?? 0) / 100) * cells.length) - seasonal;
  if (needed <= 0) return { bucket, boostedBy: null };

  // New-product / FB sends turn seasonal first; best sellers only for what's left.
  const others = cells.filter((c) => c.b !== "SEASONAL" && c.b !== "BEST_SELLER");
  const best = cells.filter((c) => c.b === "BEST_SELLER");
  const fromOthers = Math.min(needed, others.length);
  const fromBest = Math.min(best.length, needed - fromOthers);
  const pool = bucket === "BEST_SELLER" ? best : others;
  const take = bucket === "BEST_SELLER" ? fromBest : fromOthers;
  if (take <= 0 || !pool.length) return { bucket, boostedBy: null };

  const [week, day] = cyclePosition(rotationStart, date);
  const slot = slotIndex % (rotation[week]?.[day]?.length || 1);
  const k = pool.findIndex((c) => c.w === week && c.d === day && c.s === slot);
  const ratio = Math.min(1, take / pool.length);
  // Evenly spaced: cell k converts when the running quota crosses a whole number.
  const converted = k >= 0 && Math.floor((k + 1) * ratio) > Math.floor(k * ratio);
  return converted ? { bucket: "SEASONAL", boostedBy: season } : { bucket, boostedBy: null };
}

/** Bucket shares implied by a rotation grid: whole percents that add up to exactly 100. */
export function weightsFromRotation(rotation: Bucket[][][]): Record<Bucket, number> {
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  for (const week of rotation) for (const day of week) for (const bucket of day) counts[bucket] += 1;
  return targetCounts(counts, 100);
}

/** Split `cells` into whole counts proportional to `weights` (largest remainder). */
export function targetCounts(weights: Record<Bucket, number>, cells: number): Record<Bucket, number> {
  const sum = BUCKETS.reduce((s, b) => s + Math.max(0, weights[b] ?? 0), 0);
  const out = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  if (sum <= 0 || cells <= 0) return out;
  const exact = BUCKETS.map((b) => ({ b, value: (Math.max(0, weights[b] ?? 0) / sum) * cells }));
  let assigned = 0;
  for (const { b, value } of exact) {
    out[b] = Math.floor(value);
    assigned += out[b];
  }
  const byRemainder = [...exact].sort(
    (x, y) => y.value - Math.floor(y.value) - (x.value - Math.floor(x.value))
  );
  for (let i = 0; assigned < cells; i++, assigned++) {
    out[byRemainder[i % byRemainder.length].b] += 1;
  }
  return out;
}

/** "Apply mix": a fresh grid for `weights` with the current number of daily sends. */
export function rebuildRotationFromWeights(
  current: Bucket[][][],
  weights: Record<Bucket, number>
): Bucket[][][] {
  return buildRotation(weights, current[0]?.[0]?.length || 2);
}

/** Coerce stored JSON into a full 4×7×slots grid (missing cells fall back to the default). */
export function normalizeRotation(raw: unknown, slotCount: number): Bucket[][][] {
  const fallback = defaultRotation(slotCount);
  if (!Array.isArray(raw)) return fallback;
  return fallback.map((week, w) =>
    week.map((day, d) =>
      day.map((def, s) => {
        const value = (raw as unknown[][][])[w]?.[d]?.[s];
        return (BUCKETS as readonly string[]).includes(value as string) ? (value as Bucket) : def;
      })
    )
  );
}
