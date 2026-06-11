import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";

/**
 * Manually link (or unlink) an imported report row to a product group —
 * the fallback for codenames the auto-matcher couldn't resolve.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, entryId } = await params;
  const access = await denyUnlessClientAccess(id, userId);
  if (access.response) return access.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const groupKey =
    typeof body?.groupKey === "string" && body.groupKey.trim()
      ? body.groupKey.trim()
      : null;

  const entry = await prisma.productPerformanceEntry.findFirst({
    where: { id: entryId, clientId: id },
    select: { id: true, reportId: true },
  });
  if (!entry) {
    return NextResponse.json({ error: "Report row not found" }, { status: 404 });
  }

  await prisma.productPerformanceEntry.update({
    where: { id: entry.id },
    data: { groupKey },
  });

  // Keep the report's matched counter honest.
  const matchedCount = await prisma.productPerformanceEntry.count({
    where: { reportId: entry.reportId, groupKey: { not: null } },
  });
  await prisma.productPerformanceReport.update({
    where: { id: entry.reportId },
    data: { matchedCount },
  });

  return NextResponse.json({ ok: true, groupKey, matchedCount });
}
