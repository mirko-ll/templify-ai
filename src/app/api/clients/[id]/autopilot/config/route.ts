import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize, errorResponse } from "@/lib/autopilot/api";
import {
  normalizeDefaults,
  normalizeIntel,
  normalizeRules,
  normalizeSeasons,
  normalizeSlotTimes,
  normalizeWeights,
} from "@/lib/autopilot/config";
import { intelMatchStats } from "@/lib/autopilot/intel";
import { BUCKETS } from "@/lib/autopilot/types";
import {
  DEFAULT_WEIGHTS,
  defaultRotation,
  normalizeRotation,
  rebuildRotationFromWeights,
  weightsFromRotation,
} from "@/lib/autopilot/rotation";
import { recentRuns, requestRun } from "@/lib/autopilot/run";
import { ensureConfig, latestPlanDefaults, loadStoredIntel, settingsOf } from "@/lib/autopilot/store";
import { mondayOf } from "@/lib/autopilot/time";

/** Settings plus what the onboarding checklist needs to say whether the client is ready. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.response) return auth.response;

  try {
    const config = await ensureConfig(id);
    const [intel, latestReport, squalo, countries, activeGroups, categories, runs, planner] = await Promise.all([
      loadStoredIntel(id),
      prisma.productPerformanceReport.findFirst({
        where: { clientId: id },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        select: { year: true, month: true, createdAt: true },
      }),
      prisma.clientIntegration.findFirst({
        where: { clientId: id, provider: "SQUALOMAIL", status: "CONNECTED" },
        select: { id: true },
      }),
      prisma.clientCountryConfig.count({ where: { clientId: id, isActive: true, mailingListId: { not: null } } }),
      prisma.product.groupBy({ by: ["groupKey"], where: { clientId: id, status: "ACTIVE", groupKey: { not: null } } }),
      categoryOptions(id),
      recentRuns(id, 5),
      latestPlanDefaults(id),
    ]);
    const priceTests = await prisma.priceTest.findMany({
      where: { clientId: id },
      orderBy: { sendAt: "desc" },
      take: 20,
      select: { id: true, groupKey: true, basePrice: true, testPrice: true, status: true, sendAt: true, decision: true, decidedAt: true },
    });

    const settings = settingsOf(config);
    return NextResponse.json({
      mode: config.mode,
      settings,
      // "Reset to default" in the rotation section.
      factoryDefaults: { weights: DEFAULT_WEIGHTS, rotation: defaultRotation(settings.slotTimes.length) },
      status: {
        activeProducts: activeGroups.length,
        sendCountries: countries,
        squalomailConnected: Boolean(squalo),
        latestReport,
        intel: { fetchedAt: intel.fetchedAt, brands: intelMatchStats(intel.products) },
      },
      categories,
      // For "prefill from planner" in the Autopilot email settings.
      plannerDefaults: planner,
      priceTests,
      runs,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Every shop category of the client's active products — the main category and
 * the full scraped list (what season tags match against) — with how many
 * product groups carry it, most used first.
 */
async function categoryOptions(clientId: string): Promise<Array<{ name: string; products: number }>> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string; n: bigint | number }>>(
      `SELECT LOWER(TRIM(c.name)) AS name, COUNT(DISTINCT p.groupKey) AS n
         FROM Product p,
              JSON_TABLE(
                JSON_ARRAY_APPEND(COALESCE(JSON_EXTRACT(p.metadata, '$.extraction.categories'), JSON_ARRAY()), '$', p.category),
                '$[*]' COLUMNS (name VARCHAR(191) PATH '$')
              ) c
        WHERE p.clientId = ? AND p.status = 'ACTIVE' AND p.groupKey IS NOT NULL AND c.name IS NOT NULL AND TRIM(c.name) <> ''
        GROUP BY LOWER(TRIM(c.name))
        ORDER BY n DESC, name ASC`,
      clientId
    );
    return rows.map((r) => ({ name: r.name, products: Number(r.n) }));
  } catch (error) {
    // Older MySQL/MariaDB without JSON_TABLE: main categories only.
    console.error("[autopilot] category list via JSON_TABLE failed, using main categories", error);
    const rows = await prisma.product.groupBy({
      by: ["category"],
      where: { clientId, status: "ACTIVE", category: { not: null } },
      _count: { _all: true },
    });
    return rows
      .map((r) => ({ name: (r.category ?? "").toLowerCase(), products: r._count._all }))
      .filter((r) => r.name)
      .sort((a, b) => b.products - a.products);
  }
}

function validTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Partial update. `rebuildRotation: true` redistributes the rotation grid to
 * match `weights`; otherwise weights follow the grid when only the grid changes.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.response) return auth.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const current = settingsOf(await ensureConfig(id));
    const slotTimes = body.slotTimes !== undefined ? normalizeSlotTimes(body.slotTimes) : current.slotTimes;
    let rotation = normalizeRotation(body.rotation ?? current.rotation, slotTimes.length);
    let weights = body.weights !== undefined ? normalizeWeights(body.weights, rotation) : current.weights;
    // Saving always sends the send times; only a different number of daily sends
    // (or an edited grid) changes the grid's shape and so the implied shares.
    const slotCountChanged = slotTimes.length !== current.slotTimes.length;
    if (body.rebuildRotation === true) rotation = rebuildRotationFromWeights(rotation, weights);
    else if (body.rotation !== undefined || slotCountChanged) {
      // The grid wins; round shares the caller sent (e.g. the 50/30/15/5 default) are kept
      // when they match the grid within a point, instead of showing 30.4% / 14.3%.
      const implied = weightsFromRotation(rotation);
      const close = body.weights !== undefined && BUCKETS.every((b) => Math.abs((weights[b] ?? 0) - implied[b]) <= 1);
      if (!close) weights = implied;
    }

    const data: Prisma.AutopilotConfigUpdateInput = {
      slotTimes,
      rotation,
      weights,
      ...(body.mode !== undefined && ["OFF", "SHADOW", "ON"].includes(body.mode) ? { mode: body.mode } : {}),
      ...(body.timezone !== undefined ? (validTimezone(body.timezone) ? { timezone: body.timezone } : {}) : {}),
      ...(typeof body.rotationStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.rotationStart)
        ? { rotationStart: new Date(`${mondayOf(body.rotationStart)}T00:00:00Z`) }
        : {}),
      ...(body.rules !== undefined ? { rules: { ...current.rules, ...normalizeRules({ ...current.rules, ...body.rules }) } as unknown as Prisma.InputJsonValue } : {}),
      ...(body.seasons !== undefined ? { seasons: normalizeSeasons(body.seasons) as unknown as Prisma.InputJsonValue } : {}),
      ...(body.intel !== undefined ? { intel: normalizeIntel(body.intel) as unknown as Prisma.InputJsonValue } : {}),
      ...(body.defaults !== undefined ? { defaults: normalizeDefaults(body.defaults) as unknown as Prisma.InputJsonValue } : {}),
    };
    if (body.timezone !== undefined && !validTimezone(body.timezone)) {
      return NextResponse.json({ error: `Unknown timezone: ${body.timezone}` }, { status: 400 });
    }

    // New competitor brands change the evidence behind every pick, not just one slot's bucket.
    const intelChanged =
      body.intel !== undefined && JSON.stringify(normalizeIntel(body.intel)) !== JSON.stringify(current.intel);

    const updated = await prisma.autopilotConfig.update({ where: { clientId: id }, data });

    // Settings that change what a slot should be re-plan the open days right away
    // (unapproved Autopilot picks only), instead of waiting for the night run.
    // A run already going read the old settings, so this one queues behind it.
    const replans = ["mode", "rotation", "weights", "seasons", "rules", "slotTimes", "rotationStart", "intel"].some(
      (key) => body[key] !== undefined
    );
    const replanning = replans && updated.mode !== "OFF";
    if (replanning) await requestRun(id, intelChanged ? { repickAll: "competitor brands changed" } : {});
    return NextResponse.json({ mode: updated.mode, settings: settingsOf(updated), replanning });
  } catch (error) {
    return errorResponse(error);
  }
}
