import { NextRequest, NextResponse } from "next/server";
import { authorize, errorResponse } from "@/lib/autopilot/api";
import { executeRun, startRun } from "@/lib/autopilot/run";

/** "Run now": same pipeline as the nightly run, for one client. Returns 202; poll the week view. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.response) return auth.response;
  try {
    const runId = await startRun(id, "MANUAL");
    if (!runId) return NextResponse.json({ error: "A run is already in progress" }, { status: 409 });
    // Fire-and-forget, like plan generation: the server finishes it after the response.
    void executeRun(runId, id, "MANUAL");
    return NextResponse.json({ runId }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
