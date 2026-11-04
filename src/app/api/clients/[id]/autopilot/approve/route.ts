import { NextRequest, NextResponse } from "next/server";
import { authorize, errorResponse } from "@/lib/autopilot/api";
import { approveSlots } from "@/lib/autopilot/fill";

/** Approve several proposed slots at once ("Approve all"). Body: { slotIds: string[] }. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const slotIds = Array.isArray(body?.slotIds)
    ? body.slotIds.filter((s: unknown): s is string => typeof s === "string").slice(0, 200)
    : [];
  if (!slotIds.length) return NextResponse.json({ error: "slotIds is required" }, { status: 400 });
  try {
    return NextResponse.json({ approved: await approveSlots(id, slotIds, auth.userId) });
  } catch (error) {
    return errorResponse(error);
  }
}
