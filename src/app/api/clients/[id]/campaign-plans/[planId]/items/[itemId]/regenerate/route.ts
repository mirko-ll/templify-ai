import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";
import { runPlanGeneration } from "@/lib/campaign-plan-generation";

/**
 * The push cron hands prepared campaigns to SqualoMail ~2 hours before send
 * time; keep a safety margin so we never delete a campaign mid-push.
 */
const PUSH_WINDOW_MS = 2.25 * 60 * 60 * 1000;

/**
 * Discard a scheduled day's generated campaign and re-run generation for just
 * that item — for when the produced email isn't good enough. Deletes the old
 * (not-yet-pushed) campaign, re-queues the single item, and kicks off the
 * background generator. Returns 202 immediately; the item flows QUEUED →
 * GENERATING → SCHEDULED with a fresh campaign, like a normal generation.
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
      { error: "Only scheduled days can be regenerated." },
      { status: 400 }
    );
  }
  if (!item.campaignId) {
    // Scheduled before campaign linking existed — without the link we can't
    // safely delete the underlying campaign, and a fresh run would send twice.
    return NextResponse.json(
      { error: "This day has no linked campaign and can't be regenerated safely." },
      { status: 409 }
    );
  }

  // SqualoMail must be connected before we schedule anything new.
  const integration = await prisma.clientIntegration.findFirst({
    where: { clientId: id, provider: "SQUALOMAIL", status: "CONNECTED" },
    select: { id: true },
  });
  if (!integration) {
    return NextResponse.json(
      { error: "Connect SqualoMail for this client before regenerating campaigns." },
      { status: 400 }
    );
  }

  // Same safety as unscheduling — never touch a campaign that's already been
  // handed to SqualoMail or is about to be.
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
        { error: "This campaign was already handed to SqualoMail and can't be regenerated here." },
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

  // Re-queue just this item; runPlanGeneration picks up QUEUED items only.
  await prisma.campaignPlanItem.update({
    where: { id: item.id },
    data: { status: "QUEUED", campaignId: null, errorMessage: null },
  });

  // Fire-and-forget: completes server-side even if the client disconnects.
  void runPlanGeneration(planId);

  return NextResponse.json({ queued: 1 }, { status: 202 });
}
