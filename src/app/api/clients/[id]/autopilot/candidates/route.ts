import { NextRequest, NextResponse } from "next/server";
import { authorize, errorResponse } from "@/lib/autopilot/api";
import { slotAlternatives, slotCandidates } from "@/lib/autopilot/fill";
import { BUCKETS, type Bucket } from "@/lib/autopilot/types";

/**
 * Ranked products of a bucket that may go out in a slot (?slotId=&bucket=), or
 * with ?stored=1 the slot's saved alternatives re-checked against today's rules.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.response) return auth.response;
  const search = new URL(request.url).searchParams;
  const slotId = search.get("slotId");
  const bucket = search.get("bucket");
  if (slotId && search.get("stored") === "1") {
    try {
      return NextResponse.json({ candidates: await slotAlternatives(id, slotId) });
    } catch (error) {
      return errorResponse(error);
    }
  }
  if (!slotId || !bucket || !(BUCKETS as readonly string[]).includes(bucket)) {
    return NextResponse.json({ error: "slotId and a valid bucket are required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ candidates: await slotCandidates(id, slotId, bucket as Bucket) });
  } catch (error) {
    return errorResponse(error);
  }
}
