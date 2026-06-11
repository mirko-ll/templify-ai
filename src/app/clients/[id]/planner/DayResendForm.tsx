"use client";

import { useState } from "react";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowPathRoundedSquareIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { DefaultToggle, pastTimeTodayError } from "./DayProductForm";
import { ResendCampaignPicker, lastSentAt } from "./ResendCampaignPicker";
import {
  assignmentId,
  buildResendGroup,
  formatTime12h,
  resendGroupKey,
  type DayAssignment,
  type PlannerDefaults,
  type ResendSource,
  type ResendStats,
  type ResendableCampaign,
} from "./planner-types";

interface DayResendFormProps {
  dayKey: string;
  defaults: PlannerDefaults;
  /** The resend being edited, or null when adding a new one. */
  initial: DayAssignment | null;
  /** Campaign ids already re-planned this day (disabled in the picker). */
  usedCampaignIds: Set<string>;
  /** campaignId → other dayKeys in the month that already resend it. */
  plannedElsewhere: Map<string, string[]>;
  /** Open the original campaign's email in the preview modal. */
  onPreviewCampaign: (campaignId: string, label: string) => void;
  onSubmit: (item: DayAssignment) => void;
  onCancel: () => void;
}

/** "Mon 12 May" for the summary card. */
function formatSentDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function toSource(campaign: ResendableCampaign): ResendSource {
  return {
    sourceCampaignId: campaign.id,
    name: campaign.name,
    subject: campaign.subject,
    productNickname: campaign.productNickname,
    imageUrl: campaign.imageUrl,
    lastSentAt: lastSentAt(campaign),
    countries: campaign.countries,
  };
}

/** Days since the source went out — for the fatigue note on the summary card. */
function sourceDaysSince(source: ResendSource): number | null {
  if (!source.lastSentAt) return null;
  const time = new Date(source.lastSentAt).getTime();
  if (Number.isNaN(time) || time > Date.now()) return null;
  return Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
}

/**
 * Schedule a past campaign to go out again on this day. Deliberately light:
 * the email, its translations and its mailing lists are cloned as-is by the
 * backend, so the only real decision here is which campaign and what time.
 */
export function DayResendForm({
  dayKey,
  defaults,
  initial,
  usedCampaignIds,
  plannedElsewhere,
  onPreviewCampaign,
  onSubmit,
  onCancel,
}: DayResendFormProps) {
  const [source, setSource] = useState<ResendSource | null>(initial?.resend ?? null);
  const [stats, setStats] = useState<ResendStats | null>(null);
  const [changing, setChanging] = useState(!initial?.resend);
  const [useTimeDefault, setUseTimeDefault] = useState(
    initial ? initial.sendTime === null : true
  );
  const [sendTime, setSendTime] = useState(
    initial?.sendTime ?? defaults.sendTime ?? "09:00"
  );
  const [error, setError] = useState("");

  const sinceDays = source ? sourceDaysSince(source) : null;
  const sentRecently = sinceDays !== null && sinceDays < 14;

  const handleSubmit = () => {
    if (!source) {
      setError("Pick a campaign to resend.");
      return;
    }
    const timeError = pastTimeTodayError(
      dayKey,
      useTimeDefault ? defaults.sendTime : sendTime
    );
    if (timeError) {
      setError(timeError);
      return;
    }
    onSubmit({
      id: assignmentId(dayKey, resendGroupKey(source.sourceCampaignId)),
      dayKey,
      group: buildResendGroup(source),
      countryCodes: null,
      templateId: null,
      subject: null,
      preheader: null,
      sendTime: useTimeDefault ? null : sendTime,
      mailingListOverrides: null,
      selectedImageUrl: null,
      priceOverride: null,
      status: initial?.status ?? "PLANNED",
      resend: source,
    });
  };

  return (
    <div className="space-y-5">
      {/* Campaign */}
      {changing || !source ? (
        <ResendCampaignPicker
          selectedId={source?.sourceCampaignId ?? null}
          disabledIds={usedCampaignIds}
          plannedElsewhere={plannedElsewhere}
          onSelect={(campaign, campaignStats) => {
            setSource(toSource(campaign));
            setStats(campaignStats);
            setChanging(false);
            setError("");
          }}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50/80 to-surface shadow-soft">
          <div className="flex items-center gap-3 p-3">
            <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-teal-200 bg-surface">
              {source.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={source.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <ArrowPathRoundedSquareIcon className="absolute inset-0 m-auto h-6 w-6 text-teal-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <ArrowPathRoundedSquareIcon className="h-3.5 w-3.5 flex-shrink-0 text-teal-600" />
                <p className="truncate text-sm font-semibold text-ink">
                  {source.subject || source.name}
                </p>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">
                {[
                  source.lastSentAt
                    ? `Sent ${formatSentDate(source.lastSentAt)}`
                    : null,
                  source.countries.length > 0 ? source.countries.join(", ") : null,
                  stats
                    ? `${(stats.openRate * 100).toFixed(1)}% opens · ${(stats.clickRate * 100).toFixed(1)}% clicks`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  onPreviewCampaign(
                    source.sourceCampaignId,
                    source.subject || source.name
                  )
                }
                leftIcon={<EyeIcon className="h-4 w-4" />}
              >
                View email
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setChanging(true)}
                leftIcon={<ArrowPathIcon className="h-4 w-4" />}
              >
                Change
              </Button>
            </div>
          </div>
          <div className="border-t border-teal-100 bg-teal-50/60 px-3 py-2">
            <p className="text-[11px] leading-relaxed text-teal-800">
              Resends the exact same email — same content, translations and
              mailing lists as the original. Only the send time is new.
            </p>
          </div>
        </div>
      )}

      {sentRecently && !changing && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          This campaign went out{" "}
          {sinceDays === 0 ? "today" : `${sinceDays} day${sinceDays === 1 ? "" : "s"} ago`}{" "}
          to the same audience. Resending this soon can hurt engagement.
        </div>
      )}

      {/* Send time */}
      {source && !changing && (
        <Field label="Send time" hint="Local time the resend goes out">
          <DefaultToggle
            useDefault={useTimeDefault}
            onToggle={setUseTimeDefault}
            defaultLabel={formatTime12h(defaults.sendTime)}
          />
          {!useTimeDefault && (
            <div className="mt-2 max-w-[12rem]">
              <DateTimePicker mode="time" value={sendTime} onChange={setSendTime} />
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
          {initial ? "Save resend" : "Add resend"}
        </Button>
      </div>
    </div>
  );
}
