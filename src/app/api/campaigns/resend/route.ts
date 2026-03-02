import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { callTemplaitoBackend } from "@/lib/templaito-backend";

async function ensureClientOwnership(userId: string, clientId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  return prisma.client.findFirst({
    where: {
      id: clientId,
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

  const campaignId = typeof (payload as any)?.campaignId === "string" ? (payload as any).campaignId : "";
  const sendDate = typeof (payload as any)?.sendDate === "string" ? (payload as any).sendDate : "";

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  if (!sendDate) {
    return NextResponse.json({ error: "sendDate is required" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { clientId: true },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const client = await ensureClientOwnership(userId, campaign.clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  try {
    const result = await callTemplaitoBackend({
      path: `/integrations/squalomail/campaigns/${campaignId}/resend`,
      method: "POST",
      body: JSON.stringify({ sendDate }),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resend campaign";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
