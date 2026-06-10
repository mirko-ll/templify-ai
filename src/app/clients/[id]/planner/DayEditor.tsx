"use client";

import { useEffect, useRef, useState } from "react";
import {
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { cn } from "@/lib/cn";
import { DayProductForm } from "./DayProductForm";
import {
  availableCountries,
  isLocked,
  type CountryOption,
  type DayAssignment,
  type ItemStatus,
  type MailingList,
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
  onClose: () => void;
  /** Replace every product for the day with the given list. */
  onChangeDay: (dayKey: string, items: DayAssignment[]) => void;
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
  onEditTime,
  onEdit,
  onRemove,
}: {
  item: DayAssignment;
  defaults: PlannerDefaults;
  eligible: Set<string>;
  onEditTime: (value: string) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const locked = isLocked(item.status);
  const available = availableCountries(item.group, eligible);
  const sending =
    item.countryCodes && item.countryCodes.length > 0
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
      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-surface-muted">
        {item.group.bestImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.group.bestImageUrl}
            alt={item.group.slug}
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink">
            {item.group.slug}
          </p>
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
            disabled={locked}
            value={item.sendTime ?? defaults.sendTime}
            onChange={onEditTime}
          />
        </div>
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
  onClose,
  onChangeDay,
}: DayEditorProps) {
  const [view, setView] = useState<"list" | "form">("list");
  const [editing, setEditing] = useState<DayAssignment | null>(null);
  // Bumped on each add/edit so the form remounts with fresh state.
  const [formSession, setFormSession] = useState(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Decide the starting view whenever the modal opens for a (different) day.
  useEffect(() => {
    if (!open) return;
    setView(itemsRef.current.length > 0 ? "list" : "form");
    setEditing(null);
    setFormSession((n) => n + 1);
  }, [open, dayKey]);

  const startAdd = () => {
    setEditing(null);
    setFormSession((n) => n + 1);
    setView("form");
  };

  const startEdit = (item: DayAssignment) => {
    setEditing(item);
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

  const title =
    view === "form"
      ? `${editing ? "Edit product" : "Add product"} · ${formatDay(dayKey)}`
      : `Plan ${formatDay(dayKey)}`;
  const description =
    view === "form"
      ? "Pick a product and tailor its template, copy, image, send time and lists."
      : items.length > 0
        ? `${items.length} ${items.length === 1 ? "product" : "products"} scheduled — each sends at its own time.`
        : "Schedule one or more products for this day.";

  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="lg">
      {!dayKey ? null : view === "form" ? (
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
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ProductRow
              key={item.id}
              item={item}
              defaults={defaults}
              eligible={eligible}
              onEditTime={(value) => handleTimeChange(item, value)}
              onEdit={() => startEdit(item)}
              onRemove={() => handleRemove(item)}
            />
          ))}

          <button
            type="button"
            onClick={startAdd}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-surface-muted/40 py-3.5 text-sm font-semibold text-muted transition-colors hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-700"
          >
            <PlusIcon className="h-4 w-4" />
            Add product
          </button>

          <div className="flex items-center justify-end pt-1">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
