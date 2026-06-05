"use client";

import { CubeIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { Product } from "./product-catalog-types";

interface ProductsGridProps {
  products: Product[];
  selectedProductIds: Set<string>;
  allVisibleProductsSelected: boolean;
  visibleProductIds: string[];
  bulkRemoving: boolean;
  removingProductId: string | null;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onRemoveSelected: (ids: string[]) => void;
  onRemoveProduct: (id: string) => void;
}

export function ProductsGrid({
  products,
  selectedProductIds,
  allVisibleProductsSelected,
  visibleProductIds,
  bulkRemoving,
  removingProductId,
  onToggleSelect,
  onToggleSelectAll,
  onRemoveSelected,
  onRemoveProduct,
}: ProductsGridProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold tracking-tight text-ink">
            Latest products
          </h3>
          {selectedProductIds.size > 0 && (
            <p className="text-sm text-muted">
              {selectedProductIds.size} selected
            </p>
          )}
        </div>
        {products.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onToggleSelectAll}>
              {allVisibleProductsSelected ? "Clear visible" : "Select visible"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onRemoveSelected(Array.from(selectedProductIds))}
              disabled={selectedProductIds.size === 0 || bulkRemoving}
              isLoading={bulkRemoving}
              leftIcon={<TrashIcon className="h-4 w-4" />}
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              Remove selected
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemoveSelected(visibleProductIds)}
              disabled={visibleProductIds.length === 0 || bulkRemoving}
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              Remove visible
            </Button>
          </div>
        )}
      </div>

      {products.length === 0 ? (
        <EmptyState
          compact
          icon={<CubeIcon className="h-6 w-6" />}
          title="No products yet"
          description="Synced products will appear here once a source has been synced."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {products.map((product) => (
            <div
              key={product.id}
              className="flex gap-4 rounded-xl border border-line bg-surface p-4 shadow-soft"
            >
              <label className="mt-1 flex-shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedProductIds.has(product.id)}
                  onChange={() => onToggleSelect(product.id)}
                  className="h-4 w-4 cursor-pointer rounded border-line-strong accent-brand-600"
                  aria-label={`Select ${product.title}`}
                />
              </label>
              <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border border-line bg-surface-muted">
                {product.bestImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.bestImageUrl}
                    alt={product.title}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="line-clamp-2 font-semibold text-ink">
                    {product.title}
                  </p>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={product.status} dot={false} />
                    <button
                      type="button"
                      onClick={() => onRemoveProduct(product.id)}
                      disabled={removingProductId === product.id}
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-rose-100 bg-rose-50 text-rose-500 transition-colors hover:bg-rose-100 hover:text-rose-600 disabled:opacity-60"
                      title="Remove product"
                      aria-label={`Remove ${product.title}`}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted">
                  {product.description || "No description scraped yet"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {product.listings.slice(0, 6).map((listing) => (
                    <a
                      key={listing.id}
                      href={listing.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-line bg-surface-muted px-2 py-1 text-[11px] font-medium text-body transition-colors hover:border-brand-200 hover:text-brand-700"
                    >
                      {listing.countryCode || "URL"}
                      {listing.priceRaw ? ` · ${listing.priceRaw}` : ""}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
