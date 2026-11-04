import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runNightly } from "@/lib/autopilot/run";

function authorized(request: NextRequest): boolean {
  const expected = process.env.TEMPLAITO_SERVICE_TOKEN;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || !token || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

/**
 * Nightly Autopilot for every client with it on (cron in next.config.ts, after
 * the product sync and oadmin's Ad Library sync). Service token only; 202.
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  void runNightly()
    .then((clients) => console.log(`[autopilot] nightly run finished for ${clients.length} client(s)`))
    .catch((error) => console.error("[autopilot] nightly run failed", error));
  return NextResponse.json({ message: "Autopilot nightly run started" }, { status: 202 });
}
