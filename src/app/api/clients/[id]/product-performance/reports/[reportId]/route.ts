import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";

/** Remove an imported month (e.g. uploaded against the wrong month). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, reportId } = await params;
  const access = await denyUnlessClientAccess(id, userId);
  if (access.response) return access.response;

  const report = await prisma.productPerformanceReport.findFirst({
    where: { id: reportId, clientId: id },
    select: { id: true },
  });
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  await prisma.productPerformanceReport.delete({ where: { id: report.id } });
  return NextResponse.json({ ok: true });
}
