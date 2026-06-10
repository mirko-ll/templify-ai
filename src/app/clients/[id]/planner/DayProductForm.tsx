"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Label } from "@/components/ui/field";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import CustomSelect from "@/components/ui/custom-select";
import { cn } from "@/lib/cn";
import { ProductPicker } from "./ProductPicker";
import { MailingListOverrides } from "./MailingListOverrides";
import { VariableHint } from "./VariableHint";
import {
  assignmentId,
  availableCountries,
  formatTime12h,
  type CountryOption,
  type DayAssignment,
  type MailingList,
  type PlannerDefaults,
  type ProductGroup,
  type PromptOption,
} from "./planner-types";

interface DayProductFormProps {
  dayKey: string;
  prompts: PromptOption[];
  eligible: Set<string>;
  countryOptions: CountryOption[];
  mailingLists: MailingList[];
  defaults: PlannerDefaults;
  /** The product being edited, or null when adding a new one. */
  initial: DayAssignment | null;
  /** Product keys already used by the day's other items (disabled in the picker). */
  usedKeys: Set<string>;
  onSubmit: (item: DayAssignment) => void;
  onCancel: () => void;
}

/** Toggle row: "Use shared default" vs a custom value. */
function DefaultToggle({
  useDefault,
  onToggle,
  defaultLabel,
}: {
  useDefault: boolean;
  onToggle: (next: boolean) => void;
  defaultLabel: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
      <input
        type="checkbox"
        checked={useDefault}
        onChange={(event) => onToggle(event.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer rounded border-line-strong accent-brand-600"
      />
      Use shared default{defaultLabel ? ` (${defaultLabel})` : ""}
    </label>
  );
}

/**
 * Add/edit a single product for a planned day: which product, countries, image,
 * template, subject, preheader, send time and mailing-list overrides. Each field
 * can inherit the shared default or be set just for this product.
 */
export function DayProductForm({
  dayKey,
  prompts,
  eligible,
  countryOptions,
  mailingLists,
  defaults,
  initial,
  usedKeys,
  onSubmit,
  onCancel,
}: DayProductFormProps) {
  const initialAvailable = initial
    ? availableCountries(initial.group, eligible)
    : [];

  const [group, setGroup] = useState<ProductGroup | null>(initial?.group ?? null);
  const [selectedCountries, setSelectedCountries] = useState<string[]>(
    initial?.countryCodes && initial.countryCodes.length > 0
      ? initial.countryCodes.filter((code) => initialAvailable.includes(code))
      : initialAvailable
  );
  const [changingProduct, setChangingProduct] = useState(!initial);
  const [useTemplateDefault, setUseTemplateDefault] = useState(
    initial ? initial.templateId === null : true
  );
  const [templateId, setTemplateId] = useState(
    initial?.templateId ?? defaults.templateId ?? ""
  );
  const [useSubjectDefault, setUseSubjectDefault] = useState(
    initial ? initial.subject === null : true
  );
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [usePreheaderDefault, setUsePreheaderDefault] = useState(
    initial ? initial.preheader === null : true
  );
  const [preheader, setPreheader] = useState(initial?.preheader ?? "");
  const [useTimeDefault, setUseTimeDefault] = useState(
    initial ? initial.sendTime === null : true
  );
  const [sendTime, setSendTime] = useState(
    initial?.sendTime ?? defaults.sendTime ?? "09:00"
  );
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(
    initial?.selectedImageUrl ?? null
  );
  const [extraImages, setExtraImages] = useState<string[]>(
    initial?.selectedImageUrl &&
      !initial.group.images.includes(initial.selectedImageUrl)
      ? [initial.selectedImageUrl]
      : []
  );
  const [customUrl, setCustomUrl] = useState("");
  const [useMailingDefault, setUseMailingDefault] = useState(
    initial ? initial.mailingListOverrides === null : true
  );
  const [mailingOverrides, setMailingOverrides] = useState<
    Record<string, string[]>
  >(initial?.mailingListOverrides ?? { ...defaults.mailingListOverrides });
  const [error, setError] = useState("");

  const countries = useMemo(
    () => (group ? availableCountries(group, eligible) : []),
    [group, eligible]
  );
  const dayCountryOptions = useMemo(
    () => countryOptions.filter((option) => selectedCountries.includes(option.code)),
    [countryOptions, selectedCountries]
  );
  const imageOptions = useMemo(() => {
    if (!group) return [] as string[];
    return Array.from(
      new Set([
        ...group.images,
        ...extraImages,
        ...(selectedImageUrl ? [selectedImageUrl] : []),
      ])
    );
  }, [group, extraImages, selectedImageUrl]);
  const activeImage =
    selectedImageUrl ?? group?.bestImageUrl ?? imageOptions[0] ?? null;

  const defaultTemplateName =
    prompts.find((prompt) => prompt.id === defaults.templateId)?.name ?? "none";

  const toggleCountry = (code: string) => {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const addCustomImage = () => {
    const url = customUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setError("Enter a valid image URL (http/https).");
      return;
    }
    if (!extraImages.includes(url) && !group?.images.includes(url)) {
      setExtraImages((prev) => [...prev, url]);
    }
    setSelectedImageUrl(url);
    setCustomUrl("");
    setError("");
  };

  const handleSubmit = () => {
    if (!group) {
      setError("Pick a product to schedule.");
      return;
    }
    if (countries.length === 0) {
      setError("This product has no active mailing-list country.");
      return;
    }
    if (selectedCountries.length === 0) {
      setError("Select at least one country to send this product to.");
      return;
    }
    const effectiveTemplate = useTemplateDefault ? defaults.templateId : templateId;
    if (!effectiveTemplate) {
      setError("Select an email template (or set a shared default).");
      return;
    }
    // Keep only overrides for this product's selected countries.
    const dayOverrides: Record<string, string[]> = {};
    for (const code of selectedCountries) {
      const ids = mailingOverrides[code];
      if (Array.isArray(ids) && ids.length > 0) dayOverrides[code] = ids;
    }
    onSubmit({
      id: assignmentId(dayKey, group.key),
      dayKey,
      group,
      countryCodes: selectedCountries,
      templateId: useTemplateDefault ? null : templateId,
      subject: useSubjectDefault ? null : subject,
      preheader: usePreheaderDefault ? null : preheader,
      sendTime: useTimeDefault ? null : sendTime,
      mailingListOverrides: useMailingDefault ? null : dayOverrides,
      selectedImageUrl,
      priceOverride: initial?.priceOverride ?? null,
      status: initial?.status ?? "PLANNED",
    });
  };

  return (
    <div className="space-y-5">
      {/* Product */}
      {changingProduct || !group ? (
        <div>
          <Label className="mb-1.5 block">Product</Label>
          <ProductPicker
            selectedKey={group?.key ?? null}
            eligible={eligible}
            disabledKeys={usedKeys}
            onSelect={(next) => {
              setGroup(next);
              setSelectedCountries(availableCountries(next, eligible));
              setChangingProduct(false);
              setSelectedImageUrl(null);
              setExtraImages([]);
              setError("");
            }}
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-muted p-3">
          <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
            {group.bestImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={group.bestImageUrl}
                alt={group.slug}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{group.slug}</p>
            {countries.length > 0 ? (
              <p className="mt-1 text-xs text-muted">
                Sending to {selectedCountries.length} of {countries.length}{" "}
                {countries.length === 1 ? "country" : "countries"}
              </p>
            ) : (
              <div className="mt-1">
                <Badge variant="warning">No active country</Badge>
              </div>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setChangingProduct(true)}
            leftIcon={<ArrowPathIcon className="h-4 w-4" />}
          >
            Change
          </Button>
        </div>
      )}

      {/* Countries */}
      {group && !changingProduct && countries.length > 0 && (
        <Field
          label="Countries"
          hint="Where this product is sent — deselect any you want to skip"
        >
          <div className="flex flex-wrap gap-2">
            {countries.map((code) => {
              const active = selectedCountries.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleCountry(code)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                    active
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-line bg-surface text-muted hover:border-line-strong"
                  )}
                >
                  {code}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      {/* Send time — the per-product override */}
      {group && !changingProduct && (
        <Field label="Send time" hint="Local time this product goes out">
          <DefaultToggle
            useDefault={useTimeDefault}
            onToggle={setUseTimeDefault}
            defaultLabel={formatTime12h(defaults.sendTime)}
          />
          {!useTimeDefault && (
            <div className="mt-2 max-w-[12rem]">
              <DateTimePicker
                mode="time"
                value={sendTime}
                onChange={setSendTime}
              />
            </div>
          )}
        </Field>
      )}

      {/* Image */}
      {group && !changingProduct && (
        <div>
          <Label className="mb-1.5 block">Image</Label>
          <div className="flex flex-wrap gap-2">
            {imageOptions.slice(0, 12).map((url) => {
              const active = activeImage === url;
              return (
                <button
                  key={url}
                  type="button"
                  onClick={() => setSelectedImageUrl(url)}
                  className={cn(
                    "h-14 w-14 overflow-hidden rounded-lg border-2 transition-colors",
                    active ? "border-brand-500" : "border-line hover:border-line-strong"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={customUrl}
              onChange={(event) => setCustomUrl(event.target.value)}
              placeholder="Add image by URL…"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCustomImage();
                }
              }}
            />
            <Button
              variant="secondary"
              onClick={addCustomImage}
              leftIcon={<PlusIcon className="h-4 w-4" />}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      {/* Template */}
      <Field label="Email template">
        <DefaultToggle
          useDefault={useTemplateDefault}
          onToggle={setUseTemplateDefault}
          defaultLabel={defaultTemplateName}
        />
        {!useTemplateDefault && (
          <div className="mt-2">
            <CustomSelect
              placeholder="Select a template"
              value={templateId}
              onChange={setTemplateId}
              options={prompts.map((prompt) => ({
                value: prompt.id,
                label: prompt.name,
              }))}
            />
          </div>
        )}
      </Field>

      {/* Subject */}
      <Field label="Subject" hint="Blank → AI-generated from the product">
        <DefaultToggle
          useDefault={useSubjectDefault}
          onToggle={setUseSubjectDefault}
          defaultLabel={defaults.subject || "blank"}
        />
        {!useSubjectDefault && (
          <>
            <Input
              className="mt-2"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Custom subject for this product"
            />
            <VariableHint className="mt-1.5" />
          </>
        )}
      </Field>

      {/* Preheader */}
      <Field label="Preheader">
        <DefaultToggle
          useDefault={usePreheaderDefault}
          onToggle={setUsePreheaderDefault}
          defaultLabel={defaults.preheader || "blank"}
        />
        {!usePreheaderDefault && (
          <>
            <Input
              className="mt-2"
              value={preheader}
              onChange={(event) => setPreheader(event.target.value)}
              placeholder="Custom preheader for this product"
            />
            <VariableHint className="mt-1.5" />
          </>
        )}
      </Field>

      {/* Mailing lists */}
      {group && selectedCountries.length > 0 && (
        <Field label="Mailing lists">
          <DefaultToggle
            useDefault={useMailingDefault}
            onToggle={setUseMailingDefault}
            defaultLabel="shared lists"
          />
          {!useMailingDefault && (
            <div className="mt-2">
              <MailingListOverrides
                countries={dayCountryOptions}
                mailingLists={mailingLists}
                value={mailingOverrides}
                onChange={(next) => setMailingOverrides(next)}
              />
            </div>
          )}
        </Field>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2.5 pt-1">
        <Button
          variant="secondary"
          onClick={onCancel}
          leftIcon={<ArrowLeftIcon className="h-4 w-4" />}
        >
          Back
        </Button>
        <Button onClick={handleSubmit}>
          {initial ? "Save product" : "Add product"}
        </Button>
      </div>
    </div>
  );
}
