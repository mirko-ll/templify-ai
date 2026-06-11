"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { InlineLoadingSpinner } from "@/components/ui/loading-spinner";
import { cn } from "@/lib/cn";

interface CountryTarget {
  id: string;
  countryCode: string;
  mailingListName: string | null;
  preparedSubject: string | null;
  preparedPreheader: string | null;
  preparedHtml: string | null;
  preparedFromName: string | null;
  preparedFromEmail: string | null;
  isPushed: boolean;
  externalId: string | null;
}

interface CampaignDetails {
  id: string;
  name: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  subject: string | null;
  preheader: string | null;
  senderName: string | null;
  countryTargets: CountryTarget[];
}

interface CampaignPreviewModalProps {
  open: boolean;
  clientId: string;
  campaignId: string | null;
  /** Shown in the title, e.g. the product slug. */
  label?: string | null;
  /** Title prefix — defaults to "Generated campaign". */
  heading?: string;
  onClose: () => void;
}

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function MetaRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-20 flex-shrink-0 text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="min-w-0 break-words text-ink">{value}</span>
    </div>
  );
}

/**
 * Read-only view of the campaign generated for a planned day: one tab per
 * country (or per mailing list when a country sends to several), showing the
 * final translated subject/preheader/sender and the prepared email HTML.
 */
export function CampaignPreviewModal({
  open,
  clientId,
  campaignId,
  label,
  heading,
  onClose,
}: CampaignPreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<CampaignDetails | null>(null);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !campaignId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async (initial: boolean) => {
      if (initial) {
        setLoading(true);
        setError(null);
        setCampaign(null);
      }
      try {
        const response = await fetch(
          `/api/clients/${clientId}/campaigns/${campaignId}`
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load the campaign");
        }
        if (cancelled) return;
        const details = payload.campaign as CampaignDetails;
        setCampaign(details);
        setActiveTargetId((current) =>
          current && details.countryTargets.some((t) => t.id === current)
            ? current
            : details.countryTargets[0]?.id ?? null
        );
        // No per-country content yet means localization/translation is still
        // running in the background — keep polling until it lands (or fails).
        if (details.status !== "FAILED" && details.countryTargets.length === 0) {
          timer = setTimeout(() => void load(false), 4000);
        }
      } catch (err) {
        if (cancelled) return;
        if (initial) {
          setError(
            err instanceof Error ? err.message : "Failed to load the campaign"
          );
        } else {
          // Transient refresh failure — try again on the next tick.
          timer = setTimeout(() => void load(false), 4000);
        }
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    };

    void load(true);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, clientId, campaignId]);

  const target =
    campaign?.countryTargets.find((t) => t.id === activeTargetId) ??
    campaign?.countryTargets[0] ??
    null;

  const sendLabel = formatDateTime(campaign?.sentAt ?? campaign?.scheduledAt ?? null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${heading ?? "Generated campaign"}${label ? ` · ${label}` : ""}`}
      description={sendLabel ? `Sends ${sendLabel}` : undefined}
      size="xl"
    >
      {loading ? (
        <div className="py-10">
          <InlineLoadingSpinner text="Loading campaign…" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : !campaign ? null : (
        <div className="space-y-4">
          {campaign.status === "FAILED" && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Publishing this campaign failed on the backend. Retry the day from
              the planner to regenerate it.
            </div>
          )}

          {campaign.countryTargets.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <span className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-amber-500" />
              Preparing the campaign — localization and translation are running.
              This view refreshes automatically.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {campaign.countryTargets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTargetId(t.id)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                      t.id === (target?.id ?? null)
                        ? "border-brand-300 bg-brand-50 text-brand-700"
                        : "border-line bg-surface text-muted hover:bg-surface-muted hover:text-ink"
                    )}
                  >
                    {t.countryCode}
                    {campaign.countryTargets.filter(
                      (other) => other.countryCode === t.countryCode
                    ).length > 1 && t.mailingListName
                      ? ` · ${t.mailingListName}`
                      : ""}
                  </button>
                ))}
              </div>

              {target && (
                <>
                  <div className="space-y-1.5 rounded-xl border border-line bg-surface-muted/40 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <MetaRow
                        label="Subject"
                        value={target.preparedSubject ?? campaign.subject}
                      />
                      <Badge
                        variant={target.isPushed ? "success" : "info"}
                        className="flex-shrink-0 text-[10px]"
                      >
                        {target.isPushed
                          ? "Pushed to SqualoMail"
                          : "Pushes ~2h before send"}
                      </Badge>
                    </div>
                    <MetaRow
                      label="Preheader"
                      value={target.preparedPreheader ?? campaign.preheader}
                    />
                    <MetaRow
                      label="From"
                      value={
                        target.preparedFromName
                          ? `${target.preparedFromName}${
                              target.preparedFromEmail
                                ? ` <${target.preparedFromEmail}>`
                                : ""
                            }`
                          : campaign.senderName
                      }
                    />
                    <MetaRow label="List" value={target.mailingListName} />
                  </div>

                  {target.preparedHtml ? (
                    <iframe
                      sandbox=""
                      srcDoc={target.preparedHtml}
                      title={`Email preview ${target.countryCode}`}
                      // Fill the viewport so the modal never scrolls — the
                      // email scrolls inside its own pane instead.
                      className="h-[calc(100vh-24rem)] min-h-[320px] w-full rounded-xl border border-line bg-white"
                    />
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      The email for {target.countryCode} is still being prepared.
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
