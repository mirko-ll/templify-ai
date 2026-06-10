"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";
import { availableCountries, type ProductGroup } from "./planner-types";

interface ProductPickerProps {
  selectedKey: string | null;
  eligible: Set<string>;
  /** Product keys already scheduled this day — shown as disabled. */
  disabledKeys?: Set<string>;
  onSelect: (group: ProductGroup) => void;
}

const PAGE_SIZE = 24;

/**
 * Server-backed product search for the day editor. Queries the grouped catalog
 * endpoint (debounced) so the planner never has to load the whole catalog —
 * results reflect the same SI-preferred grouping and slug/title/description
 * search as the Products tab.
 */
export function ProductPicker({
  selectedKey,
  eligible,
  disabledKeys,
  onSelect,
}: ProductPickerProps) {
  const params = useParams<{ id: string }>();
  const clientId = params?.id ?? "";

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<ProductGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setLoading(true);
    const search = new URLSearchParams({ page: "1", pageSize: String(PAGE_SIZE) });
    if (debounced) search.set("search", debounced);
    fetch(`/api/clients/${clientId}/products/grouped?${search.toString()}`)
      .then((response) => (response.ok ? response.json() : { groups: [], total: 0 }))
      .then((data) => {
        if (cancelled) return;
        setResults(Array.isArray(data.groups) ? data.groups : []);
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

  const overflow = total - results.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 shadow-soft">
        <MagnifyingGlassIcon className="h-4 w-4 flex-shrink-0 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, code or description…"
          className="h-10 w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          autoFocus
        />
      </div>

      <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {loading ? (
          <p className="px-1 py-6 text-center text-sm text-muted">Searching…</p>
        ) : results.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted">
            {debounced ? `No products match “${query}”.` : "No products yet."}
          </p>
        ) : (
          results.map((group) => {
            const isSelected = group.key === selectedKey;
            const isDisabled = disabledKeys?.has(group.key) ?? false;
            const countries = availableCountries(group, eligible);
            return (
              <button
                key={group.key}
                type="button"
                disabled={isDisabled}
                onClick={() => onSelect(group)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
                  isDisabled
                    ? "cursor-not-allowed border-line bg-surface-muted/60 opacity-60"
                    : isSelected
                      ? "border-brand-300 bg-brand-50"
                      : "border-line bg-surface hover:border-line-strong hover:bg-surface-muted"
                )}
              >
                <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-surface-muted">
                  {group.bestImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={group.bestImageUrl}
                      alt={group.slug}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{group.slug}</p>
                  <p className="truncate text-xs text-muted">{group.title}</p>
                  <p
                    className={cn(
                      "mt-0.5 text-[11px] font-medium",
                      isDisabled
                        ? "text-muted"
                        : countries.length > 0
                          ? "text-brand-600"
                          : "text-amber-600"
                    )}
                  >
                    {isDisabled
                      ? "Already scheduled this day"
                      : countries.length > 0
                        ? `${countries.length} active ${
                            countries.length === 1 ? "country" : "countries"
                          }: ${countries.join(", ")}`
                        : "No active mailing-list country"}
                  </p>
                </div>
                {isSelected && !isDisabled && (
                  <CheckIcon className="h-5 w-5 flex-shrink-0 text-brand-600" />
                )}
              </button>
            );
          })
        )}

        {!loading && overflow > 0 && (
          <p className="px-1 pt-1 text-center text-[11px] text-muted">
            Showing first {results.length} of {total} — refine your search to narrow.
          </p>
        )}
      </div>
    </div>
  );
}
