// Prisma side of the Autopilot: config rows, the nightly intel pull, building
// the engine's input from the live tables, and writing picks into the client's
// regular monthly plan.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadProductGroups } from "@/lib/product-groups";
import { defaultSettings, normalizeDefaults, settingsFromStored } from "./config";
import { fetchIntelExport, matchIntel } from "./intel";
import { loadEngineData, type SqlQuery } from "./loader";
import { SLOT_TAKEN_WINDOW_MS } from "./engine";
import { loadPriceTestState } from "./price-tests";
import { loadClickHistory } from "./stats";
import { baseKeyOf } from "./keys";
import type { AutopilotSettings, EngineInput, IntelProduct, SendRecord } from "./types";

/** Run the shared loader's SELECTs through Prisma. */
export const prismaQuery: SqlQuery = (sql, params = []) =>
  prisma.$queryRawUnsafe(sql, ...params) as Promise<any[]>;

/** Statuses that mean a plan item is in (or past) the generation pipeline. */
export const LOCKED_ITEM_STATUSES = ["QUEUED", "GENERATING", "SCHEDULED"] as const;

export type ConfigRow = NonNullable<Awaited<ReturnType<typeof prisma.autopilotConfig.findUnique>>>;

/** The latest monthly plan's shared defaults (template, subject …) and which month they're from. */
export async function latestPlanDefaults(clientId: string) {
  const plan = await prisma.campaignPlan.findFirst({
    where: { clientId, status: { not: "CANCELLED" }, strategy: { not: Prisma.DbNull } },
    orderBy: [{ year: "desc" }, { month: "desc" }, { updatedAt: "desc" }],
    select: { year: true, month: true, strategy: true },
  });
  const strategy = plan?.strategy as { defaults?: unknown } | null;
  return {
    defaults: normalizeDefaults(strategy?.defaults),
    month: plan ? `${plan.year}-${String(plan.month).padStart(2, "0")}` : null,
  };
}

/**
 * The client's config, creating an OFF one with the boss's formula on first use.
 * Email settings are prefilled from the latest planner defaults.
 */
export async function ensureConfig(clientId: string, now = new Date()): Promise<ConfigRow> {
  const existing = await prisma.autopilotConfig.findUnique({ where: { clientId } });
  if (existing) return existing;
  const settings = defaultSettings(now, (await latestPlanDefaults(clientId)).defaults);
  return prisma.autopilotConfig.upsert({
    where: { clientId },
    update: {},
    create: {
      clientId,
      mode: "OFF",
      timezone: settings.timezone,
      slotTimes: settings.slotTimes,
      rotation: settings.rotation,
      rotationStart: new Date(`${settings.rotationStart}T00:00:00Z`),
      weights: settings.weights,
      rules: settings.rules as unknown as Prisma.InputJsonValue,
      seasons: settings.seasons as unknown as Prisma.InputJsonValue,
      intel: settings.intel as unknown as Prisma.InputJsonValue,
      defaults: settings.defaults as unknown as Prisma.InputJsonValue,
    },
  });
}

export function settingsOf(row: ConfigRow): AutopilotSettings {
  return settingsFromStored(row);
}

/** Matched intel stored by the last successful pull. */
export async function loadStoredIntel(clientId: string): Promise<{ products: IntelProduct[]; fetchedAt: Date | null }> {
  const rows = await prisma.competitorSignal.findMany({ where: { clientId } });
  return {
    fetchedAt: rows.reduce<Date | null>((max, r) => (!max || r.fetchedAt > max ? r.fetchedAt : max), null),
    products: rows.map((r) => ({
      brandId: r.brandId,
      brandName: r.brandName,
      isOwnBrand: r.isOwnBrand,
      productKey: r.productKey,
      token: r.token,
      name: r.name,
      baseKey: r.baseKey,
      groupKey: r.groupKey,
      activeAds: r.activeAds,
      totalAds: r.totalAds,
      newAds7d: r.newAds7d,
      newAds30d: r.newAds30d,
      reach: r.reach,
      reach7d: r.reach7d,
      score: r.score,
      listedSince: r.listedSince,
      listedSinceSource: r.listedSinceSource,
      firstAdAt: r.firstAdAt,
      lastAdAt: r.lastAdAt,
      imageUrl: r.imageUrl,
    })),
  };
}

