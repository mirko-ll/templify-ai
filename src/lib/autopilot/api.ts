import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { denyUnlessClientAccess } from "@/lib/client-access";
import { AutopilotError } from "./fill";

/** Session + client access for the Autopilot routes: `{ userId }` or a ready error response. */
export async function authorize(clientId: string): Promise<{ userId: string; response: null } | { userId: null; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;
  if (!userId) return { userId: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const access = await denyUnlessClientAccess(clientId, userId);
  if (access.response) return { userId: null, response: access.response };
  return { userId, response: null };
}

/** Map thrown errors to JSON responses (AutopilotError carries its own status). */
export function errorResponse(error: unknown) {
  if (error instanceof AutopilotError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[autopilot] request failed", error);
  return NextResponse.json({ error: error instanceof Error ? error.message : "Autopilot request failed" }, { status: 500 });
}
