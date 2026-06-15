"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ArrowPathRoundedSquareIcon,
  ArrowUturnLeftIcon,
  EyeIcon,
  PencilSquareIcon,
  PlusIcon,
  SquaresPlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { cn } from "@/lib/cn";
import { DayProductForm } from "./DayProductForm";
import { DayResendForm } from "./DayResendForm";
import {
  availableCountries,
  isLocked,
  type CountryOption,
  type DayAssignment,
  type ItemStatus,
  type MailingList,
  type PerformanceEntry,
  type PlannerDefaults,
  type PromptOption,
} from "./planner-types";

interface DayEditorProps {
  open: boolean;
  dayKey: string | null;
  prompts: PromptOption[];
  eligible: Set<string>;
  countryOptions: CountryOption[];
  mailingLists: MailingList[];
  defaults: PlannerDefaults;
  /** All products currently scheduled for this day (locked ones included). */
  items: DayAssignment[];
  /** campaignId → dayKeys across the month that already resend it (picker hints). */
  resendUsage: Map<string, string[]>;
  /** Last imported month's stats by group key (decorates the product picker/form). */
  performance?: Map<string, PerformanceEntry> | null;
  ranks?: Map<string, number> | null;
  performanceLabel?: string | null;
  /** Past days (and generation in progress) are view-only. */
  readOnly?: boolean;
  onClose: () => void;
  /** Replace every product for the day with the given list. */
  onChangeDay: (dayKey: string, items: DayAssignment[]) => void;
  /** Open the generated-campaign preview for a scheduled product. */
  onPreview: (item: DayAssignment) => void;
  /** Preview an arbitrary campaign — the original email behind a resend. */
  onPreviewCampaign: (campaignId: string, label: string) => void;
  /** Cancel a scheduled (not yet pushed) product so the day is editable again. */
  onUnschedule: (item: DayAssignment) => void;
  /** Discard a scheduled product's campaign and generate a fresh one. */
  onRegenerate: (item: DayAssignment) => void;
}

type AddMode = "product" | "resend";

const ADD_MODES: Array<{
  value: AddMode;
  label: string;
  icon: typeof SquaresPlusIcon;
}> = [
  { value: "product", label: "New product", icon: SquaresPlusIcon },
  { value: "resend", label: "Resend a campaign", icon: ArrowPathRoundedSquareIcon },
];

/** Segmented "what goes on this day" switch with a sliding active pill. */
function AddModeToggle({
  mode,
  onChange,
}: {
  mode: AddMode;
  onChange: (mode: AddMode) => void;
}) {
  return (
    <div className="relative grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-muted/70 p-1">
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-1 left-1 top-1 w-[calc(50%-0.375rem)] rounded-lg border border-line bg-surface shadow-soft transition-transform duration-200 ease-out",
          mode === "resend" && "translate-x-[calc(100%+0.25rem)]"
        )}
      />
      {ADD_MODES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={mode === value}
          className={cn(
            "relative z-10 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors",
            mode === value ? "text-ink" : "text-muted hover:text-ink"
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4 transition-colors",
              mode === value &&
                (value === "resend" ? "text-teal-600" : "text-brand-600")
            )}
          />
          {label}
        </button>
      ))}
    </div>
  );
}

const STATUS_META: Record<ItemStatus, { label: string; variant: BadgeVariant }> = {
  PLANNED: { label: "Planned", variant: "neutral" },
  QUEUED: { label: "Queued", variant: "info" },
  GENERATING: { label: "Generating", variant: "info" },
  SCHEDULED: { label: "Scheduled", variant: "success" },
  FAILED: { label: "Failed", variant: "danger" },
};

function formatDay(dayKey: string | null): string {
  if (!dayKey) return "";
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(y, (m || 1) - 1, d || 1));
}

