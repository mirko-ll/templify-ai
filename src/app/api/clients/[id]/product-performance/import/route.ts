import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";
import {
  matchCampaignNames,
  parsePerformanceSheet,
} from "@/lib/product-performance";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Import a monthly "Campaign overview" xlsx for the given month. Parses the
 * sheet, auto-matches rows to product group keys, and replaces any previous
 * import of the same client+month. Returns the import summary so the modal
 * can offer manual linking for unmatched rows.
 */
export async function POST(
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach the .xlsx report file." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File is too large (max 5 MB)." }, { status: 400 });
  }

  const year = Number(form.get("year"));
  const month = Number(form.get("month"));
  if (!(year >= 2020 && year <= 2100) || !(month >= 1 && month <= 12)) {
    return NextResponse.json(
      { error: "Pick which month this report covers." },
      { status: 400 }
    );
  }

  const parsed = parsePerformanceSheet(await file.arrayBuffer());
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const matches = await matchCampaignNames(
    id,
    parsed.rows.map((row) => row.campaignName)
  );
  const matchedCount = parsed.rows.filter(
    (row) => matches.get(row.campaignName) != null
  ).length;

  // Replace any previous import of this month atomically.
  const report = await prisma.$transaction(async (tx) => {
    const upserted = await tx.productPerformanceReport.upsert({
      where: { clientId_year_month: { clientId: id, year, month } },
      create: {
        clientId: id,
        year,
        month,
        fileName: file.name || null,
        rowCount: parsed.rows.length,
        matchedCount,
      },
      update: {
        fileName: file.name || null,
        rowCount: parsed.rows.length,
        matchedCount,
      },
    });
    await tx.productPerformanceEntry.deleteMany({
      where: { reportId: upserted.id },
    });
    await tx.productPerformanceEntry.createMany({
      data: parsed.rows.map((row) => ({
        reportId: upserted.id,
        clientId: id,
        year,
        month,
        campaignName: row.campaignName,
        groupKey: matches.get(row.campaignName) ?? null,
        orders: Math.round(row.orders),
        quantity: Math.round(row.quantity),
        revenue: row.revenue,
        uniqueProducts: Math.round(row.uniqueProducts),
        profit: row.profit,
      })),
    });
    return upserted;
  });

  return NextResponse.json(
    {
      report: {
        id: report.id,
        year,
        month,
        rowCount: parsed.rows.length,
        matchedCount,
      },
    },
    { status: 201 }
  );
}
