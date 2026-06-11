"use client";

import {
  ArrowPathRoundedSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";
import {
  formatTime12h,
  type DayAssignment,
  type ItemStatus,
} from "./planner-types";

interface MonthCalendarProps {
  year: number;
  month: number; // 1-12
  todayKey: string;
  assignmentsByDay: Map<string, DayAssignment[]>;
  defaultSendTime: string;
  disabledEditing: boolean;
  onSelectDay: (dayKey: string) => void;
  onPrev: () => void;
  onNext: () => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Left-accent colour per item status — gives each chip an at-a-glance state. */
const STATUS_ACCENT: Record<ItemStatus, string> = {
  PLANNED: "before:bg-brand-400",
  QUEUED: "before:bg-sky-400",
  GENERATING: "before:bg-sky-400",
  SCHEDULED: "before:bg-emerald-500",
  FAILED: "before:bg-rose-500",
};

/** How many product chips fit before we collapse the rest into "+N". */
const MAX_VISIBLE = 3;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * One product line inside a day cell: thumbnail · name · send time. Resends
 * keep the status accent (state language stays consistent) but get a teal ↻
 * mark and tint so reruns read at a glance across the month.
 */
function DayChip({
  item,
  defaultSendTime,
}: {
  item: DayAssignment;
  defaultSendTime: string;
}) {
  const resend = Boolean(item.resend);
  return (
    <div
      className={cn(
        "relative flex items-center gap-1.5 overflow-hidden rounded-md border border-line bg-surface py-1 pl-2.5 pr-1.5",
        "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
        STATUS_ACCENT[item.status],
        resend && "border-teal-200/80 bg-teal-50/50",
        item.status === "FAILED" && "border-rose-200 bg-rose-50/60"
      )}
    >
      <div
        className={cn(
          "h-4 w-4 flex-shrink-0 overflow-hidden rounded border bg-surface-muted",
          resend ? "border-teal-200" : "border-line"
        )}
      >
        {item.group.bestImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.group.bestImageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
      {resend && (
        <span className="flex-shrink-0" title="Resend of a past campaign">
          <ArrowPathRoundedSquareIcon className="h-3 w-3 text-teal-600" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-ink">
        {item.group.slug}
      </span>
      <span className="flex-shrink-0 font-mono text-[9px] tabular-nums text-muted">
        {formatTime12h(item.sendTime ?? defaultSendTime)}
      </span>
    </div>
  );
}

export function MonthCalendar({
  year,
  month,
  todayKey,
  assignmentsByDay,
  defaultSendTime,
  disabledEditing,
  onSelectDay,
  onPrev,
  onNext,
}: MonthCalendarProps) {
  const daysInMonth = new Date(year, month, 0).getDate();
  // Monday-first leading blanks.
  const leading = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));

  const cells: Array<{ day: number; dayKey: string } | null> = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, dayKey: `${year}-${pad(month)}-${pad(day)}` });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight text-ink">{monthLabel}</h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous month"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-muted shadow-soft transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next month"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-muted shadow-soft transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((label) => (
          <div
            key={label}
            className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted"
          >
            {label}
          </div>
        ))}

        {cells.map((cell, index) => {
          if (!cell) return <div key={`blank-${index}`} />;
          const { day, dayKey } = cell;
          const items = assignmentsByDay.get(dayKey) ?? [];
          // Today included — sends later today are valid; the day forms make
          // sure the chosen send time is still ahead.
          const assignable = dayKey >= todayKey;
          const editable = assignable && !disabledEditing;
          // Past days (and days while generation runs) still open read-only so
          // scheduled campaigns can be reviewed.
          const clickable = editable || items.length > 0;
          const visible = items.slice(0, MAX_VISIBLE);
          const overflow = items.length - visible.length;

          return (
            <button
              key={dayKey}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSelectDay(dayKey)}
              className={cn(
                "flex min-h-[116px] flex-col rounded-xl border p-2 text-left transition-colors",
                assignable
                  ? "border-line bg-surface"
                  : "border-transparent bg-surface-muted/50",
                clickable && "cursor-pointer hover:border-brand-300 hover:bg-brand-50/30",
                !clickable && "cursor-default",
                items.length > 0 && "border-brand-200"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-xs font-semibold tabular-nums",
                    assignable ? "text-ink" : "text-muted"
                  )}
                >
                  {day}
                </span>
                {items.length > 0 && (
                  <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-brand-700">
                    {items.length}
                  </span>
                )}
              </div>

              {items.length > 0 ? (
                <div className="mt-1.5 flex min-w-0 flex-1 flex-col gap-1">
                  {visible.map((item) => (
                    <DayChip
                      key={item.id}
                      item={item}
                      defaultSendTime={defaultSendTime}
                    />
                  ))}
                  {overflow > 0 && (
                    <span className="pl-1 text-[10px] font-medium text-muted">
                      +{overflow} more
                    </span>
                  )}
                </div>
              ) : editable ? (
                <div className="mt-auto flex items-center gap-1 text-[11px] font-medium text-muted">
                  <PlusIcon className="h-3.5 w-3.5" />
                  Add
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
