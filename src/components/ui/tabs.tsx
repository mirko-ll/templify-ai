"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface TabDef {
  key: string;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  content: React.ReactNode;
}

export interface TabsProps {
  tabs: TabDef[];
  value?: string;
  defaultValue?: string;
  onChange?: (key: string) => void;
  className?: string;
}

/**
 * Accessible underline tabs (roving tabindex + arrow-key navigation).
 * Panels mount lazily on first visit and stay mounted afterwards, so
 * data-fetching child sections don't refetch when switching tabs.
 */
export function Tabs({
  tabs,
  value,
  defaultValue,
  onChange,
  className,
}: TabsProps) {
  const [internal, setInternal] = React.useState(
    defaultValue ?? tabs[0]?.key ?? ""
  );
  const active = value ?? internal;
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [mounted, setMounted] = React.useState<Set<string>>(
    () => new Set(active ? [active] : [])
  );

  const select = React.useCallback(
    (key: string) => {
      setMounted((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      if (value === undefined) setInternal(key);
      onChange?.(key);
    },
    [onChange, value]
  );

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    let next = index;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    const target = tabs[next];
    if (target) {
      select(target.key);
      tabRefs.current[next]?.focus();
    }
  };

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-orientation="horizontal"
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              role="tab"
              type="button"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => select(tab.key)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "group relative inline-flex cursor-pointer items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                isActive
                  ? "text-brand-700"
                  : "text-muted hover:text-ink"
              )}
            >
              {tab.icon && (
                <span
                  className={cn(
                    "transition-colors",
                    isActive
                      ? "text-brand-600"
                      : "text-muted group-hover:text-ink"
                  )}
                >
                  {tab.icon}
                </span>
              )}
              {tab.label}
              {tab.badge != null && tab.badge !== "" && (
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                    isActive
                      ? "bg-brand-100 text-brand-700"
                      : "bg-surface-muted text-muted"
                  )}
                >
                  {tab.badge}
                </span>
              )}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600 transition-opacity duration-200",
                  isActive ? "opacity-100" : "opacity-0"
                )}
              />
            </button>
          );
        })}
      </div>

      <div className="pt-6">
        {tabs.map((tab) =>
          mounted.has(tab.key) ? (
            <div
              key={tab.key}
              role="tabpanel"
              hidden={tab.key !== active}
              className={tab.key === active ? "animate-rise" : undefined}
            >
              {tab.content}
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}
