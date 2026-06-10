"use client";

import { useState } from "react";
import {
  ArrowPathIcon,
  ChevronDownIcon,
  LinkIcon,
  PencilSquareIcon,
  RssIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { formatDate, type ProductSource } from "./product-catalog-types";

const COLLAPSED_COUNT = 6;

interface ProductSourceListProps {
  sources: ProductSource[];
  syncingSourceId: string | null;
  removingSourceId: string | null;
  syncingAll?: boolean;
  onSync: (id: string) => void;
  onSyncAll?: () => void;
  onEdit: (source: ProductSource) => void;
  onRemove: (id: string) => void;
}

export function ProductSourceList({
  sources,
  syncingSourceId,
  removingSourceId,
  syncingAll = false,
  onSync,
  onSyncAll,
  onEdit,
  onRemove,
}: ProductSourceListProps) {
  const [showAll, setShowAll] = useState(false);

  if (sources.length === 0) {
    return (
      <EmptyState
        compact
        icon={<RssIcon className="h-6 w-6" />}
        title="No product sources yet"
        description="Add a client website, category page, or product page to start syncing products."
      />
    );
  }

  const hasOverflow = sources.length > COLLAPSED_COUNT;
  const visibleSources =
    hasOverflow && !showAll ? sources.slice(0, COLLAPSED_COUNT) : sources;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">
          Sources{" "}
          <span className="font-normal text-muted">({sources.length})</span>
        </h3>
        {onSyncAll && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onSyncAll}
            disabled={syncingAll || syncingSourceId !== null}
            isLoading={syncingAll}
            leftIcon={
              !syncingAll ? <ArrowPathIcon className="h-4 w-4" /> : undefined
            }
          >
            {syncingAll ? "Starting…" : "Sync all"}
          </Button>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-soft">
        <ul className="divide-y divide-line">
          {visibleSources.map((source) => {
            const run = source.syncRuns?.[0];
            const isSyncing = syncingSourceId === source.id;
            const isRemoving = removingSourceId === source.id;
            return (
              <li
                key={source.id}
                className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-surface-muted/40 sm:px-4"
              >
                <span className="hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-line bg-surface-muted text-muted sm:flex">
                  <RssIcon className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-ink">
                      {source.name || source.countryCode || "Product source"}
                    </p>
                    {run && <StatusBadge status={run.status} />}
                  </div>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                  >
                    <LinkIcon className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{source.url}</span>
                  </a>
                </div>

                {/* Run summary — only where there's width */}
                <div className="hidden flex-shrink-0 text-right lg:block">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
                    Last sync · {formatDate(source.lastSyncedAt)}
                  </p>
                  {run && (
                    <p className="mt-0.5 flex items-center justify-end gap-2 text-xs tabular-nums">
                      <RunStat label="found" value={run.discoveredCount} />
                      <RunStat
                        label="new"
                        value={run.createdCount}
                        tone="emerald"
                      />
                      <RunStat
                        label="upd"
                        value={run.updatedCount}
                        tone="brand"
                      />
                      <RunStat
                        label="miss"
                        value={run.missingCount}
                        tone="amber"
                      />
                      <RunStat
                        label="fail"
                        value={run.failedCount}
                        tone="rose"
                      />
                    </p>
                  )}
                </div>

                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => onSync(source.id)}
                    disabled={isSyncing || isRemoving || syncingAll}
                    leftIcon={
                      <ArrowPathIcon
                        className={cn(
                          "h-4 w-4",
                          (isSyncing || syncingAll) && "animate-spin"
                        )}
                      />
                    }
                  >
                    <span className="hidden sm:inline">
                      {isSyncing ? "Syncing" : "Sync"}
                    </span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => onEdit(source)}
                    disabled={isSyncing || isRemoving || syncingAll}
                    title="Edit source"
                    aria-label="Edit source"
                    className="h-8 w-8"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => onRemove(source.id)}
                    disabled={isRemoving || isSyncing || syncingAll}
                    isLoading={isRemoving}
                    title="Remove source"
                    aria-label="Remove source"
                    className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    {!isRemoving && <TrashIcon className="h-4 w-4" />}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {hasOverflow && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll((prev) => !prev)}
            leftIcon={
              <ChevronDownIcon
                className={cn(
                  "h-4 w-4 transition-transform",
                  showAll && "rotate-180"
                )}
              />
            }
          >
            {showAll
              ? "Show fewer"
              : `Show all ${sources.length} sources`}
          </Button>
        </div>
      )}
    </div>
  );
}

function RunStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "emerald" | "brand" | "amber" | "rose";
}) {
  const toneClass = {
    muted: "text-muted",
    emerald: "text-emerald-600",
    brand: "text-brand-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
  }[tone];
  return (
    <span className={toneClass}>
      <span className="font-semibold">{value}</span> {label}
    </span>
  );
}
