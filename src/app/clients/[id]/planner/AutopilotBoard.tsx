"use client";

import {
  ArrowPathIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  MinusIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { BUCKET_META } from "@/components/autopilot/buckets";
import { cn } from "@/lib/cn";
import {
  STATUS_LABEL,
  boostNote,
  dayLabel,
  slotStatus,
  timeLabel,
  untilLabel,
  type Day,
  type ManualItem,
  type Slot,
  type SlotStatus,
} from "./autopilot-ui";

interface AutopilotBoardProps {
  days: Day[];
  today: string;
  now: number;
  timezone: string;
  selectedId: string | null;
  onSelectSlot: (slot: Slot) => void;
  onSelectItem: (item: ManualItem) => void;
}

/** Faint diagonal hatching for days past the lock line: frozen, being generated or sent. */
const FROZEN_BG =
  "bg-[image:repeating-linear-gradient(135deg,transparent_0_7px,rgba(100,116,139,0.07)_7px_8px)]";

function StatusMark({ status }: { status: SlotStatus }) {
  const base = "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full";
  const label = STATUS_LABEL[status];
  switch (status) {
    case "proposed":
      return <span className={cn(base, "border-2 border-amber-400 bg-amber-50")} title={label} aria-label={label} />;
    case "approved":
    case "yours":
      return (
        <span className={cn(base, "bg-emerald-500 text-white")} title={label} aria-label={label}>
          <CheckIcon className="h-3 w-3" strokeWidth={3} />
        </span>
      );
    case "auto":
      return (
        <span className={cn(base, "border border-emerald-300 text-emerald-600")} title={label} aria-label={label}>
          <CheckIcon className="h-3 w-3" strokeWidth={3} />
        </span>
      );
    case "locked":
      return (
        <span className={cn(base, "text-muted")} title={label} aria-label={label}>
          <LockClosedIcon className="h-3.5 w-3.5" />
        </span>
      );
    case "generating":
      return (
        <span className={cn(base, "text-sky-600")} title={label} aria-label={label}>
          <ArrowPathIcon className="h-3.5 w-3.5 motion-safe:animate-spin" />
        </span>
      );
    case "scheduled":
      return (
        <span className={cn(base, "bg-sky-50 text-sky-700")} title={label} aria-label={label}>
          <PaperAirplaneIcon className="h-3 w-3" />
        </span>
      );
    case "failed":
      return (
        <span className={cn(base, "bg-rose-50 text-rose-600")} title={label} aria-label={label}>
          <ExclamationTriangleIcon className="h-3.5 w-3.5" />
        </span>
      );
    default:
      return (
        <span className={cn(base, "text-muted")} title={label} aria-label={label}>
          <MinusIcon className="h-3.5 w-3.5" />
        </span>
      );
  }
}

function Thumb({ src, className }: { src: string | null | undefined; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className={cn("flex-shrink-0 rounded-md border border-line object-cover", className)} />
  ) : (
    <div className={cn("flex-shrink-0 rounded-md border border-line bg-surface-muted", className)} />
  );
}

function SlotTile({ slot, timezone, selected, onSelect }: { slot: Slot; timezone: string; selected: boolean; onSelect: () => void }) {
  const status = slotStatus(slot);
  const meta = BUCKET_META[slot.bucket];
  const fallback = slot.plannedBucket !== slot.bucket;
  const boost = boostNote(slot);
  const image = slot.detail?.images[0] ?? slot.signals?.product?.imageUrl;
  const muted = status === "skipped" || status === "empty";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group relative flex w-full flex-col gap-1.5 overflow-hidden rounded-lg border bg-surface py-2 pl-3 pr-2 text-left transition-[box-shadow,border-color]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
        selected ? "border-brand-400 shadow-raised ring-2 ring-brand-500/25" : "border-line shadow-soft hover:border-line-strong",
        muted && "opacity-60"
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", meta.dot)} />
      <span className="flex items-center justify-between gap-1">
        <span className="font-mono text-[15px] font-semibold tabular-nums tracking-tight text-ink">{timeLabel(slot.sendAt, timezone)}</span>
        <StatusMark status={status} />
      </span>
      {slot.groupKey && !muted ? (
        <span className="flex items-center gap-2">
          <Thumb src={image} className="h-9 w-9" />
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-semibold text-ink">{slot.groupKey}</span>
            <span className="flex items-center gap-1 text-[11px] text-muted">
              <span className={cn("font-medium", slot.priceSuggested ? "text-amber-700" : "text-body")}>
                {slot.priceOverride ? `€${slot.priceOverride}` : "no price"}
              </span>
              <span aria-hidden>·</span>
              <span className="truncate">
                {meta.label}
                {fallback && " ↺"}
                {boost && " ★"}
              </span>
            </span>
          </span>
        </span>
      ) : (
        <span className="text-[11px] text-muted">{status === "skipped" ? "Skipped — no email" : "Nothing fits the rules"}</span>
      )}
    </button>
  );
}

