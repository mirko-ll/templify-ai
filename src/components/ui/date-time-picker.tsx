"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

type Mode = "datetime" | "time";

interface DateTimePickerProps {
  /** datetime mode: "YYYY-MM-DDTHH:mm" (or ""); time mode: "HH:mm" (or ""). */
  value: string;
  onChange: (value: string) => void;
  mode?: Mode;
  /** Disable days before today (and past times when the chosen day is today). */
  disablePast?: boolean;
  /** Show a clear (×) control. Defaults to on for datetime, off for time. */
  clearable?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 15-minute time slots for the time column. */
const TIME_SLOTS: Array<{ hh: number; mm: number }> = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) TIME_SLOTS.push({ hh: h, mm: m });
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function to12h(hh: number, mm: number): string {
  const period = hh < 12 ? "AM" : "PM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${pad2(mm)} ${period}`;
}

interface Parsed {
  year: number | null;
  month: number | null; // 0-indexed
  day: number | null;
  hh: number | null;
  mm: number | null;
}

function parseValue(value: string, mode: Mode): Parsed {
  const empty: Parsed = { year: null, month: null, day: null, hh: null, mm: null };
  if (!value) return empty;
  if (mode === "time") {
    const [h, m] = value.split(":").map(Number);
    return Number.isFinite(h) ? { ...empty, hh: h, mm: Number.isFinite(m) ? m : 0 } : empty;
  }
  const [datePart, timePart] = value.split("T");
  const [y, mo, d] = (datePart ?? "").split("-").map(Number);
  const [h, mi] = (timePart ?? "").split(":").map(Number);
  return {
    year: Number.isFinite(y) ? y : null,
    month: Number.isFinite(mo) ? mo - 1 : null,
    day: Number.isFinite(d) ? d : null,
    hh: Number.isFinite(h) ? h : null,
    mm: Number.isFinite(mi) ? mi : null,
  };
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildMonthCells(year: number, month: number): Array<Date | null> {
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

export function DateTimePicker({
  value,
  onChange,
  mode = "datetime",
  disablePast = false,
  clearable = mode === "datetime",
  placeholder,
  disabled = false,
  className,
  id,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    left: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const timeListRef = useRef<HTMLDivElement>(null);
  const hasCentered = useRef(false);

  const parsed = useMemo(() => parseValue(value, mode), [value, mode]);
  const today = useMemo(() => startOfDay(new Date()), []);
  const now = useMemo(() => new Date(), []);

  const [viewYear, setViewYear] = useState(parsed.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed.month ?? today.getMonth());

  const selectedDate = useMemo(
    () =>
      parsed.year !== null && parsed.month !== null && parsed.day !== null
        ? new Date(parsed.year, parsed.month, parsed.day)
        : null,
    [parsed.year, parsed.month, parsed.day]
  );

  // Position the portal popover relative to the trigger; keep it in viewport.
  const computeCoords = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const estHeight = mode === "time" ? 300 : 360;
    const popoverWidth = mode === "time" ? 176 : 392;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < estHeight + 16 && rect.top > spaceBelow;
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - popoverWidth - 8)
    );
    setCoords(
      placeAbove
        ? { left, bottom: window.innerHeight - rect.top + 8 }
        : { left, top: rect.bottom + 8 }
    );
  }, [mode]);

  // Sync the visible month + recompute position whenever the popover opens.
  useEffect(() => {
    if (!open) return;
    setViewYear(parsed.year ?? today.getFullYear());
    setViewMonth(parsed.month ?? today.getMonth());
    computeCoords();
    const reposition = (event: Event) => {
      // Ignore the time list's own scrolling — only reposition for outer scroll/resize.
      if (event.target instanceof Node && popoverRef.current?.contains(event.target)) {
        return;
      }
      computeCoords();
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click / Escape (popover lives in a portal, so check both).
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Center the selected time once per open — don't fight the user's scrolling.
  useEffect(() => {
    if (!open) {
      hasCentered.current = false;
      return;
    }
    if (hasCentered.current) return;
    const container = timeListRef.current;
    if (!container) return;
    const selected = container.querySelector<HTMLElement>('[data-selected="true"]');
    if (selected) {
      container.scrollTop =
        selected.offsetTop - container.clientHeight / 2 + selected.clientHeight / 2;
    }
    hasCentered.current = true;
  }, [open, coords]);

  const emitDateTime = (date: Date, hh: number, mm: number) => {
    onChange(
      `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(hh)}:${pad2(mm)}`
    );
  };

  const handlePickDay = (date: Date) => {
    emitDateTime(date, parsed.hh ?? 9, parsed.mm ?? 0);
  };

  const handlePickTime = (hh: number, mm: number) => {
    if (mode === "time") {
      onChange(`${pad2(hh)}:${pad2(mm)}`);
      setOpen(false);
      return;
    }
    emitDateTime(selectedDate ?? today, hh, mm);
  };

  const isDayDisabled = (date: Date) =>
    disablePast && startOfDay(date).getTime() < today.getTime();

  const isTimeDisabled = (hh: number, mm: number) => {
    if (!disablePast || mode === "time") return false;
    const day = selectedDate ?? today;
    if (startOfDay(day).getTime() > today.getTime()) return false;
    return hh < now.getHours() || (hh === now.getHours() && mm <= now.getMinutes());
  };

  const triggerLabel = useMemo(() => {
    if (mode === "time") {
      return parsed.hh === null
        ? placeholder ?? "Select time"
        : to12h(parsed.hh, parsed.mm ?? 0);
    }
    if (!selectedDate) return placeholder ?? "Select date & time";
    const dateLabel = new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(selectedDate);
    return parsed.hh !== null
      ? `${dateLabel} · ${to12h(parsed.hh, parsed.mm ?? 0)}`
      : dateLabel;
  }, [mode, parsed, selectedDate, placeholder]);

  const isEmpty = mode === "time" ? parsed.hh === null : !selectedDate;
  const cells = useMemo(
    () => buildMonthCells(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const goMonth = (delta: number) => {
    const base = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
  };

  const popover = open && coords && (
    <div
      ref={popoverRef}
      role="dialog"
      style={{ left: coords.left, top: coords.top, bottom: coords.bottom }}
      className="animate-rise fixed z-[3500] overflow-hidden rounded-xl border border-line bg-surface shadow-overlay"
    >
      <div className="flex">
        {mode === "datetime" && (
          <div className="w-64 p-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => goMonth(-1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-ink"
                aria-label="Previous month"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-ink">
                {MONTHS[viewMonth]} {viewYear}
              </span>
              <button
                type="button"
                onClick={() => goMonth(1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-ink"
                aria-label="Next month"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((weekday) => (
                <div
                  key={weekday}
                  className="text-center text-[11px] font-medium text-muted"
                >
                  {weekday}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((date, index) => {
                if (!date) return <div key={`empty-${index}`} />;
                const isSelected =
                  selectedDate !== null &&
                  date.getTime() === selectedDate.getTime();
                const isToday = date.getTime() === today.getTime();
                const dayDisabled = isDayDisabled(date);
                return (
                  <button
                    key={date.getTime()}
                    type="button"
                    disabled={dayDisabled}
                    onClick={() => handlePickDay(date)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors",
                      isSelected
                        ? "bg-brand-600 font-semibold text-white"
                        : dayDisabled
                          ? "cursor-not-allowed text-muted/40"
                          : "text-body hover:bg-surface-muted",
                      !isSelected && isToday && "font-semibold text-brand-600"
                    )}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div
          className={cn(
            "flex w-44 flex-col",
            mode === "datetime" && "border-l border-line"
          )}
        >
          <div className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-xs font-medium text-muted">
            <ClockIcon className="h-3.5 w-3.5" />
            Time
          </div>
          <div ref={timeListRef} className="max-h-[268px] overflow-y-auto p-1">
            {TIME_SLOTS.map(({ hh, mm }) => {
              const isSelected = parsed.hh === hh && parsed.mm === mm;
              const timeDisabled = isTimeDisabled(hh, mm);
              return (
                <button
                  key={`${hh}:${mm}`}
                  type="button"
                  data-selected={isSelected}
                  disabled={timeDisabled}
                  onClick={() => handlePickTime(hh, mm)}
                  className={cn(
                    "w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                    isSelected
                      ? "bg-brand-50 font-semibold text-brand-700"
                      : timeDisabled
                        ? "cursor-not-allowed text-muted/40"
                        : "text-body hover:bg-surface-muted"
                  )}
                >
                  {to12h(hh, mm)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line px-3 py-2">
        {clearable && value ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="text-xs font-medium text-muted transition-colors hover:text-ink"
          >
            Clear
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Done
        </button>
      </div>
    </div>
  );

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-lg border bg-surface px-3.5 text-sm shadow-soft transition-colors focus-visible:outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500/30",
          open ? "border-brand-400 ring-2 ring-brand-500/30" : "border-line-strong",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-line-strong"
        )}
      >
        {mode === "time" ? (
          <ClockIcon className="h-4 w-4 flex-shrink-0 text-muted" />
        ) : (
          <CalendarDaysIcon className="h-4 w-4 flex-shrink-0 text-muted" />
        )}
        <span className={cn("flex-1 truncate text-left text-ink", isEmpty && "text-muted")}>
          {triggerLabel}
        </span>
        {clearable && value && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear"
            onClick={(event) => {
              event.stopPropagation();
              onChange("");
            }}
            className="flex-shrink-0 rounded p-0.5 text-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <XMarkIcon className="h-4 w-4" />
          </span>
        )}
      </button>

      {typeof document !== "undefined" && popover
        ? createPortal(popover, document.body)
        : null}
    </div>
  );
}
