// Price tests: a best seller's repeat send goes out a step higher. About a day
// after sending, its margin-weighted clicks — clicks per email sent × (price −
// cost) — are compared with the product's earlier sends at the old price. It
// stays if it holds up, otherwise the next send goes back. A month later the
// sales report can still overrule a kept price on profit per send.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SLOT_TAKEN_WINDOW_MS } from "./engine";
import { baseKeyOf } from "./keys";
import { priceNumber } from "./pricing";
import type { ClickRecord, EngineInput, PriceTestState } from "./types";

const DAY = 86_400_000;
/** Judge a test this long after sending (results are mostly in by then). */
const JUDGE_AFTER_HOURS = 20;
/** Without results this long after sending, the test is dropped. */
const GIVE_UP_AFTER_DAYS = 5;
/** Keep the test price when margin-weighted clicks reach this share of the old price's. */
export const KEEP_RATIO = 0.9;
/** A kept price is reverted when the month's profit per send falls below this share of the month before. */
export const PROFIT_REVERT_RATIO = 0.8;
const BASELINE_SENDS = 3;
const RECENT_DAYS = 30;

/** Running tests, recently judged products and prices to go back to — for the pricing step. */
export async function loadPriceTestState(clientId: string, lastPrices: EngineInput["lastPrices"], now = new Date()): Promise<PriceTestState> {
  const tests = await prisma.priceTest.findMany({ where: { clientId }, orderBy: { sendAt: "desc" } });
  const state: PriceTestState = { active: new Set(), recent: new Set(), revertedTo: new Map() };
  const latestPerGroup = new Map<string, (typeof tests)[number]>();
  for (const test of tests) {
    const base = baseKeyOf(test.groupKey);
    if (test.status === "RUNNING") state.active.add(base);
    if (test.decidedAt && now.getTime() - test.decidedAt.getTime() < RECENT_DAYS * DAY) state.recent.add(base);
    if (!latestPerGroup.has(test.groupKey)) latestPerGroup.set(test.groupKey, test);
  }
  for (const [groupKey, test] of latestPerGroup) {
    // Go back only while the last email still went out at the failed test price.
    if (test.status === "REVERTED" && lastPrices.get(groupKey)?.price === test.testPrice) {
      state.revertedTo.set(groupKey, test.basePrice);
    }
  }
  return state;
}

/** Start a test when a day with a test price locks (the plan item carries the test price). */
export async function startPriceTest(
  clientId: string,
  slot: { id: string; groupKey: string | null; sendAt: Date; signals: unknown },
  itemPrice: string | null
) {
  const test = (slot.signals as { pricing?: { test?: { base: string; test: string } | null } } | null)?.pricing?.test;
  if (!test || !slot.groupKey || itemPrice !== test.test) return false;
  const existing = await prisma.priceTest.findFirst({ where: { clientId, slotId: slot.id, status: "RUNNING" } });
  if (existing) return false;
  await prisma.priceTest.create({
    data: { clientId, groupKey: slot.groupKey, basePrice: test.base, testPrice: test.test, slotId: slot.id, sendAt: slot.sendAt },
  });
  return true;
}

/** clicks per sent email × (price − cost): what the clicks are worth at that price. */
export function marginClicks(record: { sent: number; clicks: number }, price: number, cost: number | null) {
  if (record.sent <= 0) return 0;
  return (record.clicks / record.sent) * Math.max(0.01, price - (cost ?? 0));
}

/** Compare a test send with the product's earlier sends at the old price. */
export function judgeTest(
  test: { basePrice: number; testPrice: number; cost: number | null },
  result: { sent: number; clicks: number },
  history: ClickRecord[]
) {
  const baseline = history.filter((r) => r.price === test.basePrice && r.sent > 0).slice(-BASELINE_SENDS);
  if (!baseline.length) return null;
  const base = baseline.reduce((acc, r) => ({ sent: acc.sent + r.sent, clicks: acc.clicks + r.clicks }), { sent: 0, clicks: 0 });
  const testValue = marginClicks(result, test.testPrice, test.cost);
  const baseValue = marginClicks(base, test.basePrice, test.cost);
  const ratio = baseValue > 0 ? testValue / baseValue : 1;
  const ctr = (r: { sent: number; clicks: number }) => (r.sent ? (r.clicks / r.sent) * 1000 : 0);
  const clicksChange = ctr(base) > 0 ? ctr(result) / ctr(base) - 1 : 0;
  const keep = ratio >= KEEP_RATIO;
  const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
  const decision =
    `Clicks per 1,000 emails ${ctr(base).toFixed(1)} → ${ctr(result).toFixed(1)} (${pct(clicksChange)})` +
    (test.cost !== null ? `, each order earns about €${(test.testPrice - test.basePrice).toFixed(0)} more` : "") +
    ` → worth ${pct(ratio - 1)} at €${test.testPrice}. ` +
    (keep ? `Keeping €${test.testPrice}.` : `Back to €${test.basePrice}.`);
  return {
    keep,
    ratio,
    decision,
    baseline: { sends: baseline.length, sent: base.sent, clicks: base.clicks, value: baseValue },
    result: { sent: result.sent, clicks: result.clicks, value: testValue, ratio },
  };
}

