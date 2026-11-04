// Writing picks: the nightly fill of the rolling window, and the per-slot
// actions from the review panel (approve, swap, change bucket, skip).
//
// In SHADOW mode only AutopilotSlot rows are written. In ON mode every pick is
// also a regular PLANNED CampaignPlanItem in the client's monthly plan, so the
// existing calendar, generation and push pipeline handle it unchanged.

import type OpenAI from "openai";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { freeSlots, slotRequests } from "./engine";
import { baseKeyOf } from "./keys";
import {
  blockReason,
  createPickContext,
  planSlots,
  releaseSends,
  shortlistFor,
  type IgnoreSend,
  type PickContext,
} from "./pick";
import { buildPools, type Pools } from "./pools";
import { plannedBucketFor } from "./rotation";
import { learnPriceRatio, priceFor } from "./pricing";
import { finalizePicks, templateReason } from "./reasons";
import {
  bumpRevision,
  buildEngineInput,
  ensureMonthPlan,
  itemDataForPick,
  itemsNear,
  LOCKED_ITEM_STATUSES,
  type IntelStatus,
} from "./store";
import { addDays, localDateOf } from "./time";
import { BUCKETS, BUCKET_LABELS, type Alternative, type Bucket, type FinalPick, type ShortlistEntry } from "./types";

type SlotRow = Awaited<ReturnType<typeof prisma.autopilotSlot.findFirstOrThrow>>;
export type SlotEvent = { at: string; type: string; detail: string };

export class AutopilotError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
  }
}

const CANDIDATES_PER_BUCKET = 40;

function eventsOf(slot: { events: unknown } | null | undefined): SlotEvent[] {
  return Array.isArray(slot?.events) ? (slot!.events as SlotEvent[]) : [];
}

function event(type: string, detail: string, now = new Date()): SlotEvent {
  return { at: now.toISOString(), type, detail };
}

/** What the panel shows about the picked product (kept on the slot so shadow picks render too). */
function productSignals(entry: ShortlistEntry) {
  return {
    ...entry.signals,
    product: { title: entry.title, imageUrl: entry.imageUrl, category: entry.category, countryCodes: entry.countryCodes },
  };
}

function storedAlternatives(alts: Alternative[]): Prisma.InputJsonValue {
  return alts as unknown as Prisma.InputJsonValue;
}

/** The slot's current pick as a send to ignore when re-checking or re-picking it. */
export function ownSend(slot: Pick<SlotRow, "groupKey" | "sendAt">): IgnoreSend | null {
  return slot.groupKey ? { baseKey: baseKeyOf(slot.groupKey), sendAt: slot.sendAt } : null;
}

/** The PLANNED (editable) plan item behind a slot, or a locked one, or none. */
async function slotItem(tx: Prisma.TransactionClient | typeof prisma, clientId: string, slot: Pick<SlotRow, "groupKey" | "sendAt">) {
  if (!slot.groupKey) return null;
  const items = await itemsNear(tx, clientId, slot.sendAt);
  return items.find((item) => item.groupKey === slot.groupKey) ?? null;
}

