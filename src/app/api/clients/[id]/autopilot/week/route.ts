import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, errorResponse } from "@/lib/autopilot/api";
import { SLOT_TAKEN_WINDOW_MS } from "@/lib/autopilot/engine";
import { reconcileClient } from "@/lib/autopilot/reconcile";
import { recentRuns } from "@/lib/autopilot/run";
import { ensureConfig, settingsOf } from "@/lib/autopilot/store";
import { pickCanonicalListing, type ProductGroup } from "@/lib/product-grouping";
import { loadProductGroups } from "@/lib/product-groups";
import { listingPrice } from "@/lib/autopilot/loader";
import { campaignStats } from "@/lib/autopilot/stats";
import { addDays, localDateOf, zonedTimeToUtc } from "@/lib/autopilot/time";

/** Shop pages of a product for the detail view: one canonical page per country. */
function productDetail(group: ProductGroup | undefined) {
  if (!group) return null;
  const byCountry = new Map<string, ProductGroup["listings"]>();
  for (const listing of group.listings) {
    const code = (listing.countryCode ?? "").toUpperCase();
    if (!code) continue;
    byCountry.set(code, [...(byCountry.get(code) ?? []), listing]);
  }
  const pages = [...byCountry.entries()]
    .map(([countryCode, listings]) => {
      const page = pickCanonicalListing(listings);
      return {
        countryCode,
        url: page.url,
        title: page.title,
        // Only a real product price — some pages put the shipping fee in the price slot.
        price: [page.salePrice, page.priceRaw, page.regularPrice].find((text) => listingPrice(text) !== null)?.replace(/\s*\/.*$/, "") ?? null,
        inStock: page.availability === "IN_STOCK",
      };
    })
    .sort((a, b) => a.countryCode.localeCompare(b.countryCode));
  return {
    title: group.title,
    description: group.description,
    images: group.images.slice(0, 6),
    category: group.category,
    pages,
  };
}

/** The nightly run's local time — a day locks at this time, lockDaysBefore days ahead. */
const NIGHTLY_TIME = "06:00";

/**
 * The rolling review window: today … today+prefillDays, each day with its
 * Autopilot slots, every plan item that day (manual ones too) and when it locks.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.response) return auth.response;

  try {
    const config = await ensureConfig(id);
    const settings = settingsOf(config);
    if (config.mode === "ON") await reconcileClient(id);

    const now = new Date();
    const today = localDateOf(now, settings.timezone);
    const dates = Array.from({ length: settings.rules.prefillDays + 1 }, (_, i) => addDays(today, i));
    const start = zonedTimeToUtc(dates[0], "00:00", settings.timezone);
    const end = zonedTimeToUtc(addDays(dates[dates.length - 1], 1), "00:00", settings.timezone);

    const [slots, items, runs] = await Promise.all([
      prisma.autopilotSlot.findMany({ where: { clientId: id, date: { in: dates } }, orderBy: [{ date: "asc" }, { slotIndex: "asc" }] }),
      prisma.campaignPlanItem.findMany({
        where: { plan: { clientId: id, status: { not: "CANCELLED" } }, sendDate: { gte: start, lt: end } },
        orderBy: { sendDate: "asc" },
        select: {
          id: true,
          planId: true,
          groupKey: true,
          sendDate: true,
          status: true,
          campaignId: true,
          priceOverride: true,
          errorMessage: true,
          productSnapshot: true,
        },
      }),
      recentRuns(id, 3),
    ]);

    // Full product info (images, shop pages per country) for every picked product.
    const groupKeys = [...new Set(slots.map((s) => s.groupKey).filter((k): k is string => !!k))];
    const groups = new Map((await loadProductGroups(id, groupKeys, {})).map((g) => [g.key, g]));

    // Email results per country for sends that already went out.
    const stats = await campaignStats(items.map((i) => i.campaignId).filter((c): c is string => !!c));

    const slotItem = (slot: (typeof slots)[number]) =>
      items.find(
        (item) =>
          item.groupKey === slot.groupKey &&
          item.sendDate &&
          Math.abs(item.sendDate.getTime() - slot.sendAt.getTime()) <= SLOT_TAKEN_WINDOW_MS
      ) ?? null;
    const usedItems = new Set<string>();

    const days = dates.map((date) => {
      const daySlots = slots
        .filter((slot) => slot.date === date)
        .map((slot) => {
          const item = slot.shadow ? null : slotItem(slot);
          if (item) usedItems.add(item.id);
          return {
            ...slot,
            detail: slot.groupKey ? productDetail(groups.get(slot.groupKey)) : null,
            item: item
              ? {
                  id: item.id,
                  planId: item.planId,
                  status: item.status,
                  campaignId: item.campaignId,
                  errorMessage: item.errorMessage,
                  priceOverride: item.priceOverride,
                  stats: item.campaignId ? stats.get(item.campaignId) ?? [] : [],
                }
              : null,
          };
        });
      return {
        date,
        lockAt: zonedTimeToUtc(addDays(date, -settings.rules.lockDaysBefore), NIGHTLY_TIME, settings.timezone),
        slots: daySlots,
        items: [] as Array<Record<string, unknown>>,
      };
    });

    // Plan items no slot owns (the boss's own picks) — shown so the day is complete.
    for (const item of items) {
      if (usedItems.has(item.id) || !item.sendDate) continue;
      const day = days.find((d) => d.date === localDateOf(item.sendDate!, settings.timezone));
      const snapshot = (item.productSnapshot ?? {}) as { title?: string; bestImageUrl?: string | null; slug?: string };
      day?.items.push({
        id: item.id,
        planId: item.planId,
        groupKey: item.groupKey,
        sendDate: item.sendDate,
        status: item.status,
        campaignId: item.campaignId,
        priceOverride: item.priceOverride,
        title: snapshot.title ?? snapshot.slug ?? item.groupKey,
        imageUrl: snapshot.bestImageUrl ?? null,
      });
    }

    return NextResponse.json({
      mode: config.mode,
      timezone: settings.timezone,
      slotTimes: settings.slotTimes,
      lockDaysBefore: settings.rules.lockDaysBefore,
      today,
      now,
      days,
      runs,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
