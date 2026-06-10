"use client";

import { useEffect, useState } from "react";
import {
  CubeIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { CampaignUrlRule } from "@/lib/product-links";

export interface GroupedOfferListing {
  id: string;
  countryCode: string | null;
  title: string | null;
  normalizedTitle: string | null;
  url: string;
  slug: string | null;
  campaignUrl: string;
  campaignUrlRule?: CampaignUrlRule | null;
  priceRaw: string | null;
}

export interface GroupedOffer {
  key: string;
  slug: string;
  title: string;
  bestImageUrl: string | null;
  status: string;
  countries: string[];
  listings: GroupedOfferListing[];
}

interface CatalogSearchModalProps {
  open: boolean;
  clientId: string | null;
  onClose: () => void;
  onSelect: (offer: GroupedOffer) => void;
}

const PAGE_SIZE = 24;

/**
 * Server-backed product search for the /app generator. Queries the grouped
 * catalog endpoint (debounced) so it scales to large catalogs and matches the
 * planner's search (SI-preferred info; slug/title/description matching).
 */
export function CatalogSearchModal({
  open,
  clientId,
  onClose,
  onSelect,
}: CatalogSearchModalProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<GroupedOffer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Reset the query each time the modal opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setDebounced("");
    }
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open || !clientId) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: "1", pageSize: String(PAGE_SIZE) });
    if (debounced) params.set("search", debounced);
    fetch(`/api/clients/${clientId}/products/grouped?${params.toString()}`)
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
  }, [open, clientId, debounced]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const overflow = total - results.length;

  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="animate-[fadeIn_0.15s_ease-out] relative mt-[6vh] flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Search products</h3>
            <p className="text-sm text-gray-500">
              Pick a synced offer to auto-fill its country URLs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100">
            <MagnifyingGlassIcon className="h-5 w-5 flex-shrink-0 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, code or description…"
              autoFocus
              className="h-11 w-full bg-transparent text-sm text-slate-800 placeholder:text-gray-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="py-10 text-center text-sm text-gray-500">Searching…</p>
          ) : results.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">
              {debounced ? `No products match “${query}”.` : "No products yet."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {results.map((offer) => (
                <button
                  key={offer.key}
                  type="button"
                  onClick={() => {
                    onSelect(offer);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white p-2.5 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/50"
                >
                  <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                    {offer.bestImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={offer.bestImageUrl}
                        alt={offer.slug}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-300">
                        <CubeIcon className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {offer.slug}
                    </p>
                    <p className="truncate text-xs text-gray-500">{offer.title}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {offer.countries.map((code) => (
                        <span
                          key={code}
                          className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600"
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
              {overflow > 0 && (
                <p className="pt-1 text-center text-[11px] text-gray-400">
                  Showing first {results.length} of {total} — refine your search to
                  narrow.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
