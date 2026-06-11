import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { normalizeGroupKey } from "@/lib/product-grouping";

/**
 * Parsing + product matching for the monthly "Campaign overview" sales export
 * (one row per shop product codename with orders/quantity/revenue/profit).
 *
 * Matching strategy (validated against real data, ~94% exact):
 *  1. the codename normalized equals a Product.groupKey for the client;
 *  2. else the codename appears as a token in a listing slug — use that
 *     product's groupKey;
 *  3. else unmatched — kept visible so the user can link it by hand.
 */

export interface ParsedPerformanceRow {
  campaignName: string;
  orders: number;
  quantity: number;
  revenue: number;
  uniqueProducts: number;
  profit: number;
}

/** "3,301" / " -219 " / 42 → number (0 when unparseable). */
function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Map sheet headers to fields by fuzzy text so column order can vary. */
function columnIndexes(header: unknown[]): Record<string, number> {
  const out: Record<string, number> = {};
  header.forEach((cell, index) => {
    const text = String(cell ?? "").toLowerCase();
    if (!text) return;
    if (text.includes("campaign")) out.campaignName ??= index;
    else if (text.includes("order") && !text.includes("source"))
      out.orders ??= index;
    else if (text.includes("quantity")) out.quantity ??= index;
    else if (text.includes("revenue")) out.revenue ??= index;
    else if (text.includes("unique")) out.uniqueProducts ??= index;
    else if (text.includes("profit")) out.profit ??= index;
  });
  return out;
}

/**
 * Parse the first sheet of a Campaign-overview xlsx export. Rows with the same
 * codename are summed; "ALL"/empty codenames (filter or total rows) are skipped.
 */
export function parsePerformanceSheet(
  buffer: ArrayBuffer
): { rows: ParsedPerformanceRow[] } | { error: string } {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array" });
  } catch {
    return { error: "Couldn't read the file — is it a valid .xlsx export?" };
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { error: "The workbook has no sheets." };

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  // The header is the first row mentioning a campaign column plus a metric.
  const headerIndex = grid.findIndex((row) => {
    const texts = row.map((cell) => String(cell ?? "").toLowerCase());
    return (
      texts.some((t) => t.includes("campaign")) &&
      texts.some((t) => t.includes("quantity") || t.includes("revenue"))
    );
  });
  if (headerIndex === -1) {
    return {
      error:
        'No header row found — expected columns like "Campaign Field", "Quantity", "Revenue".',
    };
  }

  const columns = columnIndexes(grid[headerIndex]);
  if (columns.campaignName === undefined) {
    return { error: "No campaign/product column found in the sheet." };
  }

  const byName = new Map<string, ParsedPerformanceRow>();
  for (const row of grid.slice(headerIndex + 1)) {
    const rawName = String(row[columns.campaignName] ?? "").trim();
    if (!rawName || rawName.toUpperCase() === "ALL") continue;
    const name = rawName.toLowerCase();
    const existing = byName.get(name) ?? {
      campaignName: name,
      orders: 0,
      quantity: 0,
      revenue: 0,
      uniqueProducts: 0,
      profit: 0,
    };
    existing.orders += toNumber(row[columns.orders ?? -1]);
    existing.quantity += toNumber(row[columns.quantity ?? -1]);
    existing.revenue += toNumber(row[columns.revenue ?? -1]);
    existing.uniqueProducts += toNumber(row[columns.uniqueProducts ?? -1]);
    existing.profit += toNumber(row[columns.profit ?? -1]);
    byName.set(name, existing);
  }

  if (byName.size === 0) {
    return { error: "The sheet has no product rows under the header." };
  }
  return { rows: Array.from(byName.values()) };
}

/** Codenames shorter than this skip the slug fallback (too many false hits). */
const MIN_FALLBACK_LENGTH = 4;

/**
 * Resolve each codename to the client's product group key (see strategy above).
 * Returns lowercase codename → groupKey (null = not in the catalog).
 */
export async function matchCampaignNames(
  clientId: string,
  names: string[]
): Promise<Map<string, string | null>> {
  const products = await prisma.product.findMany({
    where: { clientId, groupKey: { not: null } },
    select: { groupKey: true },
    distinct: ["groupKey"],
  });
  const keys = new Map(
    products.map((product) => [
      normalizeGroupKey(product.groupKey as string),
      product.groupKey as string,
    ])
  );

  const result = new Map<string, string | null>();
  for (const name of names) {
    const exact = keys.get(normalizeGroupKey(name));
    if (exact) {
      result.set(name, exact);
      continue;
    }
    result.set(name, null);
  }

  // Slug-token fallback for the leftovers, e.g. "movejet" inside
  // "postolje-za-pomicanje-namjestaja-movejet".
  const unmatched = names.filter(
    (name) => result.get(name) === null && name.length >= MIN_FALLBACK_LENGTH
  );
  for (const name of unmatched) {
    const listings = await prisma.productListing.findMany({
      where: { clientId, slug: { contains: name } },
      select: { slug: true, product: { select: { groupKey: true } } },
      take: 20,
    });
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const boundary = new RegExp(`(?:^|-)${escaped}(?:-|$)`, "i");
    const counts = new Map<string, number>();
    for (const listing of listings) {
      const groupKey = listing.product.groupKey;
      if (!groupKey || !listing.slug || !boundary.test(listing.slug)) continue;
      counts.set(groupKey, (counts.get(groupKey) ?? 0) + 1);
    }
    const best = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (best) result.set(name, best[0]);
  }

  return result;
}
