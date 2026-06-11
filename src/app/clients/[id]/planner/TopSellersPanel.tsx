"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";
import {
  PERFORMANCE_METRICS,
  formatMetric,
  formatMonth,
  metricTrend,
  type PerformanceData,
  type PerformanceEntry,
  type PerformanceMetric,
} from "./planner-types";

interface TopSellersPanelProps {
  data: PerformanceData | null;
  /** Group keys already planned in the month being viewed. */
  plannedKeys: Set<string>;
  /** Where reports are imported — the client's Planning tab. */
  importHref: string;
}

const TOP_COUNT = 10;

/** Podium tint for the first three ranks. */
function rankClass(rank: number): string {
  if (rank === 1) return "text-amber-500";
  if (rank === 2) return "text-slate-400";
  if (rank === 3) return "text-amber-700/70";
  return "text-muted";
}

function TrendChip({
  entry,
  metric,
}: {
  entry: PerformanceEntry;
  metric: PerformanceMetric;
}) {
  const trend = metricTrend(entry, metric);
  if (trend === null) return null;
  const up = trend >= 0;
  return (
    <span
      className={cn(
        "inline-flex flex-shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
      )}
      title="vs previous imported month"
    >
      {up ? (
        <ArrowTrendingUpIcon className="h-3 w-3" />
      ) : (
        <ArrowTrendingDownIcon className="h-3 w-3" />
      )}
      {Math.abs(trend) >= 1000 ? ">999" : Math.abs(trend).toFixed(0)}%
    </span>
  );
}

function StatusChip({
  entry,
  plannedKeys,
}: {
  entry: PerformanceEntry;
  plannedKeys: Set<string>;
}) {
  if (!entry.groupKey) {
    return (
      <span className="inline-flex flex-shrink-0 items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
        Not in catalog
      </span>
    );
  }
  if (plannedKeys.has(entry.groupKey)) {
    return (
      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
        <CheckCircleIcon className="h-3 w-3" />
        Planned
      </span>
    );
  }
  return (
    <span className="inline-flex flex-shrink-0 items-center rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-medium text-muted">
      Not planned yet
    </span>
  );
}

/**
 * Last imported month's product leaderboard: rank by a switchable metric,
 * see month-over-month trends, and spot top sellers that aren't planned for
 * the month being viewed yet.
 */
export function TopSellersPanel({
  data,
  plannedKeys,
  importHref,
}: TopSellersPanelProps) {
  const [metric, setMetric] = useState<PerformanceMetric>("quantity");
  const [expanded, setExpanded] = useState(false);

  const entries = useMemo(() => {
    if (!data?.entries) return [] as PerformanceEntry[];
    return [...data.entries].sort((a, b) => b[metric] - a[metric]);
  }, [data, metric]);

  const max = useMemo(
    () => entries.reduce((acc, entry) => Math.max(acc, entry[metric]), 0),
    [entries, metric]
  );

  if (!data || !data.report) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface p-6 text-center shadow-soft">
        <TrophyIcon className="mx-auto h-7 w-7 text-muted" />
        <h2 className="mt-2 text-sm font-semibold text-ink">
          No sales report imported yet
        </h2>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted">
          Import last month&apos;s Campaign overview export in the Planning tab
          to see top sellers, trends and per-product sales right where you plan.
        </p>
        <Link
          href={importHref}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm font-semibold text-ink shadow-soft transition-colors hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-700"
        >
          <ArrowUpTrayIcon className="h-4 w-4" />
          Import in Planning tab
        </Link>
      </div>
    );
  }

  const visible = expanded ? entries : entries.slice(0, TOP_COUNT);
  const { report } = data;

  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
            <TrophyIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">
              Top sellers · {formatMonth(report.year, report.month)}
            </h2>
            <p className="text-xs text-muted">
              {report.rowCount} products · {report.matchedCount} matched to the
              catalog
              {data.previousMonth
                ? ` · trends vs ${formatMonth(data.previousMonth.year, data.previousMonth.month)}`
                : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-muted/70 p-0.5">
            {PERFORMANCE_METRICS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMetric(option.value)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                  metric === option.value
                    ? "bg-surface text-ink shadow-soft ring-1 ring-line"
                    : "text-muted hover:text-ink"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Link
            href={importHref}
            className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700"
          >
            Manage imports →
          </Link>
        </div>
      </div>

      <div className="mt-4 space-y-1">
        {visible.map((entry, index) => {
          const rank = index + 1;
          const value = entry[metric];
          const barWidth = max > 0 && value > 0 ? (value / max) * 100 : 0;
          return (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-muted/60"
            >
              <span
                className={cn(
                  "w-6 flex-shrink-0 text-right font-mono text-xs font-bold tabular-nums",
                  rankClass(rank)
                )}
              >
                {rank}
              </span>
              <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-md border border-line bg-surface-muted">
                {entry.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-ink">
                    {entry.campaignName}
                  </p>
                  <TrendChip entry={entry} metric={metric} />
                  <StatusChip entry={entry} plannedKeys={plannedKeys} />
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted">
                  {[
                    `${formatMetric("orders", entry.orders)} orders`,
                    `${formatMetric("quantity", entry.quantity)} sold`,
                    formatMetric("revenue", entry.revenue),
                    `${formatMetric("profit", entry.profit)} profit`,
                  ].join(" · ")}
                </p>
              </div>
              <div className="w-28 flex-shrink-0 sm:w-36">
                <p
                  className={cn(
                    "text-right text-sm font-bold tabular-nums",
                    value < 0 ? "text-rose-600" : "text-ink"
                  )}
                >
                  {formatMetric(metric, value)}
                </p>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-300",
                      rank <= 3 ? "bg-amber-400" : "bg-brand-400"
                    )}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {entries.length > TOP_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <ChevronDownIcon
            className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
          />
          {expanded ? "Show top 10" : `Show all ${entries.length}`}
        </button>
      )}
    </div>
  );
}
