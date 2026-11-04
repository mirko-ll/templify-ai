// Lock & generate: lockDaysBefore days ahead of sending, the day's emails are
// frozen and generated. Stock is re-checked first (the nightly sync can be a
// week stale), a sold-out pick is swapped for its first valid alternative, the
// snapshot is rebuilt from current listings, and unapproved picks go out as
// "auto-approved" — then the items are queued exactly like the planner's
// "Generate & schedule" button does.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { callTemplaitoBackend } from "@/lib/templaito-backend";
import { runPlanGeneration } from "@/lib/campaign-plan-generation";
import { ownSend, writePick, type SlotEvent } from "./fill";
import { startPriceTest } from "./price-tests";
import { blockReason, createPickContext, planSlots, releaseSends, reserve, sellableCountries, type PickContext } from "./pick";
import { buildPools } from "./pools";
import { finalizePicks } from "./reasons";
import { buildEngineInput, ensureConfig, itemDataForPick, itemsNear, settingsOf } from "./store";
import { addDays, localDateOf, zonedTimeToUtc } from "./time";
import type { Alternative, Bucket, FinalPick } from "./types";

/** Don't lock a slot this close to sending: the push-to-SqualoMail window. */
const TOO_LATE_MS = 3 * 60 * 60_000;
/** At lock time only these block a pick — the user's choice wins over repeat rules. */
const STOCK_BLOCKERS = new Set(["out of stock", "not active in the shop"]);

export interface LockStats {
  dates: string[];
  slots: number;
  manualItems: number;
  refreshed: Record<string, number> | null;
  swapped: number;
  autoApproved: number;
  queued: number;
  plans: number;
  priceTestsStarted: number;
  errors: string[];
}

type SlotRow = Awaited<ReturnType<typeof prisma.autopilotSlot.findFirstOrThrow>>;

function hasListings(snapshot: unknown): boolean {
  return Array.isArray((snapshot as { listings?: unknown } | null)?.listings) && (snapshot as { listings: unknown[] }).listings.length > 0;
}

function isResend(snapshot: unknown): boolean {
  return typeof (snapshot as { resend?: { sourceCampaignId?: unknown } } | null)?.resend?.sourceCampaignId === "string";
}

/** Replace a sold-out pick: first valid stored alternative, else a fresh engine pick. */
async function replaceSoldOut(ctx: PickContext, slot: SlotRow, why: string): Promise<FinalPick | null> {
  const slotReq = { date: slot.date, slotIndex: slot.slotIndex, sendAt: slot.sendAt };
  const alternatives = (Array.isArray(slot.alternatives) ? slot.alternatives : []) as unknown as Alternative[];
  for (const alt of alternatives) {
    const group = ctx.groupByKey.get(alt.groupKey);
    if (group && !blockReason(ctx, group, slotReq, slot.bucket as Bucket)) {
      reserve(ctx, slotReq, alt);
      return {
        slot: slotReq,
        plannedBucket: slot.plannedBucket as Bucket,
        bucket: slot.bucket as Bucket,
        shortlist: [alt],
        events: [{ type: "REPLACED_OOS", detail: `${slot.groupKey}: ${why} → ${alt.groupKey}` }],
        choice: { ...alt, countryCodes: sellableCountries(group, ctx.input.eligibleCountries) },
        reason: alt.reason,
        alternatives: alternatives.filter((a) => a !== alt),
        price: alt.price,
        priceSuggested: alt.priceSuggested,
        pricing: null,
      };
    }
  }
  const planned = planSlots(ctx, [{ ...slotReq, forceBucket: slot.bucket as Bucket }]);
  const { picks } = await finalizePicks(ctx, planned, { openai: null });
  const pick = picks[0];
  if (!pick?.choice) return null;
  pick.events.unshift({ type: "REPLACED_OOS", detail: `${slot.groupKey}: ${why} → ${pick.choice.groupKey}` });
  return pick;
}

