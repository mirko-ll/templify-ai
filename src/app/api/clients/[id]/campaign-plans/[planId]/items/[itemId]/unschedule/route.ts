import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";

/**
 * The push cron hands prepared campaigns to SqualoMail ~2 hours before send
 * time; keep a safety margin so we never delete a campaign mid-push.
 */
const PUSH_WINDOW_MS = 2.25 * 60 * 60 * 1000;

/**
 * Cancel a scheduled day: delete its prepared (not-yet-pushed) campaign and
 * return the plan item to PLANNED so it can be edited or regenerated.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string; itemId: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, planId, itemId } = await params;
  const access = await denyUnlessClientAccess(id, userId);
  if (access.response) return access.response;

  const item = await prisma.campaignPlanItem.findFirst({
    where: { id: itemId, planId, plan: { clientId: id } },
  });
  if (!item) {
    return NextResponse.json({ error: "Planned day not found" }, { status: 404 });
  }
  if (item.status !== "SCHEDULED") {
    return NextResponse.json(
      { error: "Only scheduled days can be unscheduled." },
      { status: 400 }
    );
  }
  if (!item.campaignId) {
    // Scheduled before campaign linking existed — without the link we can't
    // cancel the underlying campaign, and re-planning the day would send twice.
    return NextResponse.json(
      { error: "This day has no linked campaign and can't be unscheduled safely." },
      { status: 409 }
    );
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: item.campaignId },
    select: {
      id: true,
      scheduledAt: true,
      countryTargets: { select: { isPushed: true } },
    },
  });
  if (campaign) {
    if (campaign.countryTargets.some((target) => target.isPushed)) {
      return NextResponse.json(
        { error: "This campaign was already handed to SqualoMail and can't be unscheduled here." },
        { status: 409 }
      );
    }
    if (
      campaign.scheduledAt &&
      campaign.scheduledAt.getTime() - Date.now() < PUSH_WINDOW_MS
    ) {
      return NextResponse.json(
        { error: "Too close to send time — the campaign is about to be handed to SqualoMail." },
        { status: 409 }
      );
    }
    await prisma.campaign.delete({ where: { id: campaign.id } });
  }

  await prisma.campaignPlanItem.update({
    where: { id: item.id },
    data: { status: "PLANNED", campaignId: null, errorMessage: null },
  });

  return NextResponse.json({ ok: true });
}