function monthOfDate(date: string) {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

type PlanDefaults = Parameters<typeof ensureMonthPlan>[4];
type ItemData = NonNullable<Awaited<ReturnType<typeof itemDataForPick>>>;

/**
 * Create, replace or remove the plan item for a slot (ON mode). The old item
 * must still be PLANNED — anything in generation is never touched here.
 */

async function writeSlotItem(
  tx: Prisma.TransactionClient,
  clientId: string,
  slot: { date: string; sendAt: Date },
  previous: { groupKey: string | null } | null,
  next: { itemData: ItemData; defaults: PlanDefaults } | null
) {
  const old = previous?.groupKey ? await slotItem(tx, clientId, { groupKey: previous.groupKey, sendAt: slot.sendAt }) : null;
  if (old && (LOCKED_ITEM_STATUSES as readonly string[]).includes(old.status)) {
    throw new AutopilotError("This email is already being generated or scheduled — unschedule it in the planner first.");
  }
  if (old) {
    await tx.campaignPlanItem.delete({ where: { id: old.id } });
    await bumpRevision(tx, old.planId);
  }
  if (!next) return;
  const { year, month } = monthOfDate(slot.date);
  const plan = await ensureMonthPlan(tx, clientId, year, month, next.defaults);
  await tx.campaignPlanItem.create({
    data: { planId: plan.id, type: "MANUAL", status: "PLANNED", position: plan._count.items, sendDate: slot.sendAt, ...next.itemData },
  });
  await bumpRevision(tx, plan.id);
}

async function saveCandidates(clientId: string, pools: Pools, now: Date) {
  const rows = BUCKETS.flatMap((bucket) =>
    pools[bucket].slice(0, CANDIDATES_PER_BUCKET).map((c) => ({
      clientId,
      computedAt: now,
      bucket,
      groupKey: c.groupKey,
      baseKey: c.baseKey,
      score: c.score,
      signals: c.signals as Prisma.InputJsonValue,
    }))
  );
  await prisma.$transaction([
    prisma.autopilotCandidate.deleteMany({ where: { clientId } }),
    prisma.autopilotCandidate.createMany({ data: rows }),
  ]);
}

export interface FillStats {
  requested: number;
  filled: number;
  empty: number;
  replaced: number;
  materialized: number;
  fallbacks: number;
  llmUsed: boolean;
  intel: IntelStatus;
  graduated: string[];
}

/**
 * Keep D+lock+1 … D+prefill filled. New slots get a pick; EMPTY slots are
 * retried; unapproved Autopilot picks that broke a rule since (sold out,
 * archived …) are replaced. Picks the user approved or changed are never
 * reshuffled. In ON mode, shadow picks become real plan items.
 */
export async function fillClient(
  clientId: string,
  opts: { now?: Date; refresh?: boolean; openai?: OpenAI | null } = {}
): Promise<FillStats> {
  const now = opts.now ?? new Date();
  const { input, config, intel } = await buildEngineInput(clientId, { now, refresh: opts.refresh });
  const settings = input.settings;
  const on = config.mode === "ON";
  const pools = buildPools(input);
  const ctx = createPickContext(input, pools);

  const today = localDateOf(now, settings.timezone);
  const from = addDays(today, settings.rules.lockDaysBefore + 1);
  const range = slotRequests(settings, from, Math.max(0, settings.rules.prefillDays - settings.rules.lockDaysBefore));
  const existing = await prisma.autopilotSlot.findMany({
    where: { clientId, date: { in: [...new Set(range.map((r) => r.date))] } },
  });
  const byKey = new Map(existing.map((slot) => [`${slot.date}#${slot.slotIndex}`, slot]));

  const redo = new Map<string, { slot: SlotRow; why: string }>();
  const materialize: SlotRow[] = [];
  for (const slot of existing) {
    const key = `${slot.date}#${slot.slotIndex}`;
    if (slot.state === "EMPTY") {
      redo.set(key, { slot, why: "" });
      continue;
    }
    // The plan for this slot changed (share, grid, mix, week start): an unapproved
    // Autopilot pick is re-picked. Approved / hand-picked / re-bucketed slots stay.
    if (
      slot.state === "PROPOSED" &&
      slot.pickedBy === "AUTOPILOT" &&
      !eventsOf(slot).some((e) => e.type === "REBUCKET")
    ) {
      const nowPlanned = plannedBucketFor(settings.rotation, settings.rotationStart, settings.seasons, slot.date, slot.slotIndex).bucket;
      if (nowPlanned !== slot.plannedBucket) {
        redo.set(key, { slot, why: `settings changed — this send is now ${BUCKET_LABELS[nowPlanned]}` });
        continue;
      }
    }
    if (slot.state !== "PROPOSED" && !(slot.state === "APPROVED" && slot.shadow && on)) continue;
    const group = slot.groupKey ? ctx.groupByKey.get(slot.groupKey) : undefined;
    const why = group
      ? blockReason(ctx, group, slot, slot.bucket as Bucket, ownSend(slot) ?? undefined)
      : "no longer in the catalog";
    if (why && slot.pickedBy === "AUTOPILOT" && slot.state === "PROPOSED") redo.set(key, { slot, why });
    else if (on && slot.shadow && !why) materialize.push(slot);
  }
  releaseSends(ctx, [...redo.values()].map((r) => ownSend(r.slot)).filter((s): s is IgnoreSend => !!s));

  // Released sends are gone from ctx.sends, so a replaced slot's own item doesn't make its time "taken".
  const requests = freeSlots(
    range.filter((r) => {
      const key = `${r.date}#${r.slotIndex}`;
      return !byKey.has(key) || redo.has(key);
    }),
    ctx.sends
  );

  const planned = planSlots(ctx, requests);
  const { picks, llmUsed } = await finalizePicks(ctx, planned, { openai: opts.openai });

  const stats: FillStats = {
    requested: requests.length,
    filled: 0,
    empty: 0,
    replaced: 0,
    materialized: 0,
    fallbacks: picks.filter((p) => p.events.some((e) => e.type === "FALLBACK")).length,
    llmUsed,
    intel,
    graduated: [...pools.graduated],
  };

  for (const pick of picks) {
    const key = `${pick.slot.date}#${pick.slot.slotIndex}`;
    const previous = redo.get(key)?.slot ?? null;
    const events = [
      ...eventsOf(previous),
      ...(redo.get(key)?.why ? [event("REPLACED", `${previous?.groupKey}: ${redo.get(key)!.why}`, now)] : []),
      ...pick.events.map((e) => event(e.type, e.detail, now)),
    ];
    await writePick(clientId, pick, previous, events, on, settings.defaults);
    if (pick.choice) stats.filled += 1;
    else stats.empty += 1;
    if (previous?.groupKey) stats.replaced += 1;
  }

  for (const slot of materialize) {
    if ((await itemsNear(prisma, clientId, slot.sendAt)).length > 0) continue; // the boss filled it by hand
    const signals = (slot.signals ?? {}) as { product?: { countryCodes?: string[] } };
    const itemData = await itemDataForPick(clientId, {
      groupKey: slot.groupKey!,
      countryCodes: signals.product?.countryCodes ?? [],
      price: slot.priceOverride,
    }, settings.defaults);
    if (!itemData) continue;
    await prisma.$transaction(async (tx) => {
      await writeSlotItem(tx, clientId, slot, null, { itemData, defaults: settings.defaults });
      await tx.autopilotSlot.update({ where: { id: slot.id }, data: { shadow: false } });
    });
    stats.materialized += 1;
  }

  await saveCandidates(clientId, pools, now);
  return stats;
}

/** Upsert one slot with its pick (and its plan item in ON mode). */
export async function writePick(
  clientId: string,
  pick: FinalPick,
  previous: SlotRow | null,
  events: SlotEvent[],
  on: boolean,
  defaults: PlanDefaults,
  extra: Partial<Prisma.AutopilotSlotUncheckedCreateInput> = {}
) {
  const choice = pick.choice;
  const itemData =
    on && choice
      ? await itemDataForPick(clientId, { groupKey: choice.groupKey, countryCodes: choice.countryCodes, price: pick.price }, defaults)
      : null;
  const data = {
    sendAt: pick.slot.sendAt,
    plannedBucket: pick.plannedBucket,
    bucket: pick.bucket,
    state: choice ? ("PROPOSED" as const) : ("EMPTY" as const),
    groupKey: choice?.groupKey ?? null,
    pickedBy: "AUTOPILOT" as const,
    reason: pick.reason,
    signals: choice
      ? ({ ...productSignals(choice), ...(pick.pricing ? { pricing: pick.pricing } : {}) } as unknown as Prisma.InputJsonValue)
      : Prisma.DbNull,
    alternatives: storedAlternatives(pick.alternatives),
    priceOverride: pick.price,
    priceSuggested: pick.priceSuggested,
    shadow: !on,
    approvedAt: null,
    approvedById: null,
    autoApproved: false,
    events: events as unknown as Prisma.InputJsonValue,
    ...extra,
  };
  await prisma.$transaction(async (tx) => {
    if (on) {
      await writeSlotItem(tx, clientId, pick.slot, previous && !previous.shadow ? previous : null, itemData ? { itemData, defaults } : null);
    }
    await tx.autopilotSlot.upsert({
      where: { clientId_date_slotIndex: { clientId, date: pick.slot.date, slotIndex: pick.slot.slotIndex } },
      create: { clientId, date: pick.slot.date, slotIndex: pick.slot.slotIndex, ...data },
      update: data,
    });
  });
}

async function loadSlot(clientId: string, slotId: string): Promise<SlotRow> {
  const slot = await prisma.autopilotSlot.findFirst({ where: { id: slotId, clientId } });
  if (!slot) throw new AutopilotError("Slot not found", 404);
  return slot;
}

function assertEditable(slot: SlotRow) {
  if (slot.state === "LOCKED") throw new AutopilotError("This day is locked — it is being generated or already scheduled.");
}

/** Approve slots (only proposed ones change). */
export async function approveSlots(clientId: string, slotIds: string[], userId: string) {
  const result = await prisma.autopilotSlot.updateMany({
    where: { clientId, id: { in: slotIds }, state: "PROPOSED" },
    data: { state: "APPROVED", approvedAt: new Date(), approvedById: userId, autoApproved: false },
  });
  return result.count;
}

/** Skip a slot: no email at that time; the nightly fill leaves it alone. */
export async function skipSlot(clientId: string, slotId: string) {
  const slot = await loadSlot(clientId, slotId);
  assertEditable(slot);
  const config = await prisma.autopilotConfig.findUnique({ where: { clientId } });
  await prisma.$transaction(async (tx) => {
    if (config?.mode === "ON" && !slot.shadow) await writeSlotItem(tx, clientId, slot, slot, null);
    await tx.autopilotSlot.update({
      where: { id: slot.id },
      data: { state: "SKIPPED", events: [...eventsOf(slot), event("SKIPPED", "Skipped by hand")] as unknown as Prisma.InputJsonValue },
    });
  });
}

/** Undo a skip: the slot is empty again and gets a pick right away. */
export async function unskipSlot(clientId: string, slotId: string) {
  const slot = await loadSlot(clientId, slotId);
  if (slot.state !== "SKIPPED") return;
  await prisma.autopilotSlot.update({ where: { id: slot.id }, data: { state: "EMPTY", groupKey: null } });
  await repickSlot(clientId, slotId, {});
}

/** Context for re-picking one slot: engine input with the slot's own pick released. */
async function slotContext(clientId: string, slot: SlotRow): Promise<{ ctx: PickContext; on: boolean; defaults: PlanDefaults }> {
  const { input, config } = await buildEngineInput(clientId);
  const ctx = createPickContext(input, buildPools(input));
  const own = ownSend(slot);
  if (own) releaseSends(ctx, [own]);
  return { ctx, on: config.mode === "ON", defaults: input.settings.defaults };
}

/**
 * Re-pick a slot with the engine (optionally in another bucket). Used for
 * "change bucket" and "unskip". Approval is reset: it's a fresh proposal.
 */
export async function repickSlot(clientId: string, slotId: string, opts: { bucket?: Bucket; openai?: OpenAI | null }) {
  const slot = await loadSlot(clientId, slotId);
  assertEditable(slot);
  const { ctx, on, defaults } = await slotContext(clientId, slot);
  const planned = planSlots(ctx, [{ date: slot.date, slotIndex: slot.slotIndex, sendAt: slot.sendAt, forceBucket: opts.bucket ?? (slot.plannedBucket as Bucket) }]);
  const { picks } = await finalizePicks(ctx, planned, { openai: opts.openai });
  const events = [
    ...eventsOf(slot),
    ...(opts.bucket ? [event("REBUCKET", `Changed to ${opts.bucket} by hand`)] : []),
    ...picks[0].events.map((e) => event(e.type, e.detail)),
  ];
  // Keep the rotation's bucket as "planned"; the forced one is what's used.
  await writePick(clientId, picks[0], slot, events, on, defaults, { plannedBucket: slot.plannedBucket });
}

/**
 * Swap the pick for one of its stored alternatives or any product. A swap made
 * by hand counts as approval. Hard rules are re-checked; a free pick that
 * breaks one is still allowed but the warning is recorded.
 */
export async function swapSlot(
  clientId: string,
  slotId: string,
  userId: string,
  target: { alternativeIndex?: number; groupKey?: string }
) {
  const slot = await loadSlot(clientId, slotId);
  assertEditable(slot);
  const { ctx, on, defaults } = await slotContext(clientId, slot);
  const alternatives = (Array.isArray(slot.alternatives) ? slot.alternatives : []) as unknown as Alternative[];

  let entry: ShortlistEntry;
  let reason: string;
  let price: { price: string | null; suggested: boolean };
  let rest: Alternative[];
  if (target.alternativeIndex !== undefined) {
    const alt = alternatives[target.alternativeIndex];
    if (!alt) throw new AutopilotError("That alternative no longer exists", 400);
    entry = alt;
    reason = alt.reason;
    price = { price: alt.price, suggested: alt.priceSuggested };
    rest = alternatives.filter((_, i) => i !== target.alternativeIndex);
  } else if (target.groupKey) {
    const group = ctx.groupByKey.get(target.groupKey);
    if (!group) throw new AutopilotError("Product not found in the catalog", 400);
    const known = BUCKETS.map((b) => ctx.pools[b].find((c) => c.baseKey === group.baseKey)).find(Boolean);
    entry = {
      bucket: (known?.bucket ?? slot.bucket) as Bucket,
      groupKey: group.groupKey,
      baseKey: group.baseKey,
      score: known?.score ?? 0,
      signals: known?.signals ?? {},
      title: group.title,
      imageUrl: group.imageUrl,
      category: group.category,
      countryCodes: ctx.input.eligibleCountries.filter((c) => group.inStockCountries.includes(c)),
    };
    reason = known ? `Picked by hand. ${templateReason(entry, ctx.input.now)}` : "Picked by hand.";
    const ratio = ctx.input.settings.rules.priceRatio ?? learnPriceRatio(ctx.input.priceSamples);
    price = priceFor(ctx.input, group.groupKey, group.baseKey, group.refPriceEur, ratio);
    rest = alternatives;
  } else {
    throw new AutopilotError("Nothing to swap to", 400);
  }

  const group = ctx.groupByKey.get(entry.groupKey);
  const warning = group ? blockReason(ctx, group, slot, "FB_WINNER") : "not in the catalog";
  if (target.alternativeIndex !== undefined && warning) {
    throw new AutopilotError(`Can't use ${entry.groupKey}: ${warning}`);
  }
  if (!entry.countryCodes.length) throw new AutopilotError(`${entry.groupKey} is out of stock everywhere`);

  // The replaced pick becomes the first alternative, so the swap can be undone.
  const previousSignals = (slot.signals ?? {}) as Record<string, any>;
  const previousAlt: Alternative | null = slot.groupKey
    ? {
        bucket: slot.bucket as Bucket,
        groupKey: slot.groupKey,
        baseKey: baseKeyOf(slot.groupKey),
        score: 0,
        signals: previousSignals,
        title: previousSignals.product?.title ?? slot.groupKey,
        imageUrl: previousSignals.product?.imageUrl ?? null,
        category: previousSignals.product?.category ?? null,
        countryCodes: previousSignals.product?.countryCodes ?? [],
        reason: slot.reason ?? "",
        price: slot.priceOverride,
        priceSuggested: slot.priceSuggested,
      }
    : null;

  const pick: FinalPick = {
    slot: { date: slot.date, slotIndex: slot.slotIndex, sendAt: slot.sendAt },
    plannedBucket: slot.plannedBucket as Bucket,
    bucket: slot.bucket as Bucket,
    shortlist: [entry],
    events: [],
    choice: entry,
    reason,
    alternatives: [...(previousAlt ? [previousAlt] : []), ...rest].slice(0, 4),
    price: price.price,
    priceSuggested: price.suggested,
    pricing: null,
  };
  const events = [
    ...eventsOf(slot),
    event("USER_SWAP", `${slot.groupKey ?? "empty"} → ${entry.groupKey}${warning ? ` (warning: ${warning})` : ""}`),
  ];
  await writePick(clientId, pick, slot, events, on, defaults, {
    pickedBy: "USER",
    state: "APPROVED",
    approvedAt: new Date(),
    approvedById: userId,
  });
  return { warning };
}

/** Slot candidates for the "more from this bucket" picker, checked against this slot's date. */
export async function slotCandidates(clientId: string, slotId: string, bucket: Bucket, limit = 20) {
  const slot = await loadSlot(clientId, slotId);
  const { ctx } = await slotContext(clientId, slot);
  const ratio = ctx.input.settings.rules.priceRatio ?? learnPriceRatio(ctx.input.priceSamples);
  // The current pick is released for the rules check, but it isn't a swap target.
  const current = slot.groupKey ? baseKeyOf(slot.groupKey) : null;
  return shortlistFor(ctx, bucket, slot, limit + 1)
    .filter((entry) => entry.baseKey !== current)
    .slice(0, limit)
    .map((entry) => ({
    ...entry,
    reason: templateReason(entry, ctx.input.now),
    ...(() => {
      const p = priceFor(ctx.input, entry.groupKey, entry.baseKey, ctx.groupByKey.get(entry.groupKey)?.refPriceEur ?? null, ratio);
      return { price: p.price, priceSuggested: p.suggested };
    })(),
  }));
}

/**
 * The slot's stored alternatives, re-checked now: picks made after them (later
 * nights, other slots) can make one break the rules. Blocked ones carry why.
 */
export async function slotAlternatives(clientId: string, slotId: string) {
  const slot = await loadSlot(clientId, slotId);
  const { ctx } = await slotContext(clientId, slot);
  const alternatives = (Array.isArray(slot.alternatives) ? slot.alternatives : []) as unknown as Alternative[];
  return alternatives.map((alt) => {
    const group = ctx.groupByKey.get(alt.groupKey);
    return { ...alt, blocked: group ? blockReason(ctx, group, slot, slot.bucket as Bucket) : "no longer in the catalog" };
  });
}
