"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  CubeIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
  TagIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";
import { categoryLabel } from "@/lib/product-grouping";
import { ProductMediaViewer } from "./ProductMediaViewer";
import {
  availableCountries,
  formatMetric,
  groupPreviewUrl,
  type PerformanceEntry,
  type ProductGroup,
} from "./planner-types";

interface ProductPickerProps {
  selectedKey: string | null;
  eligible: Set<string>;
  /** Product keys already scheduled this day — shown as disabled. */
  disabledKeys?: Set<string>;
  /** Last imported month's stats by group key (optional decoration). */
  performance?: Map<string, PerformanceEntry> | null;
  /** Group key → leaderboard rank (by quantity) for the same month. */
  ranks?: Map<string, number> | null;
  /** Short month label for the stats line, e.g. "May". */
  performanceLabel?: string | null;
  onSelect: (group: ProductGroup) => void;
}

const PAGE_SIZE = 24;
/** Start fetching the next page when the list is scrolled within this of the end. */
const SCROLL_THRESHOLD_PX = 96;

function buildSearchParams(page: number, search: string, category: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) params.set("search", search);
  if (category) params.set("category", category);
  return params;
}

/**
 * Server-backed product search for the day editor. Queries the grouped catalog
 * endpoint (debounced) so the planner never has to load the whole catalog —
 * results reflect the same SI-preferred grouping and slug/title/description
 * search as the Products tab. Further pages load as the list is scrolled, so a
 * whole category can be browsed without refining the search. Typing also
 * surfaces matching categories as one-click filter shortcuts.
 */
