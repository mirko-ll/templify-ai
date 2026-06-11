import { prisma } from "@/lib/prisma";

/**
 * No item status change anywhere in the plan for this long means the
 * fire-and-forget generation runner died (deploy/crash). A live runner flips
 * statuses every few minutes even on slow generations.
 */
const STALLED_AFTER_MS = 20 * 60 * 1000;

/**
 * A campaign whose per-country content hasn't appeared after this long was
 * abandoned mid-preparation (backend killed before its failure handler ran) —
 * localization + translation normally finish within a few minutes.
 */
const PREPARE_TIMEOUT_MS = 30 * 60 * 1000;

interface SyncablePlanItem {
  id: string;
  status: string;
  campaignId: string | null;
  updatedAt: Date;
}

interface SyncablePlan {
  id: string;
  status: string;
  year: number;
  month: number;
}

/**
 * Close out a SCHEDULED plan once its month has fully passed: nothing is still
 * generating and at least one campaign was scheduled, so there's no work left.
 * Returns true when the plan was flipped to COMPLETED.
 */
export async function maybeCompletePlan(
  plan: SyncablePlan,
  items: Array<{ status: string }>
): Promise<boolean> {
  if (plan.status !== "SCHEDULED") return false;
  // First moment after the plan's month (plan.month is 1-12).
  const monthEnd = new Date(plan.year, plan.month, 1);
  if (Date.now() < monthEnd.getTime()) return false;
  if (
    items.some(
      (item) => item.status === "QUEUED" || item.status === "GENERATING"
    )
  ) {
    return false;
  }
  if (!items.some((item) => item.status === "SCHEDULED")) return false;
  await prisma.campaignPlan.update({
    where: { id: plan.id },
    data: { status: "COMPLETED" },
  });
  return true;
}

/**
 * Reconcile a plan's item statuses with reality before serving it:
 *
 *  - an item marked SCHEDULED whose campaign later FAILED on the backend
 *    (publish error, or every country failed to push) becomes FAILED so the
 *    calendar stops showing it green and it can be regenerated;
 *  - items stuck in QUEUED/GENERATING after the runner died become FAILED once
 *    the plan has shown no progress for a while, instead of locking forever.
 *
 * Returns true when anything changed so callers can re-read the plan.
 */
export async function syncCampaignPlanItems(
  items: SyncablePlanItem[]
): Promise<boolean> {
  let changed = false;

  const scheduled = items.filter(
    (item) => item.status === "SCHEDULED" && item.campaignId
  );
  if (scheduled.length > 0) {
    const campaigns = await prisma.campaign.findMany({
      where: { id: { in: scheduled.map((item) => item.campaignId as string) } },
      select: {
        id: true,
        status: true,
        createdAt: true,
        _count: { select: { countryTargets: true } },
      },
    });
    const failedIds = new Set<string>();
    const abandonedIds: string[] = [];
    for (const campaign of campaigns) {
      if (campaign.status === "FAILED") {
        failedIds.add(campaign.id);
      } else if (
        campaign.status === "SCHEDULED" &&
        campaign._count.countryTargets === 0 &&
        Date.now() - campaign.createdAt.getTime() > PREPARE_TIMEOUT_MS
      ) {
        failedIds.add(campaign.id);
        abandonedIds.push(campaign.id);
      }
    }
    if (abandonedIds.length > 0) {
      await prisma.campaign.updateMany({
        where: { id: { in: abandonedIds }, status: "SCHEDULED" },
        data: { status: "FAILED" },
      });
    }
    if (failedIds.size > 0) {
      await prisma.campaignPlanItem.updateMany({
        where: {
          id: {
            in: scheduled
              .filter((item) => failedIds.has(item.campaignId as string))
              .map((item) => item.id),
          },
        },
        data: {
          status: "FAILED",
          errorMessage:
            "Campaign publishing failed on the backend. Retry to regenerate this day.",
        },
      });
      changed = true;
    }
  }

  const stuck = items.filter(
    (item) => item.status === "QUEUED" || item.status === "GENERATING"
  );
  if (stuck.length > 0) {
    const lastActivity = Math.max(
      ...items.map((item) => new Date(item.updatedAt).getTime())
    );
    if (Date.now() - lastActivity > STALLED_AFTER_MS) {
      await prisma.campaignPlanItem.updateMany({
        where: { id: { in: stuck.map((item) => item.id) } },
        data: {
          status: "FAILED",
          errorMessage:
            "Generation was interrupted before finishing. Retry to regenerate this day.",
        },
      });
      changed = true;
    }
  }

  return changed;
}
