/**
 * One-time backfill of Product.groupKey for existing rows.
 *
 * New products get their groupKey set during sync (backend), but rows created
 * before that column existed are null — which breaks the SQL-grouped catalog
 * count. Run this once after `prisma db push` adds the column:
 *
 *   npx tsx scripts/backfill-product-group-keys.ts
 *
 * Idempotent: it only writes rows whose computed key differs from the stored
 * one, so it's safe to re-run.
 */
import { prisma } from "../src/lib/prisma";
import { productGroupKey } from "../src/lib/product-grouping";

const BATCH = 1000;
const WRITE_CONCURRENCY = 20;

async function run() {
  let cursor: string | undefined;
  let scanned = 0;
  let updated = 0;

  for (;;) {
    const products = await prisma.product.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, title: true, groupKey: true },
    });
    if (products.length === 0) break;

    const stale = products.filter((p) => productGroupKey(p.title) !== (p.groupKey ?? ""));

    for (let i = 0; i < stale.length; i += WRITE_CONCURRENCY) {
      const chunk = stale.slice(i, i + WRITE_CONCURRENCY);
      await Promise.all(
        chunk.map((p) =>
          prisma.product.update({
            where: { id: p.id },
            data: { groupKey: productGroupKey(p.title) },
          })
        )
      );
    }

    scanned += products.length;
    updated += stale.length;
    cursor = products[products.length - 1].id;
    console.log(`Scanned ${scanned}, updated ${updated}…`);
  }

  console.log(`\nDone. Scanned ${scanned} products, set groupKey on ${updated}.`);
}

run()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
