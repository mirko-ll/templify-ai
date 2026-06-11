"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpTrayIcon, ChartBarIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ImportReportModal } from "@/app/clients/[id]/planner/ImportReportModal";
import {
  formatMonth,
  type PerformanceData,
} from "@/app/clients/[id]/planner/planner-types";

interface SalesReportsSectionProps {
  clientId: string;
}

/**
 * Monthly sales-report imports, managed alongside the monthly plans they
 * inform. The imported numbers surface in the planner (top sellers, product
 * picker stats, trends) — this section is where reports come in.
 */
export function SalesReportsSection({ clientId }: SalesReportsSectionProps) {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [eligible, setEligible] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}/product-performance`);
      if (!response.ok) return;
      setData((await response.json()) as PerformanceData);
    } catch {
      // Reports are an optional layer — the tab works without them.
    }
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    void refresh();
    // Eligible countries only drive labels in the modal's product picker.
    fetch(`/api/clients/${clientId}/countries`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const configs = Array.isArray(payload?.countries) ? payload.countries : [];
        setEligible(
          new Set<string>(
            configs
              .filter((config: any) => config.isActive && config.mailingListId)
              .map((config: any) => String(config.countryCode).toUpperCase())
          )
        );
      })
      .catch(() => null);
  }, [clientId, refresh]);

  const unlinked = data?.entries.filter((entry) => !entry.groupKey).length ?? 0;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Sales reports"
        description="Import each month's Campaign overview export — top sellers, trends and per-product stats then show up while planning."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setOpen(true)}
            leftIcon={<ArrowUpTrayIcon className="h-4 w-4" />}
          >
            Import report
          </Button>
        }
      />

      {!data?.report ? (
        <EmptyState
          compact
          icon={<ChartBarIcon className="h-6 w-6" />}
          title="No sales reports imported yet"
          description="Import last month's export to see top sellers and product stats in the planner."
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {data.reports.map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-soft transition-colors hover:border-brand-300 hover:bg-brand-50/40"
              title="Open report manager"
            >
              <span className="font-semibold text-ink">
                {formatMonth(report.year, report.month)}
              </span>
              <span className="text-muted">
                {report.rowCount} products · {report.matchedCount} matched
              </span>
              {report.rowCount - report.matchedCount > 0 && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  {report.rowCount - report.matchedCount} unlinked
                </span>
              )}
            </button>
          ))}
          {unlinked > 0 && (
            <span className="text-[11px] text-muted">
              Link the remaining products from the report manager.
            </span>
          )}
        </div>
      )}

      <ImportReportModal
        open={open}
        clientId={clientId}
        eligible={eligible}
        data={data}
        onClose={() => setOpen(false)}
        onChanged={refresh}
      />
    </div>
  );
}
