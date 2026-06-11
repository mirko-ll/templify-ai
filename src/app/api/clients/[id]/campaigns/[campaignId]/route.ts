import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";

/**
 * Campaign details for the planner's generated-template preview: per-country
 * prepared subject/preheader/HTML plus push status.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; campaignId: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, campaignId } = await params;
  const access = await denyUnlessClientAccess(id, userId);
  if (access.response) return access.response;

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, clientId: id },
    select: {
      id: true,
      name: true,
      status: true,
      scheduledAt: true,
      sentAt: true,
      subject: true,
      preheader: true,
      senderName: true,
      countryTargets: {
        orderBy: { countryCode: "asc" },
        select: {
          id: true,
          countryCode: true,
          mailingListName: true,
          preparedSubject: true,
          preparedPreheader: true,
          preparedHtml: true,
          preparedFromName: true,
          preparedFromEmail: true,
          isPushed: true,
          externalId: true,
        },
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ campaign });
}
