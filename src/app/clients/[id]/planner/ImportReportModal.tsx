"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  DocumentArrowUpIcon,
  LinkIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/field";
import CustomSelect from "@/components/ui/custom-select";
import { cn } from "@/lib/cn";
import { ProductPicker } from "./ProductPicker";
import {
  formatMetric,
  formatMonth,
  type PerformanceData,
  type PerformanceEntry,
} from "./planner-types";

interface ImportReportModalProps {
  open: boolean;
  clientId: string;
  /** Needed by the inline product picker used for manual linking. */
  eligible: Set<string>;
  data: PerformanceData | null;
  onClose: () => void;
  /** Imports/links/deletes happened — the page should refetch performance. */
  onChanged: () => Promise<void> | void;
}

/** The last 14 months as picker options, newest first. */
function monthOptions(): Array<{ value: string; label: string }> {
  const now = new Date();
  return Array.from({ length: 14 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return { value: `${year}-${month}`, label: formatMonth(year, month) };
  });
}

/**
 * Manage monthly sales-report imports: upload the Campaign overview xlsx for
 * a chosen month (re-upload replaces it), link rows the auto-matcher couldn't
 * resolve, and remove months imported by mistake.
 */
export function ImportReportModal({
  open,
  clientId,
  eligible,
  data,
  onClose,
  onChanged,
}: ImportReportModalProps) {
  const options = useMemo(monthOptions, []);
  const [month, setMonth] = useState(options[0]?.value ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setError("");
    setSuccess("");
    setLinkingId(null);
  }, [open]);

  const unmatched = useMemo(
    () => (data?.entries ?? []).filter((entry) => !entry.groupKey),
    [data]
  );

  const acceptFile = (candidate: File | null | undefined) => {
    if (!candidate) return;
    if (!/\.(xlsx|xls)$/i.test(candidate.name)) {
      setError("Pick the .xlsx export (Campaign overview).");
      return;
    }
    setFile(candidate);
    setError("");
  };

  const handleImport = async () => {
    if (!file || busy) return;
    const [year, monthNumber] = month.split("-").map(Number);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("year", String(year));
      form.set("month", String(monthNumber));
      const response = await fetch(
        `/api/clients/${clientId}/product-performance/import`,
        { method: "POST", body: form }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Import failed");
      }
      const report = payload.report as { rowCount: number; matchedCount: number };
      setSuccess(
        `${formatMonth(year, monthNumber)} imported — ${report.matchedCount} of ${report.rowCount} products matched automatically.`
      );
      setFile(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const handleLink = async (entry: PerformanceEntry, groupKey: string) => {
    try {
      const response = await fetch(
        `/api/clients/${clientId}/product-performance/entries/${entry.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupKey }),
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to link the product");
      }
      setLinkingId(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link the product");
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    try {
      const response = await fetch(
        `/api/clients/${clientId}/product-performance/reports/${reportId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to delete the report");
      }
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the report");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import sales report"
      description="Upload the monthly Campaign overview export — it powers top sellers, trends and per-product stats while planning."
      size="lg"
    >
      <div className="space-y-5">
        {/* Upload */}
        <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
          <div>
            <Label className="mb-1.5 block">Report month</Label>
            <CustomSelect value={month} onChange={setMonth} options={options} />
          </div>
          <div>
            <Label className="mb-1.5 block">File</Label>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                acceptFile(event.dataTransfer.files?.[0]);
              }}
              className={cn(
                "flex h-[42px] w-full items-center gap-2 rounded-lg border border-dashed px-3 text-sm transition-colors",
                dragging
                  ? "border-brand-400 bg-brand-50/60 text-brand-700"
                  : file
                    ? "border-emerald-300 bg-emerald-50/50 text-emerald-800"
                    : "border-line-strong bg-surface-muted/40 text-muted hover:border-brand-300 hover:text-ink"
              )}
            >
              {file ? (
                <>
                  <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                  <span className="min-w-0 flex-1 truncate text-left font-medium">
                    {file.name}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Clear file"
                    onClick={(event) => {
                      event.stopPropagation();
                      setFile(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.stopPropagation();
                        setFile(null);
                      }
                    }}
                    className="rounded p-0.5 text-muted hover:text-ink"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </span>
                </>
              ) : (
                <>
                  <DocumentArrowUpIcon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">
                    Drop the .xlsx here or click to browse
                  </span>
                </>
              )}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                acceptFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted">
            Re-importing a month replaces its previous upload.
          </p>
          <Button
            onClick={handleImport}
            disabled={!file || busy}
            isLoading={busy}
            leftIcon={<ArrowUpTrayIcon className="h-4 w-4" />}
          >
            Import
          </Button>
        </div>

        {success && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {success}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Unmatched rows — manual linking */}
        {data?.report && unmatched.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <h3 className="text-sm font-semibold text-ink">
              {unmatched.length}{" "}
              {unmatched.length === 1 ? "product isn't" : "products aren't"} linked
              to the catalog ·{" "}
              {formatMonth(data.report.year, data.report.month)}
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              Link them to show their stats while planning — or leave them if
              they&apos;re not Templaito products.
            </p>
            <div className="mt-3 space-y-2">
              {unmatched.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-line bg-surface p-3 shadow-soft"
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">
                        {entry.campaignName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {formatMetric("quantity", entry.quantity)} sold ·{" "}
                        {formatMetric("revenue", entry.revenue)} ·{" "}
                        {formatMetric("profit", entry.profit)} profit
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setLinkingId((current) =>
                          current === entry.id ? null : entry.id
                        )
                      }
                      leftIcon={<LinkIcon className="h-4 w-4" />}
                    >
                      {linkingId === entry.id ? "Cancel" : "Link product"}
                    </Button>
                  </div>
                  {linkingId === entry.id && (
                    <div className="mt-3 border-t border-line pt-3">
                      <ProductPicker
                        selectedKey={null}
                        eligible={eligible}
                        onSelect={(group) => void handleLink(entry, group.key)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Imported months */}
        {(data?.reports.length ?? 0) > 0 && (
          <div>
            <Label className="mb-1.5 block">Imported months</Label>
            <div className="flex flex-wrap gap-2">
              {data!.reports.map((report) => (
                <span
                  key={report.id}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-muted/60 px-2.5 py-1.5 text-xs text-ink"
                >
                  <span className="font-semibold">
                    {formatMonth(report.year, report.month)}
                  </span>
                  <span className="text-muted">
                    {report.matchedCount}/{report.rowCount} matched
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${formatMonth(report.year, report.month)} report`}
                    onClick={() => void handleDeleteReport(report.id)}
                    className="rounded p-0.5 text-muted transition-colors hover:bg-rose-50 hover:text-rose-600"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end pt-1">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
