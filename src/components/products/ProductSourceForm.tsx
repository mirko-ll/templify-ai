"use client";

import { useMemo, useState } from "react";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  Squares2X2Icon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import {
  parseBulkSourceLines,
  type SourceFormState,
} from "./product-catalog-types";

interface ProductSourceFormProps {
  form: SourceFormState;
  onFormChange: (patch: Partial<SourceFormState>) => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  creating: boolean;
  bulkCreating: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  /**
   * Create many sources at once (shared name/config). Resolves with the input
   * lines that failed so they can stay in the textarea for a retry.
   */
  onBulkSubmit: (
    rows: Array<{ line: string; url: string; countryCode: string | null }>
  ) => Promise<string[]>;
}

const DEFAULT_SITEMAP_PATH = "/wp-sitemap.xml";

export function ProductSourceForm({
  form,
  onFormChange,
  showAdvanced,
  onToggleAdvanced,
  creating,
  bulkCreating,
  onSubmit,
  onBulkSubmit,
}: ProductSourceFormProps) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [bulkText, setBulkText] = useState("");
  const [sitemapPath, setSitemapPath] = useState(DEFAULT_SITEMAP_PATH);

  const rows = useMemo(
    () => (mode === "bulk" ? parseBulkSourceLines(bulkText, sitemapPath) : []),
    [mode, bulkText, sitemapPath]
  );
  const validRows = rows.filter((row) => row.url !== null);
  const invalidCount = rows.length - validRows.length;

  const submitBulk = async () => {
    if (validRows.length === 0 || bulkCreating) return;
    const failedLines = await onBulkSubmit(
      validRows.map((row) => ({
        line: row.line,
        url: row.url as string,
        countryCode: row.countryCode || null,
      }))
    );
    // Keep only what didn't make it (plus unparseable lines) for a retry.
    const keep = new Set([
      ...failedLines,
      ...rows.filter((row) => row.url === null).map((row) => row.line),
    ]);
    setBulkText(
      bulkText
        .split(/\r?\n/)
        .filter((line) => keep.has(line.trim()))
        .join("\n")
    );
  };

  return (
    <form
      onSubmit={(event) => {
        if (mode === "bulk") {
          event.preventDefault();
          void submitBulk();
          return;
        }
        onSubmit(event);
      }}
      className="rounded-xl border border-line bg-surface-muted/50 p-4 sm:p-5"
    >
      {/* Mode switch */}
      <div className="mb-3 flex items-center gap-0.5 self-start rounded-lg border border-line bg-surface p-0.5 text-xs font-semibold w-fit">
        {(
          [
            { value: "single", label: "Single source", icon: PlusIcon },
            { value: "bulk", label: "Bulk add", icon: Squares2X2Icon },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors",
              mode === value
                ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                : "text-muted hover:text-ink"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {mode === "single" ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <Input
            value={form.name}
            onChange={(event) => onFormChange({ name: event.target.value })}
            placeholder="Source name"
            aria-label="Source name"
          />
          <Input
            value={form.url}
            onChange={(event) => onFormChange({ url: event.target.value })}
            placeholder="Product sitemap URL, e.g. https://shop.com/wp-sitemap.xml"
            required
            aria-label="Product sitemap URL"
            className="lg:col-span-2"
          />
          <Input
            value={form.countryCode}
            onChange={(event) =>
              onFormChange({ countryCode: event.target.value.toUpperCase() })
            }
            placeholder="Country, e.g. SI"
            maxLength={8}
            aria-label="Country code"
          />
          <Button
            type="submit"
            isLoading={creating}
            leftIcon={<PlusIcon className="h-4 w-4" />}
          >
            Add source
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Input
              value={form.name}
              onChange={(event) => onFormChange({ name: event.target.value })}
              placeholder="Shared name, e.g. Superzebra — saved as “Superzebra SI”, “Superzebra SK”…"
              aria-label="Shared source name"
              className="lg:col-span-2"
            />
            <Input
              value={sitemapPath}
              onChange={(event) => setSitemapPath(event.target.value)}
              placeholder="Sitemap path for bare domains"
              aria-label="Sitemap path appended to bare domains"
            />
          </div>
          <Textarea
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value)}
            rows={6}
            aria-label="One shop per line"
            placeholder={
              "One shop per line — the country is detected from the domain:\nsuper-zebra.si\nsuperzebra.sk\nsuperzebra.hr\nsuperzebra.com SI   ← add the code yourself when the domain doesn't say"
            }
          />

          {rows.length > 0 && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line bg-surface p-2">
              {rows.map((row, index) => (
                <div
                  key={`${row.line}-${index}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-xs"
                >
                  {row.url === null ? (
                    <XCircleIcon className="h-4 w-4 flex-shrink-0 text-rose-500" />
                  ) : row.countryCode ? (
                    <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                  ) : (
                    <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-amber-500" />
                  )}
                  <span
                    className={cn(
                      "w-9 flex-shrink-0 font-mono font-bold",
                      row.countryCode ? "text-ink" : "text-amber-600"
                    )}
                  >
                    {row.countryCode || "??"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {row.url ?? `${row.line} — not a valid URL`}
                  </span>
                  {form.name.trim() && row.url && (
                    <span className="flex-shrink-0 text-muted">
                      → {form.name.trim()} {row.countryCode}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">
              {rows.length === 0
                ? "Paste your shop list to preview what will be created."
                : [
                    `${validRows.length} ${validRows.length === 1 ? "source" : "sources"} ready`,
                    invalidCount > 0 ? `${invalidCount} invalid` : null,
                    validRows.some((row) => !row.countryCode)
                      ? "rows marked ?? need a country — add it after the URL"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
            <Button
              type="submit"
              disabled={validRows.length === 0}
              isLoading={bulkCreating}
              leftIcon={<PlusIcon className="h-4 w-4" />}
            >
              Add {validRows.length > 0 ? validRows.length : ""}{" "}
              {validRows.length === 1 ? "source" : "sources"}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={onToggleAdvanced}
          className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink"
        >
          <ChevronDownIcon
            className={cn(
              "h-4 w-4 transition-transform",
              showAdvanced && "rotate-180"
            )}
          />
          {showAdvanced
            ? "Hide campaign link options"
            : "Campaign link options (optional)"}
        </button>
        <p className="mt-1 text-xs text-muted">
          {mode === "bulk"
            ? "Bare domains get the sitemap path appended automatically; full URLs are used as-is. The campaign link options below apply to every source created."
            : "Paste the shop's sitemap (or its product sitemap) — products are read straight from it, nothing else to configure. The options below only customize the campaign tracking links and are optional."}
        </p>
      </div>

      {showAdvanced && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <Input
              value={form.campaignUrlTemplate}
              onChange={(event) =>
                onFormChange({ campaignUrlTemplate: event.target.value })
              }
              placeholder="Campaign URL template, e.g. {url}/?sp=77{priceInt}i997&utm_source=Mailing&utm_campaign={utmCampaign}&utm_medium=squalomail_rok"
              aria-label="Campaign URL template"
              className="lg:col-span-3"
            />
            <Input
              value={form.defaultPrice}
              onChange={(event) =>
                onFormChange({ defaultPrice: event.target.value })
              }
              placeholder="Default price"
              aria-label="Default price"
            />
          </div>
          <p className="text-xs text-muted">
            URL placeholders: {"{url}"}, {"{rawUrl}"}, {"{slug}"}, {"{price}"},{" "}
            {"{priceInt}"}, {"{utmCampaign}"}, {"{countryCode}"}. For Vigoshop HR
            use the same template but `spe` instead of `sp`.
          </p>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Textarea
              value={form.countryCampaignUrlTemplates}
              onChange={(event) =>
                onFormChange({
                  countryCampaignUrlTemplates: event.target.value,
                })
              }
              rows={3}
              aria-label="Country campaign URL overrides"
              placeholder={
                "Country overrides, one per line:\nHR={url}/?spe=77{priceInt}i997...\nSI={url}/?sp=77{priceInt}i997..."
              }
            />
            <Textarea
              value={form.domainCampaignUrlTemplates}
              onChange={(event) =>
                onFormChange({ domainCampaignUrlTemplates: event.target.value })
              }
              rows={3}
              aria-label="Website campaign URL overrides"
              placeholder={
                "Website overrides, one per line:\nvigoshop.hr={url}/?spe=77{priceInt}i997...\nvigoshop.si={url}/?sp=77{priceInt}i997..."
              }
            />
          </div>
        </div>
      )}
    </form>
  );
}