export function ProductPicker({
  selectedKey,
  eligible,
  disabledKeys,
  performance,
  ranks,
  performanceLabel,
  onSelect,
}: ProductPickerProps) {
  const params = useParams<{ id: string }>();
  const clientId = params?.id ?? "";

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [results, setResults] = useState<ProductGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Media lightbox — kept mounted (with `open`) so it can animate out cleanly.
  const [viewerGroup, setViewerGroup] = useState<ProductGroup | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  // Monotonic id so a stale response can never clobber a newer query's results.
  const fetchIdRef = useRef(0);
  const pageRef = useRef(1);
  // Synchronous re-entry guard — scroll events fire faster than state settles.
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset and load the first page whenever the query or category changes.
  useEffect(() => {
    if (!clientId) return;
    const fetchId = ++fetchIdRef.current;
    pageRef.current = 1;
    setLoading(true);
    fetch(
      `/api/clients/${clientId}/products/grouped?${buildSearchParams(1, debounced, category)}`
    )
      .then((response) => (response.ok ? response.json() : { groups: [], total: 0 }))
      .then((data) => {
        if (fetchId !== fetchIdRef.current) return;
        setResults(Array.isArray(data.groups) ? data.groups : []);
        setTotal(data.total ?? 0);
        // Facets are client-wide (not narrowed by the current filters), so the
        // chip rail stays stable while searching.
        if (Array.isArray(data.facets?.categories)) {
          setCategories(data.facets.categories);
        }
        listRef.current?.scrollTo({ top: 0 });
      })
      .catch(() => {
        if (fetchId !== fetchIdRef.current) return;
        setResults([]);
        setTotal(0);
      })
      .finally(() => {
        if (fetchId === fetchIdRef.current) setLoading(false);
      });
  }, [clientId, debounced, category]);

  const hasMore = results.length < total;

  const loadMore = () => {
    if (!clientId || loading || loadingMoreRef.current || !hasMore) return;
    const fetchId = fetchIdRef.current;
    const nextPage = pageRef.current + 1;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    fetch(
      `/api/clients/${clientId}/products/grouped?${buildSearchParams(nextPage, debounced, category)}`
    )
      .then((response) => (response.ok ? response.json() : { groups: [] }))
      .then((data) => {
        if (fetchId !== fetchIdRef.current) return;
        pageRef.current = nextPage;
        const incoming: ProductGroup[] = Array.isArray(data.groups) ? data.groups : [];
        setResults((prev) => {
          const seen = new Set(prev.map((group) => group.key));
          return [...prev, ...incoming.filter((group) => !seen.has(group.key))];
        });
        if (typeof data.total === "number") setTotal(data.total);
      })
      .catch(() => {
        // Keep what we have; the load-more row stays available to retry.
      })
      .finally(() => {
        loadingMoreRef.current = false;
        if (fetchId === fetchIdRef.current) setLoadingMore(false);
      });
  };

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD_PX) {
      loadMore();
    }
  };

  // Categories matching the typed query — a shortcut past the chip rail.
  const lowerQuery = debounced.toLowerCase();
  const categorySuggestions =
    lowerQuery && !category
      ? categories
          .filter(
            (value) =>
              value.includes(lowerQuery) ||
              categoryLabel(value).toLowerCase().includes(lowerQuery)
          )
          .slice(0, 6)
      : [];

  const applyCategory = (value: string) => {
    setCategory(value);
    setQuery("");
  };

  const openViewer = (group: ProductGroup) => {
    setViewerGroup(group);
    setViewerOpen(true);
  };

  const chipClass = (active: boolean) =>
    cn(
      "flex-shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
      active
        ? "border-brand-300 bg-brand-50 text-brand-700"
        : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 shadow-soft">
        <MagnifyingGlassIcon className="h-4 w-4 flex-shrink-0 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, code, description or category…"
          className="h-10 w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          autoFocus
        />
      </div>

      {categories.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <TagIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted" aria-hidden />
          <button type="button" onClick={() => setCategory("")} className={chipClass(category === "")}>
            All
          </button>
          {categories.map((value) => {
            const active = category === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(active ? "" : value)}
                className={chipClass(active)}
              >
                {categoryLabel(value)}
              </button>
            );
          })}
        </div>
      )}

      {categorySuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-line bg-surface-muted/50 px-2.5 py-2">
          <span className="text-[11px] font-medium text-muted">Categories:</span>
          {categorySuggestions.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => applyCategory(value)}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100"
            >
              <TagIcon className="h-3 w-3" />
              {categoryLabel(value)}
            </button>
          ))}
        </div>
      )}

      <div ref={listRef} onScroll={handleScroll} className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {loading ? (
          <p className="px-1 py-6 text-center text-sm text-muted">Searching…</p>
        ) : results.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted">
            {debounced
              ? `No products match “${query}”${category ? ` in ${categoryLabel(category)}` : ""}.`
              : category
                ? `No products in ${categoryLabel(category)}.`
                : "No products yet."}
          </p>
        ) : (
          results.map((group) => {
            const isSelected = group.key === selectedKey;
            const isDisabled = disabledKeys?.has(group.key) ?? false;
            const countries = availableCountries(group, eligible);
            const perf = performance?.get(group.key) ?? null;
            const rank = ranks?.get(group.key) ?? null;
            const imageCount = group.images.length;
            const previewHref = groupPreviewUrl(group);
            return (
              <div
                key={group.key}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-2.5 transition-colors",
                  isDisabled
                    ? "border-line bg-surface-muted/60"
                    : isSelected
                      ? "border-brand-300 bg-brand-50"
                      : "border-line bg-surface hover:border-line-strong hover:bg-surface-muted"
                )}
              >
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => onSelect(group)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-3 text-left",
                    isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  )}
                >
                  <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-surface-muted">
                    {group.bestImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={group.bestImageUrl}
                        alt={group.slug}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <CubeIcon className="absolute inset-0 m-auto h-5 w-5 text-muted" />
                    )}
                    {imageCount > 1 && (
                      <span className="absolute bottom-0.5 right-0.5 inline-flex items-center gap-0.5 rounded-md bg-ink/70 px-1 py-px text-[9px] font-semibold text-white backdrop-blur-sm">
                        <PhotoIcon className="h-2.5 w-2.5" />
                        {imageCount}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-ink">
                        {group.slug}
                      </p>
                      {rank !== null && rank <= 10 && (
                        <span
                          className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                          title={`#${rank} by quantity sold${performanceLabel ? ` in ${performanceLabel}` : ""}`}
                        >
                          <TrophyIcon className="h-3 w-3" />
                          #{rank}
                        </span>
                      )}
                      {group.category && (
                        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-line bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-muted">
                          <TagIcon className="h-3 w-3" />
                          {categoryLabel(group.category)}
                        </span>
                      )}
                    </div>
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
                    {perf && (
                      <p className="mt-0.5 truncate text-[11px] text-muted">
                        {performanceLabel ? `${performanceLabel}: ` : ""}
                        {formatMetric("quantity", perf.quantity)} sold ·{" "}
                        {formatMetric("revenue", perf.revenue)} ·{" "}
                        {formatMetric("profit", perf.profit)} profit
                      </p>
                    )}
                  </div>
                </button>

                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {isSelected && !isDisabled && (
                    <CheckIcon className="h-5 w-5 text-brand-600" />
                  )}
                  {imageCount > 0 && (
                    <button
                      type="button"
                      onClick={() => openViewer(group)}
                      aria-label={`View media for ${group.slug}`}
                      title="View product media"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong bg-surface text-muted shadow-soft transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                    >
                      <PhotoIcon className="h-4 w-4" />
                    </button>
                  )}
                  {previewHref && (
                    <a
                      href={previewHref}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open preview page for ${group.slug}`}
                      title="Open product preview page"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong bg-surface text-muted shadow-soft transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                    >
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            );
          })
        )}

        {!loading && results.length > 0 && hasMore && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line px-1 py-2 text-[11px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-default"
          >
            {loadingMore
              ? "Loading more…"
              : `Showing ${results.length} of ${total} — scroll or click to load more`}
          </button>
        )}
      </div>

      <ProductMediaViewer
        group={viewerGroup}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        onSelect={onSelect}
      />
    </div>
  );
}
