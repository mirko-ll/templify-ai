"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowPathRoundedSquareIcon,
  CheckIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";
import type { ResendStats, ResendableCampaign } from "./planner-types";

interface ResendCampaignPickerProps {
  selectedId: string | null;
  /** Campaign ids already re-planned on this day — shown as disabled. */
  disabledIds?: Set<string>;
  /** campaignId → other dayKeys in this month that already resend it. */
  plannedElsewhere?: Map<string, string[]>;
  onSelect: (campaign: ResendableCampaign, stats: ResendStats | null) => void;
}

interface NewsletterMetrics {
  sentTotal: number;
  openTotal: number;
  clickTotal: number;
  openRate: number;
  clickRate: number;
}

/** Re-sending an identical email within this window risks list fatigue. */
const FATIGUE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** "12 May" (with year only when it differs from now). */
function formatShort(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  }).format(date);
}

/** "14 Jun" from a planner dayKey. */
function formatDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(y, (m || 1) - 1, d || 1)
  );
}

export function lastSentAt(campaign: ResendableCampaign): string | null {
  return campaign.sentAt ?? campaign.scheduledAt ?? null;
}

/** Days since the campaign went out; null when it hasn't (or date is unknown). */
export function daysSinceSent(campaign: ResendableCampaign): number | null {
  const value = lastSentAt(campaign);
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time) || time > Date.now()) return null;
  return Math.floor((Date.now() - time) / DAY_MS);
}

/** Weighted per-campaign engagement from its newsletters' metrics. */
function aggregateStats(
  campaign: ResendableCampaign,
  metrics: Record<string, NewsletterMetrics>
): ResendStats | null {
  let sentTotal = 0;
  let weightedOpen = 0;
  let weightedClick = 0;
  for (const newsletterId of campaign.newsletterIds) {
    const stats = metrics[newsletterId];
    if (!stats || stats.sentTotal === 0) continue;
    sentTotal += stats.sentTotal;
    weightedOpen += stats.openRate * stats.sentTotal;
    weightedClick += stats.clickRate * stats.sentTotal;
  }
  if (sentTotal === 0) return null;
  return {
    sentTotal,
    openRate: weightedOpen / sentTotal,
    clickRate: weightedClick / sentTotal,
  };
}

/** "38.2% opens" + a thin proportional bar — the picker's decision aid. */
function StatLine({
  rate,
  label,
  barClass,
}: {
  rate: number;
  label: string;
  barClass: string;
}) {
  const percent = Math.max(0, Math.min(100, rate * 100));
  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className="text-[11px] font-semibold tabular-nums text-ink">
        {percent.toFixed(1)}%
      </span>
      <span className="w-8 text-left text-[10px] text-muted">{label}</span>
      <span className="h-1 w-12 overflow-hidden rounded-full bg-line">
        <span
          className={cn("block h-full rounded-full", barClass)}
          style={{ width: `${percent}%` }}
        />
      </span>
    </div>
  );
}

/**
 * Server-backed search over campaigns that can be re-sent as-is. Engagement
 * (open/click rates) loads per result set from SqualoMail so the user can pick
 * past winners, and recently-sent campaigns carry a list-fatigue warning.
 */
