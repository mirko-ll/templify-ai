"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { SectionHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import CustomSelect from "@/components/ui/custom-select";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { GroupedProductCard } from "./GroupedProductCard";
import { ProductDetailDrawer } from "./ProductDetailDrawer";
import {
  SORT_OPTIONS,
  STATUS_FILTERS,
  categoryLabel,
  flagEmoji,
  type GroupedResponse,
  type ProductGroup,
} from "./product-browser-types";

interface ProductsBrowserProps {
  clientId: string;
}

const PAGE_SIZE = 24;
const EMPTY_FACETS = {
  countries: [] as string[],
  categories: [] as string[],
  counts: {} as Record<string, number>,
};

/** Full product catalog: grouped offers with filters, pagination and detail. */
export default function ProductsBrowser({ clientId }: ProductsBrowserProps) {
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState(EMPTY_FACETS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [country, setCountry] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState(false);
  const [detailGroup, setDetailGroup] = useState<ProductGroup | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Debounce the search box; any new query starts back on page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status,
        sort,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (country) params.set("country", country);
      if (category) params.set("category", category);

      const response = await fetch(
        `/api/clients/${clientId}/products/grouped?${params.toString()}`
      );
      const payload = (await response.json().catch(() => ({}))) as
        | GroupedResponse
        | { error?: string };
      if (!response.ok) {
        throw new Error(
          ("error" in payload && payload.error) || "Failed to load products"
        );
      }
      const data = payload as GroupedResponse;
      setGroups(Array.isArray(data.groups) ? data.groups : []);
      setTotal(data.total ?? 0);
      setFacets(data.facets ?? EMPTY_FACETS);
      setSelected(new Set());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load products";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [clientId, debouncedSearch, status, country, category, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = facets.counts;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const countryOptions = useMemo(
    () => [
      { value: "", label: "All countries" },
      ...facets.countries.map((code) => ({
        value: code,
        label: `${flagEmoji(code)}  ${code}`,
      })),
    ],
    [facets.countries]
  );

  const categoryOptions = useMemo(
    () => [
      { value: "", label: "All categories" },
      ...facets.categories.map((value) => ({
        value,
        label: categoryLabel(value),
      })),
    ],
    [facets.categories]
  );

  const statusCount = (value: string) => {
    if (value === "ALL")
      return (counts.ACTIVE ?? 0) + (counts.POSSIBLY_UNAVAILABLE ?? 0);
    return counts[value] ?? 0;
  };

  const allOnPageSelected =
    groups.length > 0 && groups.every((group) => selected.has(group.key));

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (groups.every((group) => prev.has(group.key))) return new Set();
      return new Set(groups.map((group) => group.key));
    });
  };

  const archiveProductIds = async (productIds: string[], label: string) => {
    if (productIds.length === 0) return;
    setArchiving(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/products`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", productIds }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Failed to archive");
      toast.success(`${label} archived`);
      setDetailOpen(false);
      await load();
    } catch (err) {
      toast.error(
        "Couldn't archive",
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setArchiving(false);
    }
  };

  const archiveSelected = async () => {
    const chosen = groups.filter((group) => selected.has(group.key));
    const ids = chosen.flatMap((group) => group.productIds);
    const confirmed = await confirm({
      title: `Archive ${chosen.length} ${chosen.length === 1 ? "offer" : "offers"}?`,
      description: "Archived products are hidden from planning but not deleted.",
      confirmLabel: "Archive",
      confirmVariant: "danger",
    });
    if (!confirmed) return;
    await archiveProductIds(
      ids,
      `${chosen.length} ${chosen.length === 1 ? "offer" : "offers"}`
    );
  };

  const archiveGroup = async (group: ProductGroup) => {
    const confirmed = await confirm({
      title: `Archive “${group.slug}”?`,
      description: "Archived products are hidden from planning but not deleted.",
      confirmLabel: "Archive",
      confirmVariant: "danger",
    });
    if (!confirmed) return;
    await archiveProductIds(group.productIds, group.slug);
  };

  const openDetail = (group: ProductGroup) => {
    setDetailGroup(group);
    setDetailOpen(true);
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <Card>
      <div className="space-y-6 p-5 sm:p-6">
        <SectionHeader
          title="Product catalog"
          description="The stat counts are per-country listings; the grid groups the same product across its countries into one offer."
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={load}
              leftIcon={<ArrowPathIcon className="h-4 w-4" />}
            >
              Refresh
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Active"
            value={counts.ACTIVE ?? 0}
            hint="listings · per country"
            accent="success"
            icon={<CubeIcon className="h-4 w-4" />}
          />
          <StatCard
            label="Needs review"
            value={counts.POSSIBLY_UNAVAILABLE ?? 0}
            hint="listings · per country"
            accent="warning"
            icon={<ExclamationTriangleIcon className="h-4 w-4" />}
          />
          <StatCard
            label="Archived"
            value={counts.ARCHIVED ?? 0}
            hint="listings · per country"
            accent="neutral"
            icon={<TrashIcon className="h-4 w-4" />}
          />
          <StatCard
            label="Offers"
            value={total}
            hint="grouped across countries"
            accent="brand"
            icon={<CubeIcon className="h-4 w-4" />}
          />
        </div>

        {/* Filters */}
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 shadow-soft">
              <MagnifyingGlassIcon className="h-4 w-4 flex-shrink-0 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, code or description…"
                className="h-10 w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <CustomSelect
                className="w-44"
                value={category}
                onChange={(value) => {
                  setCategory(value);
                  setPage(1);
                }}
                options={categoryOptions}
              />
              <CustomSelect
                className="w-44"
                value={country}
                onChange={(value) => {
                  setCountry(value);
                  setPage(1);
                }}
                options={countryOptions}
              />
              <CustomSelect
                className="w-48"
                value={sort}
                onChange={(value) => {
                  setSort(value);
                  setPage(1);
                }}
                options={SORT_OPTIONS}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((filter) => {
              const active = status === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => {
                    setStatus(filter.value);
                    setPage(1);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                    active
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
                  )}
                >
                  {filter.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] tabular-nums",
                      active ? "bg-brand-100 text-brand-700" : "bg-surface-muted text-muted"
                    )}
                  >
                    {statusCount(filter.value)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selection action bar */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-2.5">
            <span className="text-sm font-medium text-brand-800">
              {selected.size} selected
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={archiveSelected}
                isLoading={archiving}
                leftIcon={<TrashIcon className="h-4 w-4" />}
              >
                Archive selected
              </Button>
            </div>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-64 w-full rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={<ArrowPathIcon className="h-6 w-6" />}
            title="Couldn't load products"
            description={error}
            action={
              <Button variant="secondary" onClick={load} leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
                Try again
              </Button>
            }
          />
        ) : groups.length === 0 ? (
          <EmptyState
            compact
            icon={<CubeIcon className="h-6 w-6" />}
            title="No products match"
            description={
              debouncedSearch || country || category || status !== "ALL"
                ? "Try clearing filters or searching for something else."
                : "Synced products will appear here once a source has been synced."
            }
          />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs font-medium text-muted transition-colors hover:text-ink"
              >
                {allOnPageSelected ? "Clear page" : "Select page"}
              </button>
              <p className="text-xs text-muted">
                Showing {rangeStart}–{rangeEnd} of {total} offers
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {groups.map((group) => (
                <GroupedProductCard
                  key={group.key}
                  group={group}
                  selected={selected.has(group.key)}
                  onToggleSelect={() => toggleSelect(group.key)}
                  onOpen={() => openDetail(group)}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  leftIcon={<ChevronLeftIcon className="h-4 w-4" />}
                >
                  Prev
                </Button>
                <span className="text-sm font-medium tabular-nums text-muted">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  rightIcon={<ChevronRightIcon className="h-4 w-4" />}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <ProductDetailDrawer
        group={detailGroup}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onArchive={archiveGroup}
        archiving={archiving}
        plannerHref={`/clients/${clientId}/planner`}
      />
      {confirmDialog}
    </Card>
  );
}
