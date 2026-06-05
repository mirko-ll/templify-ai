import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";

export async function POST(
  _request: Request,
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

  const existing = await prisma.campaignPlan.findFirst({
    where: {
      id: planId,
      clientId: id,
    },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Campaign plan not found" }, { status: 404 });
  }

  const plan = await prisma.campaignPlan.update({
    where: { id: planId },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
    },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: {
          product: {
            select: {
              id: true,
              title: true,
              bestImageUrl: true,
              status: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ plan });
}
