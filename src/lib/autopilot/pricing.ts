import type { Bucket, EngineInput, Pricing } from "./types";

const MIN_SAMPLES = 5;
/** A test needs at least this many earlier sends at the base price with click results. */
export const TEST_MIN_BASELINE_SENDS = 2;

/** Median email price ÷ shop price over past items, or null with too little data. */
export function learnPriceRatio(samples: EngineInput["priceSamples"]): number | null {
  const ratios = samples
    .map((s) => s.price / s.refPriceEur)
    .filter((r) => Number.isFinite(r) && r > 0.1 && r < 1.2)
    .sort((a, b) => a - b);
  if (ratios.length < MIN_SAMPLES) return null;
  const mid = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  return Math.round(median * 1000) / 1000;
}

export function priceNumber(price: string | null | undefined): number | null {
  const n = price ? Number.parseFloat(price.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** The lowest email price that still leaves `minMarginPct` of the price as profit. */
export function priceFloor(cost: number | null, minMarginPct: number): number | null {
  if (cost === null || minMarginPct <= 0 || cost <= 0) return null;
  return Math.ceil(cost / (1 - minMarginPct / 100));
}

/** Can this best seller get a test price now? */
export function canTestPrice(input: EngineInput, baseKey: string, basePrice: number): boolean {
  if (!input.settings.rules.priceTests) return false;
  if (input.priceTests.active.has(baseKey) || input.priceTests.recent.has(baseKey)) return false;
  const baseline = (input.clickHistory.get(baseKey) ?? []).filter((r) => r.price === basePrice && r.sent > 0);
  return baseline.length >= TEST_MIN_BASELINE_SENDS;
}

/**
 * The email price for a pick and how it came about:
 * 1. base: the price to go back to after a failed test, else the last price
 *    this exact offer went out at (a 1+1 has its own), else shop price ×
 *    ratio (whole euros, flagged as suggested);
 * 2. never below cost + the minimum margin (cost from the sales report);
 * 3. for a best seller with enough click history, a test price a step higher.
 */
export function pricePick(
  input: EngineInput,
  pick: { groupKey: string; baseKey: string; bucket: Bucket },
  refPriceEur: number | null,
  ratio: number | null,
  opts: { allowTest?: boolean } = {}
): Pricing {
  const { rules } = input.settings;
  const reverted = input.priceTests.revertedTo.get(pick.groupKey) ?? null;
  const last = input.lastPrices.get(pick.groupKey)?.price ?? null;
  let base = reverted ?? last;
  let suggested = false;
  if (!base && ratio && refPriceEur) {
    base = String(Math.max(1, Math.round(refPriceEur * ratio)));
    suggested = true;
  }
  const costInfo = input.costs.get(pick.groupKey) ?? null;
  const floor = priceFloor(costInfo?.cost ?? null, rules.minMarginPct);
  const pricing: Pricing = {
    price: base,
    suggested: suggested || !base,
    base,
    floor,
    cost: costInfo ? Math.round(costInfo.cost * 100) / 100 : null,
    costMonth: costInfo?.month ?? null,
    raisedToFloor: false,
    test: null,
  };
  const value = priceNumber(base);
  if (value !== null && floor !== null && value < floor) {
    pricing.price = String(floor);
    pricing.raisedToFloor = true;
    return pricing;
  }
  if (
    opts.allowTest &&
    pick.bucket === "BEST_SELLER" &&
    last &&
    value !== null &&
    !suggested &&
    canTestPrice(input, pick.baseKey, value)
  ) {
    const step = Math.max(1, Math.round(value * (rules.priceTestStepPct / 100)));
    const test = String(Math.max(value + step, floor ?? 0));
    pricing.price = test;
    pricing.test = { base: base!, test, stepPct: rules.priceTestStepPct };
  }
  return pricing;
}

/** Price for alternatives and swaps: base and floor, never a test. */
export function priceFor(
  input: EngineInput,
  groupKey: string,
  baseKey: string,
  refPriceEur: number | null,
  ratio: number | null
): { price: string | null; suggested: boolean } {
  const pricing = pricePick(input, { groupKey, baseKey, bucket: "NEW_PRODUCT" }, refPriceEur, ratio);
  return { price: pricing.price, suggested: pricing.suggested };
}
