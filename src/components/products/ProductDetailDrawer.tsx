"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import {
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  CubeIcon,
  TagIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge, type BadgeVariant } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { pickCanonicalListing } from "@/lib/product-grouping";
import { formatDate } from "./product-catalog-types";
import {
  categoryLabel,
  flagEmoji,
  listingPrice,
  statusLabel,
  type ProductGroup,
} from "./product-browser-types";

interface ProductDetailDrawerProps {
  group: ProductGroup | null;
  open: boolean;
  onClose: () => void;
  onArchive: (group: ProductGroup) => void;
  archiving: boolean;
  plannerHref: string;
}

/** Heuristic badge colour for a free-form availability string. */
function availabilityVariant(value: string): BadgeVariant {
  const v = value.toUpperCase();
  if (v.includes("UN") || v.includes("OUT") || v.includes("SOLD")) return "warning";
  if (v.includes("AVAIL") || v.includes("IN_STOCK") || v.includes("STOCK"))
    return "success";
  return "neutral";
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Right-anchored slide-over with a product offer's full per-country detail. */
export function ProductDetailDrawer({
  group,
  open,
  onClose,
  onArchive,
  archiving,
  plannerHref,
}: ProductDetailDrawerProps) {
  const [activeImage, setActiveImage] = useState<string | null>(null);

  useEffect(() => {
    if (group) setActiveImage(group.bestImageUrl ?? group.images[0] ?? null);
  }, [group]);

  // One canonical listing per country (collapse …-lp / …-2 variant URLs).
  const listings = useMemo(() => {
    if (!group) return [] as ProductGroup["listings"];
    const byCountry = new Map<string, ProductGroup["listings"]>();
    for (const listing of group.listings) {
      const code = (listing.countryCode ?? "").toUpperCase();
      const existing = byCountry.get(code);
      if (existing) existing.push(listing);
      else byCountry.set(code, [listing]);
    }
    return Array.from(byCountry.values())
      .map((countryListings) => pickCanonicalListing(countryListings))
      .sort((a, b) => (a.countryCode ?? "").localeCompare(b.countryCode ?? ""));
  }, [group]);

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-ink/40 backdrop-blur-sm transition-opacity duration-300 data-[closed]:opacity-0"
      />
      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-y-0 right-0 flex max-w-full">
          <DialogPanel
            transition
            className="flex w-screen max-w-md transform flex-col bg-surface shadow-overlay transition duration-300 ease-out data-[closed]:translate-x-full"
          >
            {group ? (
              <>
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-line p-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <DialogTitle className="truncate text-lg font-semibold tracking-tight text-ink">
                        {group.slug}
                      </DialogTitle>
                      <StatusBadge
                        status={group.status}
                        label={statusLabel(group.status)}
                      />
                      {group.category && (
                        <Badge variant="neutral" className="gap-1 text-[10px]">
                          <TagIcon className="h-3 w-3" />
                          {categoryLabel(group.category)}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">
                      {group.title}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="-mr-1 -mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-ink"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 space-y-5 overflow-y-auto p-5">
                  {/* Gallery */}
                  <div>
                    <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-line bg-surface-muted">
                      {activeImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={activeImage}
                          alt={group.slug}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted">
                          <CubeIcon className="h-10 w-10" />
                        </div>
                      )}
                    </div>
                    {group.images.length > 1 && (
                      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                        {group.images.slice(0, 12).map((url) => (
                          <button
                            key={url}
                            type="button"
                            onClick={() => setActiveImage(url)}
                            className={cn(
                              "h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
                              activeImage === url
                                ? "border-brand-500"
                                : "border-line hover:border-line-strong"
                            )}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {group.description && (
                    <p className="text-sm leading-relaxed text-body">
                      {group.description}
                    </p>
                  )}

                  {/* Per-country availability */}
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      Available in {group.countries.length}{" "}
                      {group.countries.length === 1 ? "country" : "countries"}
                    </h3>
                    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                      {listings.map((listing) => {
                        const price = listingPrice(listing);
                        return (
                          <div
                            key={listing.id}
                            className="flex items-center gap-3 px-3 py-2.5"
                          >
                            <span className="text-lg leading-none" aria-hidden>
                              {flagEmoji(listing.countryCode)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-ink">
                                  {listing.countryCode || "—"}
                                </span>
                                <Badge
                                  variant={availabilityVariant(listing.availability)}
                                  className="text-[10px]"
                                >
                                  {humanize(listing.availability)}
                                </Badge>
                              </div>
                              {price && (
                                <p className="mt-0.5 text-xs text-muted">{price}</p>
                              )}
                            </div>
                            <a
                              href={listing.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-line-strong text-muted transition-colors hover:bg-surface-muted hover:text-brand-700"
                              aria-label={`Open ${listing.countryCode} listing`}
                            >
                              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <p className="text-xs text-muted">
                    Last synced {formatDate(group.lastSeenAt ?? group.updatedAt)}
                  </p>
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-between gap-2 border-t border-line p-4">
                  <Button
                    variant="ghost"
                    onClick={() => onArchive(group)}
                    isLoading={archiving}
                    disabled={group.status === "ARCHIVED" || archiving}
                    leftIcon={<TrashIcon className="h-4 w-4" />}
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    {group.status === "ARCHIVED" ? "Archived" : "Archive"}
                  </Button>
                  <Link href={plannerHref}>
                    <Button leftIcon={<CalendarDaysIcon className="h-4 w-4" />}>
                      Open planner
                    </Button>
                  </Link>
                </div>
              </>
            ) : null}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
