import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { callTemplaitoBackend } from "@/lib/templaito-backend";

async function ensureClientOwnership(userId: string, clientId: string) {
  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  return prisma.client.findFirst({
    where: {
      id: clientId,
      // Only filter by userId if user is not an admin
      ...(!user?.isAdmin ? { userId } : {}),
      isArchived: false,
    },
    select: { id: true },
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const clientId = typeof (payload as any)?.clientId === "string" ? (payload as any).clientId : "";
  const rawIds = Array.isArray((payload as any)?.newsletterIds) ? (payload as any).newsletterIds : [];
  const newsletterIds = rawIds
    .map((value: unknown) => String(value))
    .filter((value: string) => value.trim().length > 0);

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  const client = await ensureClientOwnership(userId, clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (newsletterIds.length === 0) {
    return NextResponse.json({ clientId, metrics: {} });
  }

  try {
    const result = await callTemplaitoBackend<{ clientId: string; metrics: Record<string, unknown> }>({
      path: "/integrations/squalomail/metrics",
      method: "POST",
      body: JSON.stringify({ clientId, newsletterIds }),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch metrics";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}


