import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";
import { callTemplaitoBackend } from "@/lib/templaito-backend";

/**
 * Hand a scheduled campaign to SqualoMail now instead of ~2h before send. The
 * send time doesn't change; once pushed, the day can't be unscheduled or
 * regenerated here any more.
 */
export async function POST(
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
    select: { id: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  try {
    const result = await callTemplaitoBackend<{
      pushed: string[];
      failed: { countryCode: string; error: string }[];
    }>({
      path: `/integrations/squalomail/campaigns/${campaign.id}/push-now`,
      method: "POST",
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to push the campaign";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