/** One scheduled product in the day list, with quick send-time editing. */
function ProductRow({
  item,
  defaults,
  eligible,
  readOnly,
  onEditTime,
  onEdit,
  onRemove,
  onView,
  onUnschedule,
  onRegenerate,
}: {
  item: DayAssignment;
  defaults: PlannerDefaults;
  eligible: Set<string>;
  readOnly: boolean;
  onEditTime: (value: string) => void;
  onEdit: () => void;
  onRemove: () => void;
  onView: () => void;
  onUnschedule: () => void;
  onRegenerate: () => void;
}) {
  const locked = isLocked(item.status);
  const viewable = item.status === "SCHEDULED" && Boolean(item.campaignId);
  const available = availableCountries(item.group, eligible);
  // A resend goes to the original campaign's countries/lists regardless of the
  // client's current eligible set.
  const sending = item.resend
    ? item.group.countries
    : item.countryCodes && item.countryCodes.length > 0
      ? item.countryCodes.filter((code) => available.includes(code))
      : available;
  const meta = STATUS_META[item.status];

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-surface p-3 shadow-soft transition-colors",
        item.status === "FAILED" ? "border-rose-200" : "border-line"
      )}
    >
      <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-surface-muted">
        {item.group.bestImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.group.bestImageUrl}
            alt={item.group.slug}
            className="h-full w-full object-cover"
          />
        ) : item.resend ? (
          <ArrowPathRoundedSquareIcon className="absolute inset-0 m-auto h-5 w-5 text-teal-500" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink">
            {item.group.slug}
          </p>
          {item.resend && (
            <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700">
              <ArrowPathRoundedSquareIcon className="h-3 w-3" />
              Resend
            </span>
          )}
          <Badge variant={meta.variant} className="flex-shrink-0 text-[10px]">
            {meta.label}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {sending.length > 0
            ? `${sending.length} ${sending.length === 1 ? "country" : "countries"}: ${sending.join(", ")}`
            : "No active country"}
        </p>
        {item.status === "FAILED" && item.errorMessage && (
          <p className="mt-1 line-clamp-2 text-xs text-rose-600">
            {item.errorMessage}
          </p>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-1.5">
        <div className="w-36">
          <DateTimePicker
            mode="time"
            disabled={locked || readOnly}
            value={item.sendTime ?? defaults.sendTime}
            onChange={onEditTime}
          />
        </div>
        {viewable && (
          <button
            type="button"
            onClick={onView}
            aria-label="View generated campaign"
            title="View generated campaign"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-muted shadow-soft transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          >
            <EyeIcon className="h-4 w-4" />
          </button>
        )}
        {viewable && !readOnly && !item.resend && (
          <button
            type="button"
            onClick={onRegenerate}
            aria-label="Regenerate campaign"
            title="Regenerate — discard this email and generate a fresh one"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-muted shadow-soft transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          >
            <ArrowPathIcon className="h-4 w-4" />
          </button>
        )}
        {viewable && !readOnly && (
          <button
            type="button"
            onClick={onUnschedule}
            aria-label="Unschedule"
            title="Unschedule — cancel the campaign and edit this day again"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-muted shadow-soft transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
          >
            <ArrowUturnLeftIcon className="h-4 w-4" />
          </button>
        )}
        {!readOnly && (
          <>
            <button
              type="button"
              disabled={locked}
              onClick={onEdit}
              aria-label="Edit product"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-muted shadow-soft transition-colors",
                locked
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-surface-muted hover:text-ink"
              )}
            >
              <PencilSquareIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={onRemove}
              aria-label="Remove product"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-muted shadow-soft transition-colors",
                locked
                  ? "cursor-not-allowed opacity-50"
                  : "hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
              )}
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Plan a single day: a master list of the day's products (each with its own
 * send time) plus an add/edit form. Products already in the generation pipeline
 * are shown read-only.
 */
