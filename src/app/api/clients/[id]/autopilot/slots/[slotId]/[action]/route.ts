import { NextRequest, NextResponse } from "next/server";
import { authorize, errorResponse } from "@/lib/autopilot/api";
import { approveSlots, repickSlot, skipSlot, swapSlot, unskipSlot } from "@/lib/autopilot/fill";
import { BUCKETS, type Bucket } from "@/lib/autopilot/types";

/**
 * Review-panel actions on one slot:
 *   approve                      — accept the pick
 *   swap      {alternativeIndex} | {groupKey} — use an alternative / any product
 *   rebucket  {bucket}           — re-pick from another bucket
 *   skip / unskip                — no email at this time / pick again
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string; action: string }> }
) {
  const { id, slotId, action } = await params;
  const auth = await authorize(id);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));

  try {
    switch (action) {
      case "approve":
        return NextResponse.json({ approved: await approveSlots(id, [slotId], auth.userId) });
      case "swap": {
        const alternativeIndex = Number.isInteger(body?.alternativeIndex) ? (body.alternativeIndex as number) : undefined;
        const groupKey = typeof body?.groupKey === "string" && body.groupKey.trim() ? body.groupKey.trim() : undefined;
        return NextResponse.json(await swapSlot(id, slotId, auth.userId, { alternativeIndex, groupKey }));
      }
      case "rebucket": {
        if (!(BUCKETS as readonly string[]).includes(body?.bucket)) {
          return NextResponse.json({ error: "Unknown bucket" }, { status: 400 });
        }
        await repickSlot(id, slotId, { bucket: body.bucket as Bucket });
        return NextResponse.json({ ok: true });
      }
      case "skip":
        await skipSlot(id, slotId);
        return NextResponse.json({ ok: true });
      case "unskip":
        await unskipSlot(id, slotId);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 404 });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