function ItemTile({ item, timezone, onSelect }: { item: ManualItem; timezone: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full flex-col gap-1 rounded-lg border border-dashed border-line-strong bg-surface/70 px-2.5 py-2 text-left hover:border-ink/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
    >
      <span className="flex items-center justify-between">
        <span className="font-mono text-[13px] font-semibold tabular-nums text-body">{timeLabel(item.sendDate, timezone)}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted">by hand</span>
      </span>
      <span className="truncate text-[12px] font-medium text-ink">{item.groupKey}</span>
      <span className="text-[10px] text-muted">{item.status.toLowerCase()}</span>
    </button>
  );
}

/**
 * The rolling week as a board: one column per day, two sends each. The lock
 * line separates days that are frozen (generated / sending) from days the boss
 * can still change — it moves one day to the right every morning at 06:00.
 */
export function AutopilotBoard({ days, today, now, timezone, selectedId, onSelectSlot, onSelectItem }: AutopilotBoardProps) {
  const lockedCount = days.filter((d) => new Date(d.lockAt).getTime() <= now).length;
  const hasLine = lockedCount < days.length;
  // Spelled out (not repeat()): repeat(0, …) is invalid CSS when no day is locked yet.
  const columns = [
    ...Array<string>(lockedCount).fill("minmax(0, 1fr)"),
    ...(hasLine ? ["1.25rem"] : []),
    ...Array<string>(days.length - lockedCount).fill("minmax(0, 1fr)"),
  ].join(" ");
  const nextLock = days[lockedCount]?.lockAt;

  return (
    <div className="-mx-1 overflow-x-auto pb-1">
      <div className="grid min-w-[980px] gap-x-1.5 px-1" style={{ gridTemplateColumns: columns }}>
        {days.map((day, index) => {
          const locked = index < lockedCount;
          const isToday = day.date === today;
          const column = (
            <div key={day.date} className={cn("flex min-w-0 flex-col gap-1.5 rounded-lg p-1.5", locked && FROZEN_BG, isToday && "bg-brand-50/60")}>
              <div className="px-1 pb-1">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                  {isToday ? "Today" : dayLabel(day.date, { weekday: "short" })}
                </p>
                <p className={cn("text-sm font-semibold", locked ? "text-body" : "text-ink")}>{dayLabel(day.date, { day: "numeric", month: "short" })}</p>
                <p className="text-[10px] text-muted">
                  {locked ? "locked" : `locks in ${untilLabel(day.lockAt, now) ?? "–"}`}
                </p>
              </div>
              {day.slots.map((slot) => (
                <SlotTile key={slot.id} slot={slot} timezone={timezone} selected={slot.id === selectedId} onSelect={() => onSelectSlot(slot)} />
              ))}
              {day.items.map((item) => (
                <ItemTile key={item.id} item={item} timezone={timezone} onSelect={() => onSelectItem(item)} />
              ))}
              {!day.slots.length && !day.items.length && (
                <p className="px-1 text-[11px] text-muted">{locked ? "No email" : "Filled tonight"}</p>
              )}
            </div>
          );
          if (index !== lockedCount) return column;
          // The lock line sits right before the first open day.
          return [
            <div key="lock-line" className="relative flex justify-center">
              <div aria-hidden className="absolute inset-y-2 w-px bg-gradient-to-b from-brand-500 via-brand-400 to-transparent" />
              <span
                tabIndex={0}
                aria-describedby="lock-line-tip"
                className="group/lock sticky top-2 mt-1 cursor-help rounded-full bg-brand-600 px-1 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-white outline-none [writing-mode:vertical-rl] focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2"
              >
                lock line · moves {nextLock ? timeLabel(nextLock, timezone) : "06:00"}
                <span
                  id="lock-line-tip"
                  role="tooltip"
                  className="pointer-events-none invisible absolute left-full top-0 z-20 ml-2 w-72 rounded-lg border border-line bg-surface p-3 text-left font-sans text-xs font-normal normal-case tracking-normal text-body opacity-0 shadow-overlay transition-opacity [writing-mode:horizontal-tb] group-hover/lock:visible group-hover/lock:opacity-100 group-focus-visible/lock:visible group-focus-visible/lock:opacity-100"
                >
                  <span className="mb-1.5 block text-sm font-semibold text-ink">Lock line</span>
                  <span className="mb-1 block">
                    <span className="font-semibold text-ink">Left — locked.</span> Picked, stock-checked, approved (automatically if
                    nobody did) and generated. They can still be unscheduled in the planner until about 2 hours before sending.
                  </span>
                  <span className="mb-1 block">
                    <span className="font-semibold text-ink">Right — open.</span> Approve, swap or skip as you like.
                  </span>
                  <span className="block text-muted">
                    Every morning at 06:00 the line moves one day to the right
                    {nextLock && days[lockedCount]
                      ? ` — next: ${dayLabel(days[lockedCount].date)} locks ${dayLabel(nextLock.slice(0, 10), { weekday: "short" })} ${timeLabel(nextLock, timezone)}.`
                      : "."}
                  </span>
                </span>
              </span>
            </div>,
            column,
          ];
        })}
      </div>
    </div>
  );
}
