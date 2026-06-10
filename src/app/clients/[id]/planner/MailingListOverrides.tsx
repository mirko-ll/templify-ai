"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";
import type { CountryOption, MailingList } from "./planner-types";

interface ListNamePattern {
  prefix: string;
  suffix: string;
  ccUpperCase: boolean;
  display: string; // e.g. "<CC> aktivni kupci"
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detect the country code as a standalone token in a list name (e.g. "BG aktivni
 * kupci"), capturing where it sits so it can be swapped for other countries.
 * Returns null if the code isn't a word-bounded token.
 */
function buildListNamePattern(
  listName: string,
  countryCode: string
): ListNamePattern | null {
  if (!listName || !countryCode) return null;
  const trimmed = listName.trim();
  const cc = countryCode.toUpperCase();
  const re = new RegExp(`(^|[^A-Za-z])(${escapeRegex(cc)})([^A-Za-z]|$)`, "i");
  const match = trimmed.match(re);
  if (!match || match.index === undefined) return null;
  const ccText = match[2];
  const start = match.index + match[1].length;
  const end = start + ccText.length;
  const prefix = trimmed.slice(0, start);
  const suffix = trimmed.slice(end);
  return {
    prefix,
    suffix,
    ccUpperCase: ccText === ccText.toUpperCase(),
    display: `${prefix}<CC>${suffix}`,
  };
}

/** Find a list whose name matches the pattern with the CC swapped for another country. */
function findListMatchingPattern(
  pattern: ListNamePattern,
  otherCountryCode: string,
  mailingLists: MailingList[]
): MailingList | null {
  const cc = pattern.ccUpperCase
    ? otherCountryCode.toUpperCase()
    : otherCountryCode.toLowerCase();
  const candidate = `${pattern.prefix}${cc}${pattern.suffix}`.trim().toLowerCase();
  return mailingLists.find((l) => l.name.trim().toLowerCase() === candidate) ?? null;
}

/** Compact, tokenized multi-select for mailing lists. */
function MultiListSelect({
  options,
  value,
  onChange,
  disabled,
}: {
  options: MailingList[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const enableSearch = options.length > 6;

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Reset the query on close; focus the search box on open.
  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    if (enableSearch) {
      const timer = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [open, enableSearch]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!enableSearch || !q) return options;
    return options.filter((option) => option.name.toLowerCase().includes(q));
  }, [options, query, enableSearch]);

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  const label =
    value.length === 0
      ? "Use default list"
      : value.length === 1
        ? options.find((o) => o.id === value[0])?.name ?? value[0]
        : `${value.length} lists selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 text-xs font-medium shadow-soft transition-colors",
          value.length > 0 ? "border-brand-300 text-brand-700" : "border-line-strong text-body",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-line-strong"
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon
          className={cn("h-3.5 w-3.5 flex-shrink-0 text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-overlay">
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full border-b border-line px-3 py-2 text-left text-xs text-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              Reset to default
            </button>
          )}
          {enableSearch && (
            <div className="flex items-center gap-2 border-b border-line px-3">
              <MagnifyingGlassIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search lists…"
                className="h-8 w-full bg-transparent text-xs text-ink placeholder:text-muted focus:outline-none"
              />
            </div>
          )}
          <div className="max-h-52 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted">
                {options.length === 0 ? "No mailing lists" : "No matches"}
              </p>
            ) : (
              filtered.map((option) => {
                const selected = value.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggle(option.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      selected ? "bg-brand-50 font-medium text-brand-700" : "text-body hover:bg-surface-muted"
                    )}
                  >
                    <span className="truncate">{option.name}</span>
                    {selected && <CheckIcon className="h-4 w-4 flex-shrink-0 text-brand-600" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface MailingListOverridesProps {
  countries: CountryOption[];
  mailingLists: MailingList[];
  value: Record<string, string[]>;
  disabled?: boolean;
  /** Receives the full next map (one country may auto-fill its matching siblings). */
  onChange: (next: Record<string, string[]>) => void;
}

/** Per-country mailing-list override rows (shared defaults or per day). */
export function MailingListOverrides({
  countries,
  mailingLists,
  value,
  disabled,
  onChange,
}: MailingListOverridesProps) {
  if (countries.length === 0) {
    return (
      <p className="text-sm text-muted">
        No active mailing-list countries to override.
      </p>
    );
  }

  const handleCountryChange = (code: string, ids: string[]) => {
    const next: Record<string, string[]> = { ...value };
    if (ids.length > 0) next[code] = ids;
    else delete next[code];

    // Auto-apply: when a single list whose name carries this country's code is
    // chosen, fill every other still-empty country with its matching list.
    if (ids.length === 1) {
      const selectedList = mailingLists.find((l) => l.id === ids[0]);
      const pattern = selectedList
        ? buildListNamePattern(selectedList.name, code)
        : null;
      if (pattern) {
        for (const other of countries) {
          if (other.code === code) continue;
          if ((next[other.code] ?? []).length > 0) continue; // don't clobber explicit picks
          const match = findListMatchingPattern(pattern, other.code, mailingLists);
          if (match) next[other.code] = [match.id];
        }
      }
    }

    onChange(next);
  };

  const hasOverrides = countries.some(
    (country) => (value[country.code] ?? []).length > 0
  );

  return (
    <div className="space-y-2">
      {hasOverrides && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({})}
            className={cn(
              "text-xs font-medium text-muted transition-colors",
              disabled
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:text-ink"
            )}
          >
            Reset all to default
          </button>
        </div>
      )}
      <div className="divide-y divide-line rounded-xl border border-line">
      {countries.map((country) => {
        const selected = value[country.code] ?? [];
        const overridden = selected.length > 0;
        return (
          <div
            key={country.code}
            className={cn(
              "flex items-center justify-between gap-4 px-3 py-2.5",
              overridden && "bg-brand-50/40"
            )}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {country.name || country.code}
              </p>
              <p
                className={cn(
                  "truncate text-xs",
                  overridden ? "text-muted line-through" : "text-muted"
                )}
              >
                {country.defaultListName || "No default list"}
              </p>
            </div>
            <div className="w-52 flex-shrink-0">
              <MultiListSelect
                options={mailingLists}
                value={selected}
                disabled={disabled}
                onChange={(ids) => handleCountryChange(country.code, ids)}
              />
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
