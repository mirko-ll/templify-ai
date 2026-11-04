// Run: npx tsx --test src/lib/autopilot/autopilot.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultSettings } from "./config";
import { freeSlots, runEngine, slotRequests } from "./engine";
import { matchIntel } from "./intel";
import { baseKeyOf } from "./keys";
import { listingPrice, sendsFromItems } from "./loader";
import { blockReason, createPickContext, planSlots } from "./pick";
import { buildPools } from "./pools";
import { learnPriceRatio, priceFor } from "./pricing";
import { finalizePicks, templateReason } from "./reasons";
import { bucketFor, defaultRotation, plannedBucketFor, rebuildRotationFromWeights, weightsFromRotation } from "./rotation";
import { easterSunday, isOffSeason } from "./seasons";
import { localDateOf, zonedTimeToUtc } from "./time";
import type { CatalogGroup, EngineInput, IntelProduct } from "./types";

const TZ = "Europe/Ljubljana";
const NOW = new Date("2026-11-02T04:00:00Z"); // Mon 05:00 local
const COUNTRIES = ["BG", "CZ", "HR", "HU", "IT", "PL", "RO", "SK"];

function group(key: string, extra: Partial<CatalogGroup> = {}): CatalogGroup {
  return {
    groupKey: key,
    baseKey: baseKeyOf(key),
    title: `${key} title`,
    imageUrl: null,
    status: "ACTIVE",
    tags: ["home"],
    category: "home",
    firstSeenAt: new Date("2025-01-01T00:00:00Z"),
    inStockCountries: COUNTRIES,
    refPriceEur: 20,
    slugs: [key.toLowerCase()],
    ...extra,
  };
}

function intel(groupKey: string, extra: Partial<IntelProduct> = {}): IntelProduct {
  return {
    brandId: "vigo",
    brandName: "Vigo",
    isOwnBrand: false,
    productKey: `tok:${groupKey.toLowerCase()}`,
    token: groupKey,
    name: groupKey,
    baseKey: baseKeyOf(groupKey),
    groupKey,
    activeAds: 10,
    totalAds: 20,
    newAds7d: 2,
    newAds30d: 5,
    reach: 100_000,
    reach7d: 50_000,
    score: 20,
    listedSince: new Date("2025-06-01T00:00:00Z"),
    listedSinceSource: "ad",
    firstAdAt: new Date("2025-06-01T00:00:00Z"),
    lastAdAt: NOW,
    imageUrl: null,
    ...extra,
  };
}

function input(extra: Partial<EngineInput> = {}): EngineInput {
  return {
    now: NOW,
    settings: defaultSettings(NOW),
    eligibleCountries: COUNTRIES,
    groups: [],
    sends: [],
    reports: [],
    intel: [],
    firstSyncAt: new Date("2025-01-01T00:00:00Z"),
    lastPrices: new Map(),
    priceSamples: [],
    costs: new Map(),
    clickHistory: new Map(),
    priceTests: { active: new Set(), recent: new Set(), revertedTo: new Map() },
    ...extra,
  };
}

test("baseKey drops the offer suffix and punctuation", () => {
  assert.equal(baseKeyOf("BUGBUSTER 1+1"), "BUGBUSTER");
  assert.equal(baseKeyOf("REUSEFO 30+30"), "REUSEFO");
  assert.equal(baseKeyOf("bugbuster"), "BUGBUSTER");
  assert.equal(baseKeyOf("TRANSPORTLĪDZEKĻA TELTS 1+1"), "TRANSPORTLĪDZEKĻATELTS");
});

test("local times convert to UTC across DST", () => {
  assert.equal(zonedTimeToUtc("2026-11-09", "08:00", TZ).toISOString(), "2026-11-09T07:00:00.000Z");
  assert.equal(zonedTimeToUtc("2026-07-01", "08:00", TZ).toISOString(), "2026-07-01T06:00:00.000Z");
  assert.equal(zonedTimeToUtc("2026-10-25", "08:00", TZ).toISOString(), "2026-10-25T07:00:00.000Z");
  assert.equal(zonedTimeToUtc("2026-03-29", "08:00", TZ).toISOString(), "2026-03-29T06:00:00.000Z");
  assert.equal(localDateOf(new Date("2026-11-08T23:30:00Z"), TZ), "2026-11-09");
});

