import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";
import { callTemplaitoBackend } from "@/lib/templaito-backend";

export const maxDuration = 300;

/** Kick off a background sync of every enabled product source for the client. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const access = await denyUnlessClientAccess(id, userId);
  if (access.response) return access.response;

  const enabledSources = await prisma.productSource.count({
    where: { clientId: id, isEnabled: true },
  });
  if (enabledSources === 0) {
    return NextResponse.json(
      { error: "No enabled product sources to sync" },
      { status: 400 }
    );
  }

  // force=true re-scrapes every page instead of skipping sitemap-unchanged ones.
  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;

  try {
    const result = await callTemplaitoBackend({
      path: `/product-sources/sync-all`,
      method: "POST",
      body: JSON.stringify({ clientId: id, force }),
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