export interface IntelStatus {
  source: "fresh" | "stored" | "none";
  fetchedAt: string | null;
  /** Newest oadmin aggregation across the mapped brands. */
  aggregatedAt: string | null;
  error: string | null;
}

/**
 * Pull oadmin's export, match it to the catalog and replace the client's stored
 * signals. On any failure the previous pull is used and the error reported.
 */
export async function refreshIntel(
  clientId: string,
  settings: AutopilotSettings,
  groups: EngineInput["groups"],
  now = new Date()
): Promise<{ products: IntelProduct[]; status: IntelStatus }> {
  const mapping = settings.intel;
  if (!mapping.ownBrandId && !mapping.competitorBrandIds.length) {
    return { products: [], status: { source: "none", fetchedAt: null, aggregatedAt: null, error: null } };
  }
  try {
    const exported = await fetchIntelExport(mapping);
    const products = matchIntel(exported.products, groups, mapping);
    const aggregatedAt =
      Object.values(exported.meta?.lastAggregatedAt ?? {}).sort().reverse()[0] ?? null;
    await prisma.$transaction([
      prisma.competitorSignal.deleteMany({ where: { clientId } }),
      prisma.competitorSignal.createMany({
        data: products.map((p) => ({ ...p, clientId, fetchedAt: now })),
        skipDuplicates: true,
      }),
    ]);
    return { products, status: { source: "fresh", fetchedAt: now.toISOString(), aggregatedAt, error: null } };
  } catch (error) {
    const stored = await loadStoredIntel(clientId);
    return {
      products: stored.products,
      status: {
        source: stored.products.length ? "stored" : "none",
        fetchedAt: stored.fetchedAt?.toISOString() ?? null,
        aggregatedAt: null,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Shadow picks (no plan item behind them) still count for the repeat and
 * monthly-cap rules, so they are added as SLOT sends.
 */
async function shadowSlotSends(clientId: string, itemSends: SendRecord[], now: Date): Promise<SendRecord[]> {
  const slots = await prisma.autopilotSlot.findMany({
    where: {
      clientId,
      state: { in: ["PROPOSED", "APPROVED", "LOCKED"] },
      groupKey: { not: null },
      sendAt: { gte: new Date(now.getTime() - 40 * 86_400_000) },
    },
    select: { groupKey: true, sendAt: true },
  });
  return slots
    .filter(
      (slot) =>
        !itemSends.some(
          (s) => s.groupKey === slot.groupKey && Math.abs(s.sendAt.getTime() - slot.sendAt.getTime()) <= SLOT_TAKEN_WINDOW_MS
        )
    )
    .map((slot) => ({ baseKey: baseKeyOf(slot.groupKey!), groupKey: slot.groupKey!, sendAt: slot.sendAt, source: "SLOT" as const }));
}

/** Everything the engine needs for one client, from the live tables. */
export async function buildEngineInput(
  clientId: string,
  opts: { now?: Date; refresh?: boolean; config?: ConfigRow } = {}
): Promise<{ input: EngineInput; config: ConfigRow; intel: IntelStatus }> {
  const now = opts.now ?? new Date();
  const config = opts.config ?? (await ensureConfig(clientId, now));
  const settings = settingsOf(config);
  const data = await loadEngineData(prismaQuery, clientId, now);
  const intelResult = opts.refresh
    ? await refreshIntel(clientId, settings, data.groups, now)
    : await loadStoredIntel(clientId).then((stored) => ({
        products: stored.products,
        status: {
          source: stored.products.length ? ("stored" as const) : ("none" as const),
          fetchedAt: stored.fetchedAt?.toISOString() ?? null,
          aggregatedAt: null,
          error: null,
        },
      }));
  const sends = [...data.sends, ...(await shadowSlotSends(clientId, data.sends, now))];
  const [clickHistory, priceTests] = await Promise.all([
    loadClickHistory(clientId, now),
    loadPriceTestState(clientId, data.lastPrices, now),
  ]);
  return {
    input: { now, settings, ...data, sends, intel: intelResult.products, clickHistory, priceTests },
    config,
    intel: intelResult.status,
  };
}

/**
 * The client's live monthly plan for a local (year, month), reusing it the same
 * way the planner does (one MANUAL plan per month), or creating it with the
 * latest plan's defaults when the Autopilot is first to write into that month.
 */
export async function ensureMonthPlan(
  tx: Prisma.TransactionClient,
  clientId: string,
  year: number,
  month: number,
  fallbackDefaults: AutopilotSettings["defaults"]
) {
  const candidates = await tx.campaignPlan.findMany({
    where: { clientId, year, month, mode: "MANUAL", status: { in: ["DRAFT", "APPROVED", "SCHEDULED", "COMPLETED"] } },
    include: { _count: { select: { items: true } } },
  });
  candidates.sort(
    (a, b) => (b._count.items > 0 ? 1 : 0) - (a._count.items > 0 ? 1 : 0) || b.updatedAt.getTime() - a.updatedAt.getTime()
  );
  if (candidates[0]) return candidates[0];

  const previous = await tx.campaignPlan.findFirst({
    where: { clientId, status: { not: "CANCELLED" } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { strategy: true },
  });
  const prevDefaults = (previous?.strategy as { defaults?: Record<string, unknown> } | null)?.defaults;
  const defaults = prevDefaults ?? { ...fallbackDefaults, sendTime: "08:00" };
  return tx.campaignPlan.create({
    data: {
      clientId,
      year,
      month,
      mode: "MANUAL",
      status: "DRAFT",
      name: `${year}-${String(month).padStart(2, "0")} Campaign Plan`,
      strategy: { defaults } as Prisma.InputJsonValue,
    },
    include: { _count: { select: { items: true } } },
  });
}

/**
 * The Autopilot's own email settings for its items. Each empty field leaves the
 * item's field null, so generation falls back to that month's planner default.
 */
export function emailFields(defaults: AutopilotSettings["defaults"] | null | undefined) {
  return {
    templateId: defaults?.templateId || null,
    subject: defaults?.subject?.trim() || null,
    preheader: defaults?.preheader?.trim() || null,
    senderName: defaults?.senderName?.trim() || null,
  };
}

/** Item fields for an Autopilot pick (product snapshot, countries, price, email settings). */
export async function itemDataForPick(
  clientId: string,
  pick: { groupKey: string; countryCodes: string[]; price: string | null },
  defaults?: AutopilotSettings["defaults"] | null
) {
  const [group] = await loadProductGroups(clientId, [pick.groupKey]);
  if (!group) return null;
  return {
    groupKey: group.key,
    productId: group.productIds[0] ?? null,
    productSnapshot: group as unknown as Prisma.InputJsonValue,
    countryCodes: pick.countryCodes as Prisma.InputJsonValue,
    priceOverride: pick.price,
    ...(defaults !== undefined ? emailFields(defaults) : {}),
  };
}

/** Plan items of the client within ±window of `sendAt`. */
export async function itemsNear(tx: Prisma.TransactionClient | typeof prisma, clientId: string, sendAt: Date) {
  return tx.campaignPlanItem.findMany({
    where: {
      plan: { clientId, status: { not: "CANCELLED" } },
      sendDate: {
        gte: new Date(sendAt.getTime() - SLOT_TAKEN_WINDOW_MS),
        lte: new Date(sendAt.getTime() + SLOT_TAKEN_WINDOW_MS),
      },
    },
  });
}

export async function bumpRevision(tx: Prisma.TransactionClient, planId: string) {
  await tx.campaignPlan.update({ where: { id: planId }, data: { revision: { increment: 1 } } });
}