export function ResendCampaignPicker({
  selectedId,
  disabledIds,
  plannedElsewhere,
  onSelect,
}: ResendCampaignPickerProps) {
  const params = useParams<{ id: string }>();
  const clientId = params?.id ?? "";

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<ResendableCampaign[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Record<string, NewsletterMetrics>>({});
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setLoading(true);
    const search = new URLSearchParams();
    if (debounced) search.set("search", debounced);
    fetch(`/api/clients/${clientId}/campaigns/resendable?${search.toString()}`)
      .then((response) => (response.ok ? response.json() : { campaigns: [], total: 0 }))
      .then((data) => {
        if (cancelled) return;
        setResults(Array.isArray(data.campaigns) ? data.campaigns : []);
        setTotal(data.total ?? 0);
      })
      .catch(() => {
        if (!cancelled) {
          setResults([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, debounced]);

  // Engagement for the visible result set — best-effort, rows render without it.
  useEffect(() => {
    if (!clientId) return;
    const ids = Array.from(new Set(results.flatMap((c) => c.newsletterIds)));
    if (ids.length === 0) {
      setMetrics({});
      return;
    }
    let cancelled = false;
    setMetricsLoading(true);
    fetch("/api/campaigns/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, newsletterIds: ids }),
    })
      .then((response) => (response.ok ? response.json() : { metrics: {} }))
      .then((data) => {
        if (!cancelled)
          setMetrics((data?.metrics as Record<string, NewsletterMetrics>) ?? {});
      })
      .catch(() => {
        if (!cancelled) setMetrics({});
      })
      .finally(() => {
        if (!cancelled) setMetricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, results]);

  const overflow = total - results.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 shadow-soft">
        <MagnifyingGlassIcon className="h-4 w-4 flex-shrink-0 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search past campaigns by subject or product…"
          className="h-10 w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          autoFocus
        />
      </div>

      <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {loading ? (
          <div className="space-y-1.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center gap-3 rounded-xl border border-line bg-surface p-2.5"
              >
                <div className="h-12 w-12 rounded-lg bg-surface-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 rounded bg-surface-muted" />
                  <div className="h-2.5 w-1/3 rounded bg-surface-muted" />
                </div>
                <div className="h-8 w-24 rounded bg-surface-muted" />
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="px-1 py-8 text-center">
            <ArrowPathRoundedSquareIcon className="mx-auto h-6 w-6 text-muted" />
            <p className="mt-2 text-sm text-muted">
              {debounced
                ? `No campaigns match “${query}”.`
                : "Nothing to resend yet — campaigns appear here once they've been generated and scheduled."}
            </p>
          </div>
        ) : (
          results.map((campaign) => {
            const isSelected = campaign.id === selectedId;
            const isDisabled = disabledIds?.has(campaign.id) ?? false;
            const stats = aggregateStats(campaign, metrics);
            const sinceDays = daysSinceSent(campaign);
            const sentRecently = sinceDays !== null && sinceDays < FATIGUE_DAYS;
            const otherDays = plannedElsewhere?.get(campaign.id) ?? [];
            const wentOut = campaign.status === "SENT" || campaign.status === "SENDING";
            const dateLabel = lastSentAt(campaign)
              ? `${wentOut ? "Sent" : "Sends"} ${formatShort(lastSentAt(campaign))}`
              : null;
            return (
              <button
                key={campaign.id}
                type="button"
                disabled={isDisabled}
                onClick={() => onSelect(campaign, stats)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
                  isDisabled
                    ? "cursor-not-allowed border-line bg-surface-muted/60 opacity-60"
                    : isSelected
                      ? "border-teal-300 bg-teal-50"
                      : "border-line bg-surface hover:border-line-strong hover:bg-surface-muted"
                )}
              >
                <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-surface-muted">
                  {campaign.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={campaign.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ArrowPathRoundedSquareIcon className="absolute inset-0 m-auto h-5 w-5 text-muted" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {campaign.isResend && (
                      <span title="This campaign was itself a resend">
                        <ArrowPathRoundedSquareIcon className="h-3.5 w-3.5 flex-shrink-0 text-teal-600" />
                      </span>
                    )}
                    <p className="truncate text-sm font-semibold text-ink">
                      {campaign.subject || campaign.name}
                    </p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {[
                      dateLabel,
                      campaign.countries.length > 0
                        ? campaign.countries.join(", ")
                        : null,
                      campaign.productNickname,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {(isDisabled || sentRecently || otherDays.length > 0) && (
                    <p
                      className={cn(
                        "mt-0.5 text-[11px] font-medium",
                        isDisabled
                          ? "text-muted"
                          : sentRecently
                            ? "text-amber-600"
                            : "text-teal-700"
                      )}
                    >
                      {isDisabled
                        ? "Already planned for this day"
                        : sentRecently
                          ? `Sent ${sinceDays === 0 ? "today" : `${sinceDays}d ago`} — same audience, watch for fatigue`
                          : `Also planned · ${otherDays.map(formatDayKey).join(", ")}`}
                    </p>
                  )}
                </div>

                <div className="flex-shrink-0">
                  {stats ? (
                    <div className="space-y-1">
                      <StatLine rate={stats.openRate} label="open" barClass="bg-teal-500" />
                      <StatLine
                        rate={stats.clickRate}
                        label="click"
                        barClass="bg-teal-700"
                      />
                    </div>
                  ) : metricsLoading ? (
                    <div className="space-y-1.5" aria-hidden>
                      <div className="h-2 w-24 animate-pulse rounded bg-surface-muted" />
                      <div className="h-2 w-24 animate-pulse rounded bg-surface-muted" />
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted">No stats yet</span>
                  )}
                </div>

                {isSelected && !isDisabled && (
                  <CheckIcon className="h-5 w-5 flex-shrink-0 text-teal-600" />
                )}
              </button>
            );
          })
        )}

        {!loading && overflow > 0 && (
          <p className="px-1 pt-1 text-center text-[11px] text-muted">
            Showing the {results.length} most recent of {total} — search to narrow.
          </p>
        )}
      </div>
    </div>
  );
}