/**
 * Lock every day from today to today+lockDaysBefore that still has unlocked
 * Autopilot picks (catching up a missed night), plus the PLANNED manual items
 * of the due day itself.
 */
export async function lockDueDays(clientId: string, now = new Date()): Promise<LockStats> {
  const config = await ensureConfig(clientId, now);
  const settings = settingsOf(config);
  const stats: LockStats = {
    dates: [],
    slots: 0,
    manualItems: 0,
    refreshed: null,
    swapped: 0,
    autoApproved: 0,
    queued: 0,
    plans: 0,
    priceTestsStarted: 0,
    errors: [],
  };
  if (config.mode !== "ON") return stats;

  const today = localDateOf(now, settings.timezone);
  const dueDate = addDays(today, settings.rules.lockDaysBefore);
  const dates = Array.from({ length: settings.rules.lockDaysBefore + 1 }, (_, i) => addDays(today, i));
  const notBefore = new Date(now.getTime() + TOO_LATE_MS);

  const slots = await prisma.autopilotSlot.findMany({
    where: { clientId, date: { in: dates }, shadow: false, state: { in: ["PROPOSED", "APPROVED"] }, sendAt: { gt: notBefore } },
    orderBy: { sendAt: "asc" },
  });
  const dueStart = zonedTimeToUtc(dueDate, "00:00", settings.timezone);
  const dueEnd = zonedTimeToUtc(addDays(dueDate, 1), "00:00", settings.timezone);
  const dueItems = await prisma.campaignPlanItem.findMany({
    where: {
      plan: { clientId, status: { not: "CANCELLED" } },
      status: "PLANNED",
      sendDate: { gte: dueStart > notBefore ? dueStart : notBefore, lt: dueEnd },
    },
  });
  const slotKeys = new Set(slots.map((s) => `${s.groupKey}@${s.sendAt.getTime()}`));
  const manualItems = dueItems.filter((item) => !slotKeys.has(`${item.groupKey}@${item.sendDate?.getTime()}`));
  stats.slots = slots.length;
  stats.manualItems = manualItems.length;
  stats.dates = [...new Set([...slots.map((s) => s.date), ...(manualItems.length ? [dueDate] : [])])];
  if (!slots.length && !manualItems.length) return stats;

  const squalo = await prisma.clientIntegration.findFirst({
    where: { clientId, provider: "SQUALOMAIL", status: "CONNECTED" },
    select: { id: true },
  });
  if (!squalo) {
    stats.errors.push("SqualoMail is not connected — nothing was generated");
    return stats;
  }

  const groupKeys = [
    ...new Set(
      [...slots.map((s) => s.groupKey), ...manualItems.map((i) => i.groupKey)].filter(
        (key): key is string => !!key && !key.startsWith("resend:")
      )
    ),
  ];
  try {
    const result = await callTemplaitoBackend<{ stats: Record<string, number> }>({
      path: "/product-sources/refresh-listings",
      method: "POST",
      body: JSON.stringify({ clientId, groupKeys }),
      signal: AbortSignal.timeout(10 * 60_000),
    });
    stats.refreshed = result.stats;
  } catch (error) {
    stats.errors.push(`stock refresh failed, using last known stock: ${error instanceof Error ? error.message : String(error)}`);
  }

  const { input } = await buildEngineInput(clientId, { now, config });
  const ctx = createPickContext(input, buildPools(input));
  const queue: string[] = [];

  for (const slot of slots) {
    let current = slot;
    const group = slot.groupKey ? ctx.groupByKey.get(slot.groupKey) : undefined;
    const why = group
      ? blockReason(ctx, group, slot, "FB_WINNER", ownSend(slot) ?? undefined)
      : "no longer in the catalog";
    if (!group || (why && STOCK_BLOCKERS.has(why))) {
      const own = ownSend(slot);
      if (own) releaseSends(ctx, [own]);
      const replacement = await replaceSoldOut(ctx, slot, why ?? "unavailable");
      if (!replacement) {
        stats.errors.push(`${slot.date} #${slot.slotIndex}: ${slot.groupKey} is ${why} and nothing could replace it`);
        continue;
      }
      const events: SlotEvent[] = [
        ...(Array.isArray(slot.events) ? (slot.events as SlotEvent[]) : []),
        ...replacement.events.map((e) => ({ at: now.toISOString(), ...e })),
      ];
      try {
        await writePick(clientId, replacement, slot, events, true, settings.defaults, {
          state: slot.state,
          approvedAt: slot.approvedAt,
          approvedById: slot.approvedById,
        });
      } catch (error) {
        stats.errors.push(`${slot.date} #${slot.slotIndex}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      stats.swapped += 1;
      current = await prisma.autopilotSlot.findUniqueOrThrow({ where: { id: slot.id } });
    }

    const item = (await itemsNear(prisma, clientId, current.sendAt)).find((i) => i.groupKey === current.groupKey);
    if (!item || item.status !== "PLANNED") {
      stats.errors.push(`${current.date} #${current.slotIndex}: no editable plan item for ${current.groupKey}`);
      continue;
    }
    await refreshItem(ctx, clientId, item);
    // A test price that is still on the item (not changed by hand) starts a price test.
    if (await startPriceTest(clientId, current, item.priceOverride)) stats.priceTestsStarted += 1;
    const autoApproved = current.state === "PROPOSED";
    await prisma.autopilotSlot.update({
      where: { id: current.id },
      data: {
        state: "LOCKED",
        lockedAt: now,
        ...(autoApproved ? { autoApproved: true, approvedAt: now } : {}),
      },
    });
    if (autoApproved) stats.autoApproved += 1;
    queue.push(item.id);
  }

  for (const item of manualItems) {
    if (!isResend(item.productSnapshot)) await refreshItem(ctx, clientId, item);
    queue.push(item.id);
  }

  const queueable = await prisma.campaignPlanItem.findMany({
    where: { id: { in: queue }, status: "PLANNED" },
    select: { id: true, planId: true, productSnapshot: true },
  });
  const ready = queueable.filter((item) => hasListings(item.productSnapshot) || isResend(item.productSnapshot));
  if (ready.length) {
    await prisma.campaignPlanItem.updateMany({
      where: { id: { in: ready.map((i) => i.id) } },
      data: { status: "QUEUED", errorMessage: null },
    });
    const planIds = [...new Set(ready.map((i) => i.planId))];
    await prisma.campaignPlan.updateMany({ where: { id: { in: planIds } }, data: { revision: { increment: 1 } } });
    for (const planId of planIds) void runPlanGeneration(planId);
    stats.plans = planIds.length;
  }
  stats.queued = ready.length;
  return stats;
}

/**
 * Rebuild an item's snapshot from the current listings and keep only countries
 * that are in stock now (within the item's own country selection, if any).
 */
async function refreshItem(
  ctx: PickContext,
  clientId: string,
  item: { id: string; groupKey: string | null; countryCodes: Prisma.JsonValue; priceOverride: string | null }
) {
  if (!item.groupKey) return;
  const group = ctx.groupByKey.get(item.groupKey);
  const sellable = group ? sellableCountries(group, ctx.input.eligibleCountries) : [];
  const chosen = Array.isArray(item.countryCodes) ? (item.countryCodes as string[]) : [];
  const countryCodes = chosen.length ? chosen.filter((c) => sellable.includes(c)) : sellable;
  const data = await itemDataForPick(clientId, { groupKey: item.groupKey, countryCodes, price: item.priceOverride });
  if (!data) return;
  await prisma.campaignPlanItem.update({
    where: { id: item.id },
    data: {
      productId: data.productId,
      productSnapshot: data.productSnapshot,
      ...(countryCodes.length ? { countryCodes: countryCodes as Prisma.InputJsonValue } : {}),
    },
  });
}
