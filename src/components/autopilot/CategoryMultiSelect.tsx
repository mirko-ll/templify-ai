"use client";

import { useMemo, useState } from "react";
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { CheckIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

export interface CategoryOption {
  name: string;
  /** Active product groups carrying the category. */
  products: number;
}

interface CategoryMultiSelectProps {
  options: CategoryOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

/**
 * Pick several of the client's shop categories (searchable, with product
 * counts). Selected ones show as removable chips under the field; a saved category that no
 * longer exists in the catalog stays visible, marked "0".
 */
export function CategoryMultiSelect({ options, value, onChange, placeholder = "Add categories…" }: CategoryMultiSelectProps) {
  const [query, setQuery] = useState("");
  const counts = useMemo(() => new Map(options.map((o) => [o.name, o.products])), [options]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.name.includes(q)) : options;
  }, [options, query]);

  return (
    <div className="flex flex-col gap-1.5">
      <Combobox multiple value={value} onChange={(next: string[]) => onChange(next)} onClose={() => setQuery("")}>
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <ComboboxInput
            className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-8 pr-3 text-sm text-ink shadow-soft placeholder:text-muted focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
            placeholder={placeholder}
            displayValue={() => query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <ComboboxOptions
          anchor="bottom start"
          className="z-50 max-h-72 w-[var(--input-width)] overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-overlay [--anchor-gap:4px] empty:invisible"
        >
          {filtered.map((option) => (
            <ComboboxOption
              key={option.name}
              value={option.name}
              className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-body data-[focus]:bg-surface-muted data-[focus]:text-ink"
            >
              <span
                className={cn(
                  "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-line-strong",
                  "group-data-[selected]:border-brand-600 group-data-[selected]:bg-brand-600 group-data-[selected]:text-white"
                )}
              >
                <CheckIcon className="hidden h-3 w-3 group-data-[selected]:block" />
              </span>
              <span className="flex-1 truncate">{option.name}</span>
              <span className="text-xs tabular-nums text-muted">{option.products}</span>
            </ComboboxOption>
          ))}
          {filtered.length === 0 && <p className="px-2 py-1.5 text-sm text-muted">No category matches “{query}”.</p>}
        </ComboboxOptions>
      </Combobox>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 py-0.5 pl-2 pr-1 text-xs font-medium text-brand-800"
            >
              {tag}
              <span className="text-[10px] font-normal text-brand-600/80">{counts.get(tag) ?? 0}</span>
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full hover:bg-brand-100"
              >
                <XMarkIcon className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
