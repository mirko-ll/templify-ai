// Keep Autopilot slots in step with edits made in the regular planner. The day
// editor can swap or delete an Autopilot item directly; this notices it so the
// nightly fill doesn't put back something the boss removed, and the panel shows
// his choice instead of the stale pick.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SLOT_TAKEN_WINDOW_MS } from "./engine";
import { LOCKED_ITEM_STATUSES } from "./store";

const LOOKBACK_MS = 86_400_000;

export interface ReconcileStats {
  swapped: number;
  skipped: number;
  locked: number;
}

export async function reconcileClient(clientId: string, now = new Date()): Promise<ReconcileStats> {
  const stats: ReconcileStats = { swapped: 0, skipped: 0, locked: 0 };
  const slots = await prisma.autopilotSlot.findMany({
    where: {
      clientId,
      shadow: false,
      state: { in: ["PROPOSED", "APPROVED", "LOCKED"] },
      sendAt: { gte: new Date(now.getTime() - LOOKBACK_MS) },
    },
  });
  if (!slots.length) return stats;

  const times = slots.map((s) => s.sendAt.getTime());
  const items = await prisma.campaignPlanItem.findMany({
    where: {
      plan: { clientId, status: { not: "CANCELLED" } },
      sendDate: {
        gte: new Date(Math.min(...times) - SLOT_TAKEN_WINDOW_MS),
        lte: new Date(Math.max(...times) + SLOT_TAKEN_WINDOW_MS),
      },
    },
    select: { groupKey: true, sendDate: true, status: true },
  });

  for (const slot of slots) {
    const near = items.filter(
      (item) => item.sendDate && Math.abs(item.sendDate.getTime() - slot.sendAt.getTime()) <= SLOT_TAKEN_WINDOW_MS
    );
    const same = near.find((item) => item.groupKey === slot.groupKey);
    const events = Array.isArray(slot.events) ? (slot.events as unknown[]) : [];
    const at = now.toISOString();

    if (same) {
      const locked = (LOCKED_ITEM_STATUSES as readonly string[]).includes(same.status);
      if (locked && slot.state !== "LOCKED") {
        await prisma.autopilotSlot.update({ where: { id: slot.id }, data: { state: "LOCKED", lockedAt: slot.lockedAt ?? now } });
        stats.locked += 1;
      }
      continue;
    }

    const other = near.find((item) => item.groupKey && !item.groupKey.startsWith("resend:")) ?? near[0];
    if (other) {
      const locked = (LOCKED_ITEM_STATUSES as readonly string[]).includes(other.status);
      await prisma.autopilotSlot.update({
        where: { id: slot.id },
        data: {
          groupKey: other.groupKey,
          pickedBy: "USER",
          state: locked ? "LOCKED" : "APPROVED",
          approvedAt: slot.approvedAt ?? now,
          reason: "Changed in the planner by hand.",
          events: [...events, { at, type: "USER_SWAP", detail: `${slot.groupKey} → ${other.groupKey} (planner)` }] as Prisma.InputJsonValue,
        },
      });
      stats.swapped += 1;
    } else {
      await prisma.autopilotSlot.update({
        where: { id: slot.id },
        data: {
          state: "SKIPPED",
          events: [...events, { at, type: "SKIPPED", detail: "Removed in the planner" }] as Prisma.InputJsonValue,
        },
      });
      stats.skipped += 1;
    }
  }
  return stats;
}