export interface PriceTestStats {
  kept: number;
  reverted: number;
  cancelled: number;
  waiting: number;
}

/** Judge running tests that have results, and re-check kept prices against the monthly report. */
export async function evaluatePriceTests(clientId: string, input: EngineInput, now = new Date()): Promise<PriceTestStats> {
  const stats: PriceTestStats = { kept: 0, reverted: 0, cancelled: 0, waiting: 0 };
  const running = await prisma.priceTest.findMany({
    where: { clientId, status: "RUNNING", sendAt: { lt: new Date(now.getTime() - JUDGE_AFTER_HOURS * 3_600_000) } },
  });
  for (const test of running) {
    const items = await prisma.campaignPlanItem.findMany({
      where: {
        plan: { clientId },
        groupKey: test.groupKey,
        sendDate: { gte: new Date(test.sendAt.getTime() - SLOT_TAKEN_WINDOW_MS), lte: new Date(test.sendAt.getTime() + SLOT_TAKEN_WINDOW_MS) },
      },
      select: { campaignId: true, priceOverride: true },
    });
    const item = items[0];
    if (!item || item.priceOverride !== test.testPrice || !item.campaignId) {
      await finish(test.id, "CANCELLED", "The email was changed or removed before sending.");
      stats.cancelled += 1;
      continue;
    }
    const countries = await prisma.campaignCountry.findMany({
      where: { campaignId: item.campaignId, statsFetchedAt: { not: null } },
      select: { countryCode: true, statsSent: true, statsClicks: true },
    });
    const result = countries.reduce((acc, c) => ({ sent: acc.sent + (c.statsSent ?? 0), clicks: acc.clicks + (c.statsClicks ?? 0) }), { sent: 0, clicks: 0 });
    if (!result.sent) {
      if (now.getTime() - test.sendAt.getTime() > GIVE_UP_AFTER_DAYS * DAY) {
        await finish(test.id, "CANCELLED", "No email results arrived from SqualoMail.");
        stats.cancelled += 1;
      } else stats.waiting += 1;
      continue;
    }
    const basePrice = priceNumber(test.basePrice)!;
    const testPrice = priceNumber(test.testPrice)!;
    const history = (input.clickHistory.get(baseKeyOf(test.groupKey)) ?? []).filter((r) => r.sendAt < test.sendAt);
    const verdict = judgeTest({ basePrice, testPrice, cost: input.costs.get(test.groupKey)?.cost ?? null }, result, history);
    if (!verdict) {
      await finish(test.id, "CANCELLED", "No earlier sends at the old price to compare with.");
      stats.cancelled += 1;
      continue;
    }
    await prisma.priceTest.update({
      where: { id: test.id },
      data: {
        campaignId: item.campaignId,
        status: verdict.keep ? "KEPT" : "REVERTED",
        decision: verdict.decision,
        decidedAt: now,
        baseline: verdict.baseline as Prisma.InputJsonValue,
        result: {
          ...verdict.result,
          byCountry: countries.map((c) => ({ countryCode: c.countryCode, sent: c.statsSent ?? 0, clicks: c.statsClicks ?? 0 })),
        } as Prisma.InputJsonValue,
      },
    });
    if (verdict.keep) stats.kept += 1;
    else stats.reverted += 1;
  }

  // Monthly check: a kept price whose month earned clearly less per send than the month before goes back.
  const kept = await prisma.priceTest.findMany({ where: { clientId, status: "KEPT" } });
  for (const test of kept) {
    const month = test.sendAt.toISOString().slice(0, 7);
    const prev = new Date(Date.UTC(test.sendAt.getUTCFullYear(), test.sendAt.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    const profitPerSend = (ym: string) => {
      const [y, m] = ym.split("-").map(Number);
      const profit = input.reports.filter((r) => r.groupKey === test.groupKey && r.year === y && r.month === m).reduce((s, r) => s + r.profit, 0);
      const sends = input.sends.filter((s) => s.source === "ITEM" && s.groupKey === test.groupKey && s.sendAt.toISOString().slice(0, 7) === ym).length;
      return sends ? profit / sends : null;
    };
    const now_ = profitPerSend(month);
    const before = profitPerSend(prev);
    if (now_ === null || before === null || before <= 0) continue;
    if (now_ < before * PROFIT_REVERT_RATIO) {
      await finish(
        test.id,
        "REVERTED",
        `${test.decision ?? ""} Sales report: profit per send fell from €${Math.round(before)} to €${Math.round(now_)} — back to €${test.basePrice}.`.trim()
      );
      stats.reverted += 1;
    }
  }
  return stats;
}

async function finish(id: string, status: "KEPT" | "REVERTED" | "CANCELLED", decision: string) {
  await prisma.priceTest.update({ where: { id }, data: { status, decision, decidedAt: new Date() } });
}
