import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: {
      clientId: true,
      productUrl: true,
      productNickname: true,
      productInfoJson: true,
      countryResultsJson: true,
      templateId: true,
      subject: true,
      preheader: true,
      senderName: true,
      countryTargets: {
        select: {
          countryCode: true,
          mailingListId: true,
          mailingListName: true,
        },
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const client = await ensureClientOwnership(userId, campaign.clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  let productInfo: unknown = null;
  if (campaign.productInfoJson) {
    try {
      productInfo = JSON.parse(campaign.productInfoJson);
    } catch {
      productInfo = null;
    }
  }

  let countryResults: unknown = null;
  if (campaign.countryResultsJson) {
    try {
      countryResults = JSON.parse(campaign.countryResultsJson);
    } catch {
      countryResults = null;
    }
  }

  return NextResponse.json({
    productUrl: campaign.productUrl,
    productNickname: campaign.productNickname,
    templateId: campaign.templateId,
    productInfo,
    countryResults,
    subject: campaign.subject,
    preheader: campaign.preheader,
    senderName: campaign.senderName,
    countryTargets: campaign.countryTargets.map((t) => ({
      countryCode: t.countryCode,
      mailingListId: t.mailingListId,
      mailingListName: t.mailingListName,
    })),
  });
}
