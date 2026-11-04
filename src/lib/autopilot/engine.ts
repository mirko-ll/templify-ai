import { createPickContext, planSlots } from "./pick";
import { buildPools, type Pools } from "./pools";
import { finalizePicks, type FinalizeOptions } from "./reasons";
import { addDays, zonedTimeToUtc } from "./time";
import type { EngineInput, FinalPick, SendRecord, SlotRequest } from "./types";

/** An existing email this close to a slot's time means the slot is already taken. */
export const SLOT_TAKEN_WINDOW_MS = 90 * 60_000;

/** Slot requests for `days` local dates starting at `fromDate`, in send order. */
export function slotRequests(
  settings: EngineInput["settings"],
  fromDate: string,
  days: number
): SlotRequest[] {
  const out: SlotRequest[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(fromDate, i);
    settings.slotTimes.forEach((time, slotIndex) => {
      out.push({ date, slotIndex, sendAt: zonedTimeToUtc(date, time, settings.timezone) });
    });
  }
  return out;
}

/** Drop slots that already have an email (the boss's manual items are never overwritten). */
export function freeSlots(slots: SlotRequest[], sends: SendRecord[]): SlotRequest[] {
  const items = sends.filter((s) => s.source === "ITEM");
  return slots.filter(
    (slot) => !items.some((s) => Math.abs(s.sendAt.getTime() - slot.sendAt.getTime()) <= SLOT_TAKEN_WINDOW_MS)
  );
}

export interface EngineResult {
  pools: Pools;
  picks: FinalPick[];
  llmUsed: boolean;
}

/** Build pools, plan `slots` and finalize them (reasons, prices). */
export async function runEngine(
  input: EngineInput,
  slots: SlotRequest[],
  opts: FinalizeOptions = {}
): Promise<EngineResult> {
  const pools = buildPools(input);
  const ctx = createPickContext(input, pools);
  const planned = planSlots(ctx, slots);
  const { picks, llmUsed } = await finalizePicks(ctx, planned, opts);
  return { pools, picks, llmUsed };
}