test("default rotation: best sellers every morning, 50/25/15/5/5 mix", () => {
  const rotation = defaultRotation(2);
  // The grid's 28 / 14 / 8 / 3 / 3 sends as whole percents adding up to 100.
  const shares = weightsFromRotation(rotation);
  assert.equal(Object.values(shares).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(
    Object.fromEntries(Object.entries(rotation.flat(2).reduce<Record<string, number>>((acc, b) => ({ ...acc, [b]: (acc[b] ?? 0) + 1 }), {})).sort()),
    { BEST_SELLER: 28, DISCOVERY: 3, FB_WINNER: 8, NEW_PRODUCT: 14, SEASONAL: 3 }
  );
  assert.ok(rotation.every((week) => week.every((day) => day[0] === "BEST_SELLER")), "mornings are best sellers");
  assert.equal(bucketFor(rotation, "2026-11-02", "2026-11-02", 1), "NEW_PRODUCT"); // W1 PM
  assert.equal(bucketFor(rotation, "2026-11-02", "2026-11-09", 1), "FB_WINNER"); // W2 Mon PM
  assert.equal(bucketFor(rotation, "2026-11-02", "2026-11-16", 1), "SEASONAL"); // W3 Mon PM
  assert.equal(bucketFor(rotation, "2026-11-02", "2026-11-30", 1), "NEW_PRODUCT"); // wraps to W1
  assert.equal(bucketFor(rotation, "2026-11-02", "2026-10-26", 1), "FB_WINNER"); // before start = W4 Mon
  assert.deepEqual(defaultSettings(NOW).weights, { BEST_SELLER: 50, NEW_PRODUCT: 25, FB_WINNER: 15, SEASONAL: 5, DISCOVERY: 5 });
});

test("Apply mix builds an even grid for any shares", () => {
  const grid = rebuildRotationFromWeights(defaultRotation(2), { BEST_SELLER: 40, NEW_PRODUCT: 30, FB_WINNER: 20, SEASONAL: 10, DISCOVERY: 0 });
  const shares = weightsFromRotation(grid);
  assert.equal(Object.values(shares).reduce((a, b) => a + b, 0), 100);
  for (const [bucket, want] of Object.entries({ BEST_SELLER: 40, NEW_PRODUCT: 30, FB_WINNER: 20, SEASONAL: 10 })) {
    assert.ok(Math.abs(shares[bucket as keyof typeof shares] - want) <= 1, `${bucket} ≈ ${want}%`);
  }
  assert.equal(grid.flat(2).length, 56);
  // Every week gets every bucket (no single-bucket week).
  for (const week of grid) {
    const kinds = new Set(week.flat());
    assert.equal(kinds.size, 4, `week ${week.flat().join(",")}`);
  }
  // Seasonal never twice in a row.
  const flat = grid.flat(2);
  assert.ok(flat.every((b, i) => !(b === "SEASONAL" && flat[i + 1] === "SEASONAL")));
  const fifty = rebuildRotationFromWeights(defaultRotation(2), { BEST_SELLER: 50, NEW_PRODUCT: 30, FB_WINNER: 15, SEASONAL: 5, DISCOVERY: 0 });
  assert.ok(fifty.every((week) => week.every((day) => day[0] === "BEST_SELLER")), "50% best = every morning");
});

test("seasons: Easter and off-season exclusion", () => {
  assert.equal(easterSunday(2026), "2026-04-05");
  assert.equal(easterSunday(2027), "2027-03-28");
  const seasons = defaultSettings(NOW).seasons;
  assert.equal(isOffSeason(["summer"], seasons, "2026-11-10"), true);
  assert.equal(isOffSeason(["x-mas"], seasons, "2026-11-10"), false);
  assert.equal(isOffSeason(["home"], seasons, "2026-11-10"), false);
  assert.equal(isOffSeason(["summer", "x-mas"], seasons, "2026-11-10"), false);
});

test("hard rules: 10-day repeat, monthly cap, stock, off-season", () => {
  const settings = defaultSettings(NOW);
  const base = input({
    settings,
    groups: [
      group("RECENT"),
      group("CAPPED"),
      group("NOSTOCK", { inStockCountries: ["BG"] }),
      group("SUMMERY", { tags: ["summer"] }),
      group("OK"),
    ],
    intel: ["RECENT", "CAPPED", "NOSTOCK", "SUMMERY", "OK"].map((k, i) => intel(k, { score: 50 - i })),
    sends: [
      { baseKey: "RECENT", groupKey: "RECENT", sendAt: new Date("2026-11-01T16:00:00Z"), source: "ITEM" },
      { baseKey: "CAPPED", groupKey: "CAPPED", sendAt: new Date("2026-11-21T16:00:00Z"), source: "ITEM" },
      { baseKey: "CAPPED", groupKey: "CAPPED", sendAt: new Date("2026-11-30T16:00:00Z"), source: "ITEM" },
    ],
  });
  const ctx = createPickContext(base, buildPools(base));
  const slot = { date: "2026-11-10", slotIndex: 1, sendAt: zonedTimeToUtc("2026-11-10", "17:00", TZ) };
  const why = (key: string) => blockReason(ctx, ctx.groupByKey.get(key)!, slot, "FB_WINNER");
  assert.equal(why("RECENT"), "sent within 10 days");
  assert.equal(why("CAPPED"), "already 2× this month"); // both sends are 11+ days away
  assert.equal(why("NOSTOCK"), "out of stock");
  assert.equal(why("SUMMERY"), "off season");
  assert.equal(why("OK"), null);
  // 2026-11-10 PM is W2 "new products"; there are none here, so it falls back to FB winners.
  const [pick] = planSlots(ctx, [slot]);
  assert.equal(pick.bucket, "FB_WINNER");
  assert.deepEqual(pick.shortlist.map((o) => o.groupKey), ["OK"]);
});

test("planned picks reserve their product for later slots in the same run", () => {
  const base = input({
    groups: [group("ALPHA"), group("BETA", { category: "kitchen" })],
    intel: [intel("ALPHA", { score: 30 }), intel("BETA", { score: 10 })],
  });
  const ctx = createPickContext(base, buildPools(base));
  const slots = slotRequests(base.settings, "2026-11-09", 1); // W2 Mon: best seller (none → FB) / FB
  const picks = planSlots(ctx, slots);
  assert.equal(picks[0].shortlist[0].groupKey, "ALPHA");
  assert.equal(picks[1].shortlist[0].groupKey, "BETA");
});

test("an empty bucket falls back to the next by weight", () => {
  const settings = defaultSettings(new Date("2026-03-02T05:00:00Z"));
  const base = input({
    now: new Date("2026-03-02T05:00:00Z"),
    settings,
    groups: [group("XMASLIGHT", { tags: ["x-mas"] }), group("PLAIN")],
    intel: [intel("PLAIN")],
  });
  const ctx = createPickContext(base, buildPools(base));
  // W3 PM (2026-03-16) is seasonal; no season runs in mid-March.
  const [pick] = planSlots(ctx, [{ date: "2026-03-16", slotIndex: 1, sendAt: zonedTimeToUtc("2026-03-16", "17:00", TZ) }]);
  assert.equal(pick.plannedBucket, "SEASONAL");
  assert.equal(pick.bucket, "FB_WINNER");
  assert.equal(pick.events[0].type, "FALLBACK");
});

test("new products: window, onboarding guard, rival launches, graduation", () => {
  const recent = new Date("2026-10-30T10:00:00Z");
  const base = input({
    groups: [
      group("FRESH", { firstSeenAt: recent }),
      group("OLD"),
      group("RIVALNEW"),
      group("STAR", { firstSeenAt: new Date("2026-10-01T00:00:00Z") }),
    ],
    intel: [intel("RIVALNEW", { listedSince: new Date("2026-10-25T00:00:00Z") })],
    reports: [
      { year: 2026, month: 10, groupKey: "STAR", profit: 900, orders: 50 },
      { year: 2026, month: 10, groupKey: "OLD", profit: 100, orders: 5 },
    ],
  });
  const pools = buildPools(base);
  assert.deepEqual(pools.NEW_PRODUCT.map((c) => c.groupKey).sort(), ["FRESH", "RIVALNEW"]);
  assert.ok(pools.graduated.has("STAR"));
  assert.equal(pools.BEST_SELLER[0].groupKey, "STAR");

  // A brand-new client: everything was first seen at its first sync, so nothing is "new".
  const onboarding = buildPools({ ...base, firstSyncAt: new Date("2026-10-29T00:00:00Z") });
  assert.ok(!onboarding.NEW_PRODUCT.some((c) => c.groupKey === "FRESH"));
});

test("resend items count as the product they resend", () => {
  const sends = sendsFromItems(
    [
      { groupKey: "TRANZIO", sendDate: "2026-10-01T16:00:00Z", status: "SCHEDULED", priceOverride: "17", campaignId: "c1", resendSource: null },
      { groupKey: "resend:c1", sendDate: "2026-10-05T16:00:00Z", status: "SCHEDULED", priceOverride: null, campaignId: "c2", resendSource: "c1" },
      { groupKey: "resend:c2", sendDate: "2026-10-09T16:00:00Z", status: "PLANNED", priceOverride: null, campaignId: null, resendSource: "c2" },
      { groupKey: "GONE", sendDate: "2026-10-02T16:00:00Z", status: "FAILED", priceOverride: null, campaignId: null, resendSource: null },
    ],
    NOW
  );
  assert.deepEqual(sends.map((s) => s.groupKey), ["TRANZIO", "TRANZIO", "TRANZIO"]);
});

test("pricing: last price of the exact offer, else learned ratio", () => {
  assert.equal(learnPriceRatio([{ price: 10, refPriceEur: 20 }]), null);
  const ratio = learnPriceRatio([10, 11, 9, 12, 8].map((price) => ({ price, refPriceEur: 20 })));
  assert.equal(ratio, 0.5);
  const base = input({ lastPrices: new Map([["FOILBLISS", { price: "7", groupKey: "FOILBLISS", at: NOW }]]) });
  assert.deepEqual(priceFor(base, "FOILBLISS", "FOILBLISS", 15, 0.5), { price: "7", suggested: false });
  assert.deepEqual(priceFor(base, "FOILBLISS 1+1", "FOILBLISS", 19, 0.5), { price: "10", suggested: true });
});

test("intel matching: token first, then listing slug", () => {
  const groups = [group("BUGBUSTER 1+1"), group("BUGBUSTER"), group("WALLFIX", { slugs: ["magicka-pasta-wallfix"] })];
  const rows = [
    { brandId: "v", brandName: "Vigo", productKey: "tok:bugbuster", token: "BUGBUSTER", keys: [] },
    { brandId: "v", brandName: "Vigo", productKey: "x", token: null, keys: ["slug:magicka-pasta-wallfix"] },
    { brandId: "v", brandName: "Vigo", productKey: "y", token: "NOPE", keys: [] },
  ].map((r) => ({ ...r, name: null, englishName: null, imageUrl: null, activeAds: 1, totalAds: 1, newAds7d: 0, newAds30d: 0, reach: 0, reach7d: 0, score: 1, listedSince: null, listedSinceSource: null, firstAdAt: null, lastAdAt: null }));
  const matched = matchIntel(rows, groups, { ownBrandId: null, competitorBrandIds: ["v"] });
  assert.deepEqual(matched.map((m) => m.groupKey), ["BUGBUSTER", "WALLFIX", null]);
});

test("slots already holding an email are left alone", () => {
  const settings = defaultSettings(NOW);
  const slots = slotRequests(settings, "2026-11-09", 1);
  const free = freeSlots(slots, [{ baseKey: "X", groupKey: "X", sendAt: new Date("2026-11-09T07:30:00Z"), source: "ITEM" }]);
  assert.deepEqual(free.map((s) => s.slotIndex), [1]);
});

test("LLM choice must come from the shortlist; otherwise the top option wins", async () => {
  const base = input({
    groups: [group("ALPHA"), group("BETA", { category: "kitchen" })],
    intel: [intel("ALPHA", { score: 30 }), intel("BETA", { score: 10 })],
  });
  const slots = slotRequests(base.settings, "2026-11-09", 1).slice(0, 1);
  const fake = (choice: string, reason = "LLM says so.") =>
    ({
      responses: {
        create: async () => ({
          output_text: JSON.stringify({ slots: [{ slot: "2026-11-09#0", choice, reason }] }),
        }),
      },
    }) as any;

  const picked = await runEngine(base, slots, { openai: fake("BETA") });
  assert.equal(picked.picks[0].choice?.groupKey, "BETA");
  // A reason without any figure gets the real numbers prepended.
  assert.match(picked.picks[0].reason ?? "", /^FB winner: Vigo: 10 active ads.*LLM says so\.$/);
  assert.equal(picked.picks[0].alternatives[0].groupKey, "ALPHA");

  const withFigures = await runEngine(base, slots, { openai: fake("BETA", "10 active ads and 50k reach in 7 days.") });
  assert.equal(withFigures.picks[0].reason, "10 active ads and 50k reach in 7 days.");

  const rogue = await runEngine(base, slots, { openai: fake("NOT_IN_LIST") });
  assert.equal(rogue.picks[0].choice?.groupKey, "ALPHA");
  assert.match(rogue.picks[0].reason ?? "", /^FB winner/);
});

test("shipping fees scraped into the price slot are not prices", () => {
  assert.equal(listingPrice("2,99 € doprava"), null);
  assert.equal(listingPrice("3,49 € spedizione"), null);
  assert.equal(listingPrice("2,99 € Αποστολή"), null);
  assert.equal(listingPrice("12,99 € /tk"), 12.99);
  assert.equal(listingPrice("62,99€"), 62.99);
  assert.equal(listingPrice("0 €"), null);
});

test("a forced bucket overrides the rotation", () => {
  const base = input({
    groups: [group("STAR"), group("ADDY")],
    intel: [intel("ADDY")],
    reports: [{ year: 2026, month: 10, groupKey: "STAR", profit: 500, orders: 20 }],
  });
  const ctx = createPickContext(base, buildPools(base));
  // 2026-11-09 PM is FB winner in the rotation; force best seller.
  const [pick] = planSlots(ctx, [{ date: "2026-11-09", slotIndex: 1, sendAt: zonedTimeToUtc("2026-11-09", "17:00", TZ), forceBucket: "BEST_SELLER" }]);
  assert.equal(pick.plannedBucket, "BEST_SELLER");
  assert.equal(pick.shortlist[0].groupKey, "STAR");
});

test("finalizing one slot keeps other slots' reservations (lock-time re-picks)", async () => {
  const base = input({
    groups: [group("ALPHA"), group("BETA", { category: "kitchen" }), group("GAMMA", { category: "toys" })],
    intel: [intel("ALPHA", { score: 30 }), intel("BETA", { score: 20 }), intel("GAMMA", { score: 10 })],
  });
  const ctx = createPickContext(base, buildPools(base));
  const [first, second] = slotRequests(base.settings, "2026-11-09", 1);
  const one = await finalizePicks(ctx, planSlots(ctx, [first]), { openai: null });
  assert.equal(one.picks[0].choice?.groupKey, "ALPHA");
  const two = await finalizePicks(ctx, planSlots(ctx, [second]), { openai: null });
  assert.equal(two.picks[0].choice?.groupKey, "BETA"); // ALPHA is still reserved by the first slot
  assert.equal(ctx.sends.filter((s) => s.reserved).length, 2);
});

test("relaunch: an older product whose first own ad is recent counts as new", () => {
  const firstAd = new Date("2026-10-07T00:00:00Z");
  const own = (key: string, extra: Partial<IntelProduct> = {}) =>
    intel(key, { brandId: "own", brandName: "Superzebra", isOwnBrand: true, firstAdAt: firstAd, listedSince: new Date("2023-11-01T00:00:00Z"), ...extra });
  const base = input({
    groups: [group("XMASCLINGS"), group("OLDADS"), group("FRESH", { firstSeenAt: new Date("2026-10-27T00:00:00Z") })],
    intel: [
      own("XMASCLINGS", { activeAds: 12 }),
      own("OLDADS", { firstAdAt: new Date("2026-05-01T00:00:00Z") }),
      own("FRESH", { firstAdAt: new Date("2026-10-26T00:00:00Z"), activeAds: 24 }),
    ],
    sends: [
      // Emailed last Christmas: doesn't count against the relaunch's 2 tests.
      { baseKey: "XMASCLINGS", groupKey: "XMASCLINGS", sendAt: new Date("2025-12-01T16:00:00Z"), source: "ITEM" },
      { baseKey: "XMASCLINGS", groupKey: "XMASCLINGS", sendAt: new Date("2025-12-12T16:00:00Z"), source: "ITEM" },
    ],
  });
  const pool = buildPools(base).NEW_PRODUCT;
  const relaunch = pool.find((c) => c.groupKey === "XMASCLINGS");
  assert.ok(relaunch, "relaunched product is in the new-products pool");
  assert.equal(relaunch!.signals.relaunched, true);
  assert.equal(relaunch!.signals.timesSent, 0);
  assert.ok(!pool.some((c) => c.groupKey === "OLDADS"), "ads from May are not a relaunch");
  const fresh = pool.find((c) => c.groupKey === "FRESH")!;
  assert.ok(fresh.score > relaunch!.score, "a truly new product ranks above a relaunch");

  const entry = (c: typeof fresh) => ({ ...c, title: c.groupKey, imageUrl: null, category: "home", countryCodes: COUNTRIES });
  assert.match(templateReason(entry(relaunch!), NOW), /^Relaunched: your first ad started 7 Oct \(in the shop since Jan 2025\)/);
  assert.match(templateReason(entry(fresh), NOW), /^New in the shop since 27 Oct · your first ad 26 Oct · 24 active ads/);
});

test("Christmas boost: seasonal rises to ~20% in season, best-seller mornings untouched", () => {
  const settings = defaultSettings(NOW);
  const count = (start: string) => {
    const tally: Record<string, number> = {};
    for (let i = 0; i < 28; i++) {
      for (const slot of [0, 1]) {
        const date = new Date(Date.parse(`${start}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
        const { bucket } = plannedBucketFor(settings.rotation, settings.rotationStart, settings.seasons, date, slot);
        tally[bucket] = (tally[bucket] ?? 0) + 1;
        if (slot === 0) assert.equal(bucket, "BEST_SELLER", `${date} morning stays a best seller`);
      }
    }
    return tally;
  };
  // Nov 2 – Nov 29: Christmas runs → 11 of 56 seasonal (19.6%), still 28 best sellers.
  assert.deepEqual(count("2026-11-02"), { BEST_SELLER: 28, NEW_PRODUCT: 11, SEASONAL: 11, FB_WINNER: 5, DISCOVERY: 1 });
  // Feb: no boosted season → the grid's own 3 seasonal sends.
  assert.deepEqual(count("2027-02-01"), { BEST_SELLER: 28, NEW_PRODUCT: 14, DISCOVERY: 3, FB_WINNER: 8, SEASONAL: 3 });
  // Boosted slots say why.
  const ctx = createPickContext(input({ groups: [group("TREE", { tags: ["x-mas"] })] }), buildPools(input({ groups: [group("TREE", { tags: ["x-mas"] })] })));
  const boosted = slotRequests(settings, "2026-11-02", 28).find(
    (s) => plannedBucketFor(settings.rotation, settings.rotationStart, settings.seasons, s.date, s.slotIndex).boostedBy
  )!;
  const [pick] = planSlots(ctx, [boosted]);
  assert.equal(pick.plannedBucket, "SEASONAL");
  assert.match(pick.events[0].detail, /Christmas season: seasonal products get 20% of sends/);
});

test("a 100% season share makes every send seasonal; 60% also takes some mornings", () => {
  const settings = defaultSettings(NOW);
  const tally = (boost: number) => {
    const seasons = settings.seasons.map((s) => (s.name === "Christmas" ? { ...s, boost } : s));
    const out: Record<string, number> = {};
    for (let i = 0; i < 28; i++) {
      for (const slot of [0, 1]) {
        const date = new Date(Date.parse("2026-11-02T12:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
        const key = `${slot}:${plannedBucketFor(settings.rotation, settings.rotationStart, seasons, date, slot).bucket}`;
        out[key] = (out[key] ?? 0) + 1;
      }
    }
    return out;
  };
  assert.deepEqual(tally(100), { "0:SEASONAL": 28, "1:SEASONAL": 28 });
  // 60% of 56 = 34 seasonal: all 28 evenings, then 6 mornings spread over the 4 weeks.
  assert.deepEqual(tally(60), { "0:BEST_SELLER": 22, "0:SEASONAL": 6, "1:SEASONAL": 28 });
});

test("discovery: never-emailed catalog products with no other claim, rotating weekly", () => {
  const base = input({
    groups: [
      group("LONGTAIL", { category: "garden" }),
      group("EMAILED", { category: "garden" }),
      group("BESTIE"),
      group("NOPHOTO", { imageUrl: null }),
      group("FRESHNEW", { firstSeenAt: new Date("2026-10-30T00:00:00Z") }),
      ...Array.from({ length: 30 }, (_, i) => group(`TAIL${i}`, { category: i % 2 ? "home" : "kitchen", imageUrl: "x" })),
    ].map((g) => (g.imageUrl === null && g.groupKey !== "NOPHOTO" ? { ...g, imageUrl: "img" } : g)),
    sends: [{ baseKey: "EMAILED", groupKey: "EMAILED", sendAt: new Date("2026-01-10T08:00:00Z"), source: "ITEM" }],
    reports: [{ year: 2026, month: 10, groupKey: "BESTIE", profit: 500, orders: 10 }],
  });
  const keys = (now: Date) => buildPools({ ...base, now }).DISCOVERY.map((c) => c.groupKey);
  const pool = keys(NOW);
  assert.ok(pool.includes("LONGTAIL"));
  for (const excluded of ["EMAILED", "BESTIE", "NOPHOTO", "FRESHNEW"]) assert.ok(!pool.includes(excluded), `${excluded} excluded`);
  // A category nobody emailed ranks up; next week the order rotates.
  const top = (now: Date) => keys(now).slice(0, 5).join(",");
  assert.notEqual(top(NOW), top(new Date(NOW.getTime() + 7 * 86_400_000)));
  const longtail = buildPools(base).DISCOVERY.find((c) => c.groupKey === "LONGTAIL")!;
  assert.match(
    templateReason({ ...longtail, title: "", imageUrl: null, category: "garden", countryCodes: COUNTRIES }, NOW),
    /^Discovery: never emailed · in the shop since Jan 2025 · in stock in 8 of 8 countries · no garden email in 295 days/
  );
});

test("pricing: cost from the sales report, margin floor, test price, revert", async () => {
  const { costsFromReports } = await import("./loader");
  const { pricePick, priceFloor } = await import("./pricing");
  // Oct: DATASCALE went out at €12; €3,519 revenue, €1,638 profit → cost ≈ €12 × (1 − 0.4655) = €6.41.
  const costs = costsFromReports(
    [{ year: 2026, month: 10, groupKey: "DATASCALE", profit: 1638, orders: 164, revenue: 3519 }],
    [{ groupKey: "DATASCALE", sendDate: "2026-10-16T15:00:00Z", priceOverride: "12" }],
    NOW
  );
  assert.equal(Math.round(costs.get("DATASCALE")!.cost * 100) / 100, 6.41);
  assert.equal(priceFloor(6.41, 30), 10);

  const history = (price: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({ sendAt: new Date(Date.UTC(2026, 9, 1 + i * 10)), price, sent: 50_000, clicks: 600 }));
  const base = input({
    costs,
    lastPrices: new Map([["DATASCALE", { price: "12", groupKey: "DATASCALE", at: NOW }], ["CHEAP", { price: "5", groupKey: "CHEAP", at: NOW }]]),
    clickHistory: new Map([["DATASCALE", history(12, 2)]]),
  });
  base.costs.set("CHEAP", { cost: 6, month: "2026-10" });
  const pick = (groupKey: string, bucket: "BEST_SELLER" | "FB_WINNER" = "BEST_SELLER", extra: Partial<EngineInput> = {}) =>
    pricePick({ ...base, ...extra }, { groupKey, baseKey: groupKey, bucket }, 20, 0.5, { allowTest: true });

  // Below cost + 30% → raised to the floor, no test.
  assert.deepEqual([pick("CHEAP").price, pick("CHEAP").raisedToFloor, pick("CHEAP").test], ["9", true, null]);
  // A best seller with 2 earlier sends at €12 → +10% (at least €1) test.
  assert.deepEqual(pick("DATASCALE").test, { base: "12", test: "13", stepPct: 10 });
  // Not for other buckets, not with a test running or judged lately, not with too little history.
  assert.equal(pick("DATASCALE", "FB_WINNER").test, null);
  assert.equal(pick("DATASCALE", "BEST_SELLER", { priceTests: { active: new Set(["DATASCALE"]), recent: new Set(), revertedTo: new Map() } }).test, null);
  assert.equal(pick("DATASCALE", "BEST_SELLER", { clickHistory: new Map([["DATASCALE", history(12, 1)]]) }).test, null);
  // After a failed test the base goes back to the old price.
  const reverted = pick("DATASCALE", "BEST_SELLER", {
    lastPrices: new Map([["DATASCALE", { price: "13", groupKey: "DATASCALE", at: NOW }]]),
    priceTests: { active: new Set(), recent: new Set(["DATASCALE"]), revertedTo: new Map([["DATASCALE", "12"]]) },
  });
  assert.deepEqual([reverted.price, reverted.test], ["12", null]);
});

test("price test verdict: margin-weighted clicks against earlier sends", async () => {
  const { judgeTest } = await import("./price-tests");
  const history = [
    { sendAt: new Date("2026-10-01T15:00:00Z"), price: 12, sent: 50_000, clicks: 600 },
    { sendAt: new Date("2026-10-12T15:00:00Z"), price: 12, sent: 50_000, clicks: 600 },
  ];
  // Clicks per 1,000: 12 → 11 (−8%), but each click is worth (13−6.41) vs (12−6.41) → +8% overall: keep.
  const keep = judgeTest({ basePrice: 12, testPrice: 13, cost: 6.41 }, { sent: 50_000, clicks: 550 }, history)!;
  assert.equal(keep.keep, true);
  assert.match(keep.decision, /Clicks per 1,000 emails 12\.0 → 11\.0 \(-8%\).*Keeping €13\./);
  // Clicks fall by a third: not worth it.
  const back = judgeTest({ basePrice: 12, testPrice: 13, cost: 6.41 }, { sent: 50_000, clicks: 400 }, history)!;
  assert.equal(back.keep, false);
  assert.match(back.decision, /Back to €12\./);
  // No earlier sends at the old price: no verdict.
  assert.equal(judgeTest({ basePrice: 14, testPrice: 15, cost: null }, { sent: 1000, clicks: 10 }, history), null);
});
