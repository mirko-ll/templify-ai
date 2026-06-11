import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";

/**
 * The client's imported monthly sales reports. Returns the list of imported
 * months plus full entries for one report (?year=&month=, default newest),
 * each enriched with catalog info (image/title via groupKey) and the previous
 * imported month's numbers for trend display.
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

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));

  const reports = await prisma.productPerformanceReport.findMany({
    where: { clientId: id },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: {
      id: true,
      year: true,
      month: true,
      fileName: true,
      rowCount: true,
      matchedCount: true,
      createdAt: true,
    },
  });

  const selected =
    (year >= 2020 && month >= 1 && month <= 12
      ? reports.find((report) => report.year === year && report.month === month)
      : null) ?? reports[0];

  if (!selected) {
    return NextResponse.json({ reports: [], report: null, entries: [] });
  }

  // The imported month right before the selected one (for trends).
  const previous = reports.find(
    (report) =>
      report.year < selected.year ||
      (report.year === selected.year && report.month < selected.month)
  );

  const [entries, previousEntries] = await Promise.all([
    prisma.productPerformanceEntry.findMany({
      where: { reportId: selected.id },
      orderBy: { quantity: "desc" },
    }),
    previous
      ? prisma.productPerformanceEntry.findMany({
          where: { reportId: previous.id },
          select: {
            campaignName: true,
            orders: true,
            quantity: true,
            revenue: true,
            profit: true,
          },
        })
      : Promise.resolve([]),
  ]);

  // Catalog enrichment: one representative product per matched group key.
  const groupKeys = Array.from(
    new Set(
      entries
        .map((entry) => entry.groupKey)
        .filter((value): value is string => Boolean(value))
    )
  );
  const catalog =
    groupKeys.length > 0
      ? await prisma.product.findMany({
          where: { clientId: id, groupKey: { in: groupKeys } },
          select: { groupKey: true, title: true, bestImageUrl: true },
        })
      : [];
  const byGroupKey = new Map<string, { title: string; imageUrl: string | null }>();
  for (const product of catalog) {
    const key = product.groupKey as string;
    const existing = byGroupKey.get(key);
    if (!existing || (!existing.imageUrl && product.bestImageUrl)) {
      byGroupKey.set(key, {
        title: existing?.title ?? product.title,
        imageUrl: product.bestImageUrl ?? existing?.imageUrl ?? null,
      });
    }
  }

  const prevByName = new Map(
    previousEntries.map((entry) => [entry.campaignName, entry])
  );

  return NextResponse.json({
    reports: reports.map((report) => ({
      ...report,
      createdAt: report.createdAt.toISOString(),
    })),
    report: { ...selected, createdAt: selected.createdAt.toISOString() },
    previousMonth: previous ? { year: previous.year, month: previous.month } : null,
    entries: entries.map((entry) => {
      const info = entry.groupKey ? byGroupKey.get(entry.groupKey) : undefined;
      const prev = prevByName.get(entry.campaignName);
      return {
        id: entry.id,
        campaignName: entry.campaignName,
        groupKey: entry.groupKey,
        orders: entry.orders,
        quantity: entry.quantity,
        revenue: entry.revenue,
        uniqueProducts: entry.uniqueProducts,
        profit: entry.profit,
        productTitle: info?.title ?? null,
        imageUrl: info?.imageUrl ?? null,
        prev: prev
          ? {
              orders: prev.orders,
              quantity: prev.quantity,
              revenue: prev.revenue,
              profit: prev.profit,
            }
          : null,
      };
    }),
  });
}
