import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";

/**
 * The price most recently set for a product group in any campaign plan — shown
 * in the planner so re-advertising a product starts from its last known price.
 */
export async function GET(
  request: NextRequest,
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

  const groupKey = new URL(request.url).searchParams.get("groupKey")?.trim();
  if (!groupKey) {
    return NextResponse.json({ error: "groupKey is required" }, { status: 400 });
  }

  const item = await prisma.campaignPlanItem.findFirst({
    where: {
      plan: { clientId: id },
      groupKey,
      priceOverride: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    select: { priceOverride: true, sendDate: true, updatedAt: true },
  });

  return NextResponse.json({
    lastPrice: item?.priceOverride ?? null,
    lastUsedAt: item?.sendDate ?? item?.updatedAt ?? null,
  });
}
