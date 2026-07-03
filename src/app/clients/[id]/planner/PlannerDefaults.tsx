"use client";

import { useState } from "react";
import { ChevronDownIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import CustomSelect from "@/components/ui/custom-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Field, Input } from "@/components/ui/field";
import { SectionHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { MailingListOverrides } from "./MailingListOverrides";
import { VariableHint } from "./VariableHint";
import type {
  CountryOption,
  MailingList,
  PlannerDefaults,
  PromptOption,
} from "./planner-types";

interface PlannerDefaultsProps {
  defaults: PlannerDefaults;
  prompts: PromptOption[];
  countries: CountryOption[];
  mailingLists: MailingList[];
  disabled?: boolean;
  onChange: (patch: Partial<PlannerDefaults>, immediate?: boolean) => void;
}

/** Shared template / subject / preheader / sender / lists applied to every day unless overridden. */
export function PlannerDefaultsPanel({
  defaults,
  prompts,
  countries,
  mailingLists,
  disabled,
  onChange,
}: PlannerDefaultsProps) {
  const [showLists, setShowLists] = useState(false);
  const overrideCount = Object.values(defaults.mailingListOverrides).filter(
    (ids) => ids.length > 0
  ).length;

  return (
    <div className="space-y-4 rounded-xl border border-line bg-surface p-5 shadow-soft">
      <SectionHeader
        title="Shared defaults"
        description="Applied to every planned day. Any day can override these individually."
      />
      {/* Delivery settings — short fields with even heights. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Email template" htmlFor="default-template">
          <CustomSelect
            disabled={disabled}
            placeholder="Select a template"
            value={defaults.templateId}
            onChange={(value) => onChange({ templateId: value })}
            options={prompts.map((prompt) => ({
              value: prompt.id,
              label: prompt.name,
            }))}
          />
        </Field>
        <Field
          label="Send time"
          htmlFor="default-time"
          hint="Local time — applies to emails you add from now on"
        >
          <DateTimePicker
            id="default-time"
            mode="time"
            disabled={disabled}
            value={defaults.sendTime}
            onChange={(next) => onChange({ sendTime: next })}
          />
        </Field>
        <Field
          label="Sender name"
          htmlFor="default-sender"
          hint="Blank → derived from the product"
        >
          <Input
            id="default-sender"
            disabled={disabled}
            value={defaults.senderName}
            onChange={(event) => onChange({ senderName: event.target.value })}
            placeholder="e.g. Vigoshop"
          />
        </Field>
      </div>

      {/* Email copy — wider fields so the variable hint fits on one line. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Field
          label="Subject"
          htmlFor="default-subject"
          hint="Blank → AI-generated per product"
        >
          <Input
            id="default-subject"
            disabled={disabled}
            value={defaults.subject}
            onChange={(event) => onChange({ subject: event.target.value })}
            placeholder="e.g. {subtag:name}, don't miss this deal"
          />
          <VariableHint className="mt-1" />
        </Field>
        <Field label="Preheader" htmlFor="default-preheader">
          <Input
            id="default-preheader"
            disabled={disabled}
            value={defaults.preheader}
            onChange={(event) => onChange({ preheader: event.target.value })}
            placeholder="e.g. Now only {price} — don't miss out"
          />
          <VariableHint className="mt-1" />
        </Field>
      </div>

      <div className="rounded-xl border border-line">
        <button
          type="button"
          onClick={() => setShowLists((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left transition-colors hover:bg-surface-muted"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-ink">
            <EnvelopeIcon className="h-4 w-4 text-muted" />
            Mailing lists
            {overrideCount > 0 && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                {overrideCount} override{overrideCount === 1 ? "" : "s"}
              </span>
            )}
          </span>
          <ChevronDownIcon
            className={cn("h-4 w-4 text-muted transition-transform", showLists && "rotate-180")}
          />
        </button>
        {showLists && (
          <div className="border-t border-line p-3">
            <p className="mb-3 text-xs text-muted">
              Empty = each country sends to its configured list. Pick a list for one
              country (e.g. “BG aktivni kupci”) and Templaito auto-fills the other
              countries with their matching lists. Applied to every day.
            </p>
            <MailingListOverrides
              countries={countries}
              mailingLists={mailingLists}
              value={defaults.mailingListOverrides}
              disabled={disabled}
              onChange={(next) => onChange({ mailingListOverrides: next }, true)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
