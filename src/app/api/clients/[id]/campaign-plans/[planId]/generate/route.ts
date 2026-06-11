import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";
import { runPlanGeneration } from "@/lib/campaign-plan-generation";

function hasListings(snapshot: unknown): boolean {
  return Boolean(
    snapshot &&
      typeof snapshot === "object" &&
      Array.isArray((snapshot as { listings?: unknown }).listings) &&
      (snapshot as { listings: unknown[] }).listings.length > 0
  );
}

/** Resend days carry no listings — they clone an existing campaign instead. */
function isResend(snapshot: unknown): boolean {
  return Boolean(
    snapshot &&
      typeof snapshot === "object" &&
      typeof (snapshot as { resend?: { sourceCampaignId?: unknown } }).resend
        ?.sourceCampaignId === "string"
  );
}

/**
 * Kick off background generation + scheduling for a plan's items.
 *
 * Returns 202 immediately and processes items server-side (fire-and-forget), so
 * the user can close the browser. `?only=failed` retries just the failed items.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, planId } = await params;
  const access = await denyUnlessClientAccess(id, userId);
  if (access.response) return access.response;

  const plan = await prisma.campaignPlan.findFirst({
    where: { id: planId, clientId: id },
    select: { id: true },
  });
  if (!plan) {
    return NextResponse.json({ error: "Campaign plan not found" }, { status: 404 });
  }

  const integration = await prisma.clientIntegration.findFirst({
    where: { clientId: id, provider: "SQUALOMAIL", status: "CONNECTED" },
    select: { id: true },
  });
  if (!integration) {
    return NextResponse.json(
      { error: "Connect SqualoMail for this client before generating campaigns." },
      { status: 400 }
    );
  }

  const onlyFailed = new URL(request.url).searchParams.get("only") === "failed";
  const candidates = await prisma.campaignPlanItem.findMany({
    where: {
      planId,
      status: onlyFailed ? "FAILED" : { in: ["PLANNED", "FAILED"] },
      sendDate: { not: null },
    },
    select: { id: true, productSnapshot: true },
  });

  const queueIds = candidates
    .filter(
      (item) => hasListings(item.productSnapshot) || isResend(item.productSnapshot)
    )
    .map((item) => item.id);

  if (queueIds.length === 0) {
    return NextResponse.json(
      { error: "No plannable days to generate. Assign products first." },
      { status: 400 }
    );
  }

  await prisma.campaignPlanItem.updateMany({
    where: { id: { in: queueIds } },
    data: { status: "QUEUED", errorMessage: null },
  });

  // Fire-and-forget: the long-running Next.js server completes this in the
  // background even if the client disconnects.
  void runPlanGeneration(planId);

  return NextResponse.json({ queued: queueIds.length }, { status: 202 });
}
