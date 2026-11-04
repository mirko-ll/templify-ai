// Email results from SqualoMail (sent / unique opens / unique clicks per
// country newsletter), stored on CampaignCountry so price tests and the panel
// can use them without calling SqualoMail on every page load.

import { prisma } from "@/lib/prisma";
import { callTemplaitoBackend } from "@/lib/templaito-backend";
import { baseKeyOf } from "./keys";
import { priceNumber } from "./pricing";
import type { ClickRecord } from "./types";

const DAY = 86_400_000;
/** Look back this far for emails without results (first run backfills history). */
const STATS_LOOKBACK_DAYS = 60;
/** Results keep growing for a while after sending; refresh until then. */
const STATS_FINAL_AFTER_DAYS = 3;
/** Wait this long after sending before the first fetch. */
const STATS_FIRST_FETCH_HOURS = 6;
const MAX_PER_RUN = 600;

interface NewsletterMetrics {
  sentTotal: number;
  openTotal: number;
  clickTotal: number;
}

/** Fetch and store results for this client's recently sent emails. Returns how many rows were updated. */
export async function collectEmailStats(clientId: string, now = new Date()): Promise<number> {
  const rows = await prisma.campaignCountry.findMany({
    where: {
      isPushed: true,
      externalId: { not: null },
      campaign: {
        clientId,
        scheduledAt: {
          gte: new Date(now.getTime() - STATS_LOOKBACK_DAYS * DAY),
          lte: new Date(now.getTime() - STATS_FIRST_FETCH_HOURS * 3_600_000),
        },
      },
    },
    select: { id: true, externalId: true, statsFetchedAt: true, campaign: { select: { scheduledAt: true } } },
  });
  const due = rows
    .filter((row) => {
      if (!row.statsFetchedAt) return true;
      const sentAt = row.campaign.scheduledAt?.getTime() ?? 0;
      // Refresh once a day until the results are final.
      return row.statsFetchedAt.getTime() < sentAt + STATS_FINAL_AFTER_DAYS * DAY && now.getTime() - row.statsFetchedAt.getTime() > 20 * 3_600_000;
    })
    .slice(0, MAX_PER_RUN);
  if (!due.length) return 0;

  const { metrics } = await callTemplaitoBackend<{ metrics: Record<string, NewsletterMetrics | null> }>({
    path: "/integrations/squalomail/metrics",
    method: "POST",
    body: JSON.stringify({ clientId, newsletterIds: due.map((row) => row.externalId) }),
    signal: AbortSignal.timeout(10 * 60_000),
  });

  let updated = 0;
  for (const row of due) {
    const m = metrics[row.externalId!];
    if (!m) continue;
    await prisma.campaignCountry.update({
      where: { id: row.id },
      data: { statsSent: m.sentTotal, statsOpens: m.openTotal, statsClicks: m.clickTotal, statsFetchedAt: now },
    });
    updated += 1;
  }
  return updated;
}

/** Per product (baseKey): every sent email with its price and summed results, oldest first. */
export async function loadClickHistory(clientId: string, now = new Date()): Promise<Map<string, ClickRecord[]>> {
  const items = await prisma.campaignPlanItem.findMany({
    where: {
      plan: { clientId },
      campaignId: { not: null },
      sendDate: { gte: new Date(now.getTime() - 180 * DAY), lte: now },
    },
    select: { groupKey: true, campaignId: true, sendDate: true, priceOverride: true },
  });
  const campaignIds = items.map((i) => i.campaignId!).filter(Boolean);
  if (!campaignIds.length) return new Map();
  const countries = await prisma.campaignCountry.findMany({
    where: { campaignId: { in: campaignIds }, statsFetchedAt: { not: null } },
    select: { campaignId: true, statsSent: true, statsClicks: true },
  });
  const totals = new Map<string, { sent: number; clicks: number }>();
  for (const c of countries) {
    const t = totals.get(c.campaignId) ?? { sent: 0, clicks: 0 };
    t.sent += c.statsSent ?? 0;
    t.clicks += c.statsClicks ?? 0;
    totals.set(c.campaignId, t);
  }
  const history = new Map<string, ClickRecord[]>();
  for (const item of items) {
    const t = totals.get(item.campaignId!);
    if (!t || !item.groupKey || !item.sendDate || item.groupKey.startsWith("resend:")) continue;
    const base = baseKeyOf(item.groupKey);
    history.set(base, [
      ...(history.get(base) ?? []),
      { sendAt: item.sendDate, price: priceNumber(item.priceOverride), sent: t.sent, clicks: t.clicks },
    ]);
  }
  for (const list of history.values()) list.sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime());
  return history;
}

/** Per-country results of one campaign, for the detail pane. */
export async function campaignStats(campaignIds: string[]) {
  if (!campaignIds.length) return new Map<string, Array<{ countryCode: string; sent: number; opens: number; clicks: number }>>();
  const rows = await prisma.campaignCountry.findMany({
    where: { campaignId: { in: campaignIds }, statsFetchedAt: { not: null } },
    select: { campaignId: true, countryCode: true, statsSent: true, statsOpens: true, statsClicks: true },
  });
  const out = new Map<string, Array<{ countryCode: string; sent: number; opens: number; clicks: number }>>();
  for (const r of rows) {
    out.set(r.campaignId, [
      ...(out.get(r.campaignId) ?? []),
      { countryCode: r.countryCode, sent: r.statsSent ?? 0, opens: r.statsOpens ?? 0, clicks: r.statsClicks ?? 0 },
    ]);
  }
  for (const list of out.values()) list.sort((a, b) => a.countryCode.localeCompare(b.countryCode));
  return out;
}
