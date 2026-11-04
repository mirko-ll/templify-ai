// One Autopilot run for a client (nightly or "Run now"): reconcile planner
// edits, pull fresh intel, lock the day that is due, fill the window. Every run
// is logged in AutopilotRun; one run per client at a time.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fillClient, type FillStats } from "./fill";
import { lockDueDays, type LockStats } from "./lock";
import { reconcileClient, type ReconcileStats } from "./reconcile";
import { evaluatePriceTests, type PriceTestStats } from "./price-tests";
import { collectEmailStats } from "./stats";
import { buildEngineInput } from "./store";

/** A RUNNING run older than this is treated as dead (process restarted mid-run). */
const STALE_RUN_MS = 30 * 60_000;

export type RunKind = "NIGHTLY" | "MANUAL";

export interface RunStats {
  reconcile?: ReconcileStats;
  emailStats?: number;
  priceTests?: PriceTestStats;
  lock?: LockStats;
  fill?: FillStats;
}

async function failStaleRuns(clientId: string, now: Date) {
  await prisma.autopilotRun.updateMany({
    where: { clientId, status: "RUNNING", startedAt: { lt: new Date(now.getTime() - STALE_RUN_MS) } },
    data: { status: "FAILED", error: "Run did not finish (stalled or the server restarted)", finishedAt: now },
  });
}

/** Latest runs for the panel; stale RUNNING rows are failed first. */
export async function recentRuns(clientId: string, take = 5) {
  await failStaleRuns(clientId, new Date());
  return prisma.autopilotRun.findMany({ where: { clientId }, orderBy: { startedAt: "desc" }, take });
}

/** Start a run unless one is already going. Returns the run id, or null when busy. */
export async function startRun(clientId: string, kind: RunKind): Promise<string | null> {
  const now = new Date();
  await failStaleRuns(clientId, now);
  const busy = await prisma.autopilotRun.findFirst({ where: { clientId, status: "RUNNING" } });
  if (busy) return null;
  const run = await prisma.autopilotRun.create({ data: { clientId, kind, status: "RUNNING" } });
  return run.id;
}

/** Execute a started run to completion (never throws; failures are logged on the run). */
export async function executeRun(runId: string, clientId: string, kind: RunKind) {
  const stats: RunStats = {};
  const errors: string[] = [];
  try {
    const config = await prisma.autopilotConfig.findUnique({ where: { clientId } });
    if (!config || config.mode === "OFF") throw new Error("Autopilot is off for this client");

    stats.reconcile = await reconcileClient(clientId);
    if (config.mode === "ON") {
      // Email results first, then judge price tests — so a failed test price is
      // already reverted for the days this run locks and fills.
      try {
        stats.emailStats = await collectEmailStats(clientId);
      } catch (error) {
        errors.push(`stats: ${error instanceof Error ? error.message : String(error)}`);
      }
      try {
        const { input } = await buildEngineInput(clientId, { config });
        stats.priceTests = await evaluatePriceTests(clientId, input);
      } catch (error) {
        errors.push(`price tests: ${error instanceof Error ? error.message : String(error)}`);
      }
      try {
        stats.lock = await lockDueDays(clientId);
      } catch (error) {
        errors.push(`lock: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    stats.fill = await fillClient(clientId, { refresh: true });
    if (stats.fill.intel.error) errors.push(`intel: ${stats.fill.intel.error}`);

    await prisma.autopilotRun.update({
      where: { id: runId },
      data: {
        status: errors.length ? "PARTIAL" : "SUCCESS",
        stats: stats as unknown as Prisma.InputJsonValue,
        error: errors.join("\n") || null,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    console.error(`[autopilot] ${kind} run failed for ${clientId}`, error);
    await prisma.autopilotRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        stats: stats as unknown as Prisma.InputJsonValue,
        error: [...errors, error instanceof Error ? error.message : String(error)].join("\n"),
        finishedAt: new Date(),
      },
    });
  }
}

/** Nightly: every client whose Autopilot is on (or in shadow), one after another. */
export async function runNightly() {
  const configs = await prisma.autopilotConfig.findMany({
    where: { mode: { not: "OFF" }, client: { isArchived: false } },
    select: { clientId: true },
  });
  const started: string[] = [];
  for (const { clientId } of configs) {
    const runId = await startRun(clientId, "NIGHTLY");
    if (!runId) continue;
    started.push(clientId);
    await executeRun(runId, clientId, "NIGHTLY");
  }
  return started;
}