export function DayEditor({
  open,
  dayKey,
  prompts,
  eligible,
  countryOptions,
  mailingLists,
  defaults,
  items,
  resendUsage,
  performance,
  ranks,
  performanceLabel,
  readOnly = false,
  onClose,
  onChangeDay,
  onPreview,
  onPreviewCampaign,
  onUnschedule,
  onRegenerate,
}: DayEditorProps) {
  const [view, setView] = useState<"list" | "form">("list");
  const [mode, setMode] = useState<AddMode>("product");
  const [editing, setEditing] = useState<DayAssignment | null>(null);
  // Bumped on each add/edit so the form remounts with fresh state.
  const [formSession, setFormSession] = useState(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Decide the starting view whenever the modal opens for a (different) day.
  useEffect(() => {
    if (!open) return;
    setView(readOnly || itemsRef.current.length > 0 ? "list" : "form");
    setMode("product");
    setEditing(null);
    setFormSession((n) => n + 1);
  }, [open, dayKey, readOnly]);

  const startAdd = () => {
    setEditing(null);
    setMode("product");
    setFormSession((n) => n + 1);
    setView("form");
  };

  const startEdit = (item: DayAssignment) => {
    setEditing(item);
    setMode(item.resend ? "resend" : "product");
    setFormSession((n) => n + 1);
    setView("form");
  };

  const handleSubmit = (item: DayAssignment) => {
    if (!dayKey) return;
    // Drop the item being edited (its key may have changed) + any clash, then add.
    const next = items
      .filter((existing) => existing.id !== editing?.id && existing.id !== item.id)
      .concat(item);
    onChangeDay(dayKey, next);
    setEditing(null);
    setView("list");
  };

  const handleCancel = () => {
    if (items.length > 0) setView("list");
    else onClose();
  };

  const handleRemove = (item: DayAssignment) => {
    if (!dayKey) return;
    onChangeDay(
      dayKey,
      items.filter((existing) => existing.id !== item.id)
    );
  };

  const handleTimeChange = (item: DayAssignment, value: string) => {
    if (!dayKey) return;
    onChangeDay(
      dayKey,
      items.map((existing) =>
        existing.id === item.id ? { ...existing, sendTime: value } : existing
      )
    );
  };

  const usedKeys = new Set(
    items.filter((item) => item.id !== editing?.id).map((item) => item.group.key)
  );
  const usedCampaignIds = new Set(
    items
      .filter((item) => item.resend && item.id !== editing?.id)
      .map((item) => item.resend!.sourceCampaignId)
  );
  // Same-campaign resends on *other* days — surfaced as hints in the picker.
  const plannedElsewhere = new Map(
    Array.from(resendUsage.entries())
      .map(([campaignId, days]) => [
        campaignId,
        days.filter((day) => day !== dayKey),
      ])
      .filter(([, days]) => days.length > 0) as Array<[string, string[]]>
  );

  const resendForm = editing ? Boolean(editing.resend) : mode === "resend";

  const title =
    view === "form"
      ? `${
          editing
            ? resendForm
              ? "Edit resend"
              : "Edit product"
            : "Plan"
        } · ${formatDay(dayKey)}`
      : readOnly
        ? formatDay(dayKey)
        : `Plan ${formatDay(dayKey)}`;
  const description =
    view === "form"
      ? resendForm
        ? "Re-schedule a past campaign as-is — same email, same lists, new time."
        : "Pick a product and tailor its template, copy, image, send time and lists."
      : readOnly
        ? `${items.length} ${items.length === 1 ? "product" : "products"} scheduled — view only.`
        : items.length > 0
          ? `${items.length} ${items.length === 1 ? "product" : "products"} scheduled — each sends at its own time.`
          : "Schedule one or more products for this day.";

  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="lg">
      {!dayKey ? null : view === "form" ? (
        <div className="space-y-5">
          {!editing && <AddModeToggle mode={mode} onChange={setMode} />}
          {resendForm ? (
            <DayResendForm
              key={`resend-${formSession}`}
              dayKey={dayKey}
              defaults={defaults}
              initial={editing}
              usedCampaignIds={usedCampaignIds}
              plannedElsewhere={plannedElsewhere}
              onPreviewCampaign={onPreviewCampaign}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
            />
          ) : (
            <DayProductForm
              key={formSession}
              dayKey={dayKey}
              prompts={prompts}
              eligible={eligible}
              countryOptions={countryOptions}
              mailingLists={mailingLists}
              defaults={defaults}
              initial={editing}
              usedKeys={usedKeys}
              performance={performance}
              ranks={ranks}
              performanceLabel={performanceLabel}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
            />
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ProductRow
              key={item.id}
              item={item}
              defaults={defaults}
              eligible={eligible}
              readOnly={readOnly}
              onEditTime={(value) => handleTimeChange(item, value)}
              onEdit={() => startEdit(item)}
              onRemove={() => handleRemove(item)}
              onView={() => onPreview(item)}
              onUnschedule={() => onUnschedule(item)}
              onRegenerate={() => onRegenerate(item)}
            />
          ))}

          {!readOnly && (
            <button
              type="button"
              onClick={startAdd}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-surface-muted/40 py-3.5 text-sm font-semibold text-muted transition-colors hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-700"
            >
              <PlusIcon className="h-4 w-4" />
              Add product or resend
            </button>
          )}

          <div className="flex items-center justify-end pt-1">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
