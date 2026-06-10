"use client";

import { CheckIcon, CubeIcon, GlobeAltIcon } from "@heroicons/react/24/outline";
import { StatusBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import {
  flagEmoji,
  statusLabel,
  type ProductGroup,
} from "./product-browser-types";

interface GroupedProductCardProps {
  group: ProductGroup;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}

const MAX_CHIPS = 6;

/** One offer in the catalog grid — image, status, and its available countries. */
export function GroupedProductCard({
  group,
  selected,
  onToggleSelect,
  onOpen,
}: GroupedProductCardProps) {
  const visible = group.countries.slice(0, MAX_CHIPS);
  const overflow = group.countries.length - visible.length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-surface text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
        selected ? "border-brand-400 ring-2 ring-brand-500/20" : "border-line hover:border-brand-300"
      )}
    >
      {/* Selection checkbox */}
      <button
        type="button"
        aria-label={selected ? "Deselect product" : "Select product"}
        onClick={(event) => {
          event.stopPropagation();
          onToggleSelect();
        }}
        className={cn(
          "absolute left-2.5 top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-md border shadow-soft transition-all",
          selected
            ? "border-brand-500 bg-brand-600 text-white"
            : "border-line-strong bg-surface/90 text-transparent opacity-0 backdrop-blur group-hover:opacity-100 hover:text-muted"
        )}
      >
        <CheckIcon className="h-4 w-4" />
      </button>

      {/* Image banner */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-muted">
        {group.bestImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={group.bestImageUrl}
            alt={group.slug}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <CubeIcon className="h-10 w-10" />
          </div>
        )}
        <div className="absolute right-2.5 top-2.5">
          <StatusBadge
            status={group.status}
            label={statusLabel(group.status)}
            className="shadow-soft"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-3.5">
        <p className="line-clamp-1 text-sm font-semibold text-ink">{group.slug}</p>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted">{group.title}</p>

        <div className="mt-2.5 flex flex-wrap gap-1">
          {visible.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-body"
            >
              <span aria-hidden>{flagEmoji(code)}</span>
              {code}
            </span>
          ))}
          {overflow > 0 && (
            <span className="inline-flex items-center rounded-md border border-line bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-muted">
              +{overflow}
            </span>
          )}
          {group.countries.length === 0 && (
            <span className="text-[11px] text-amber-600">No country listings</span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5 text-[11px] font-medium text-muted">
          <GlobeAltIcon className="h-3.5 w-3.5" />
          {group.countries.length}{" "}
          {group.countries.length === 1 ? "country" : "countries"}
          <span className="ml-auto text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
            View details →
          </span>
        </div>
      </div>
    </div>
  );
}
