/**
 * Destructive maintenance: wipe the product catalog for a clean re-sync.
 *
 * Deletes products, listings, images and the entire sync history, across ALL
 * clients. Product SOURCES are intentionally kept, so a "Sync all" repopulates
 * everything. Campaign-plan items keep their stored snapshots; only their
 * productId reference is detached.
 *
 *   npx tsx --env-file=.env scripts/wipe-products.ts
 */
import { prisma } from "../src/lib/prisma";

async function run() {
  // Child-first so it works whether or not DB-level cascades are enabled.
  const events = await prisma.productSyncEvent.deleteMany({});
  const runs = await prisma.productSyncRun.deleteMany({});
  const images = await prisma.productImage.deleteMany({});
  const listings = await prisma.productListing.deleteMany({});
  const detached = await prisma.campaignPlanItem.updateMany({
    where: { productId: { not: null } },
    data: { productId: null },
  });
  const products = await prisma.product.deleteMany({});

  const sourcesKept = await prisma.productSource.count();

  console.log("Catalog wiped:");
  console.table({
    syncEvents: events.count,
    syncRuns: runs.count,
    productImages: images.count,
    productListings: listings.count,
    planItemsDetached: detached.count,
    products: products.count,
    sourcesKept,
  });
}

run()
  .catch((error) => {
    console.error("Wipe failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
