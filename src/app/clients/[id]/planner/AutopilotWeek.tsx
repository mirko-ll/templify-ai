"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowPathIcon, CheckIcon, Cog6ToothIcon, EnvelopeOpenIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { Bucket } from "@/components/autopilot/buckets";
import { BucketLegend } from "@/components/autopilot/BucketInfo";
import { AutopilotBoard } from "./AutopilotBoard";
import { AutopilotSlotDetail } from "./AutopilotSlotDetail";
import { AutopilotSwapDialog } from "./AutopilotSwapDialog";
import { humanizeRunError, timeLabel, type ManualItem, type Option, type Slot, type WeekData } from "./autopilot-ui";

interface AutopilotWeekProps {
  clientId: string;
  eligible: Set<string>;
  /** Plan items changed (ON mode writes into the month plan) — reload the calendar. */
  onPlanChanged: () => void;
  onPreview: (campaignId: string, label: string) => void;
}

type Selection = { kind: "slot"; id: string } | { kind: "item"; id: string } | null;

export function AutopilotWeek({ clientId, eligible, onPlanChanged, onPreview }: AutopilotWeekProps) {
  const toast = useToast();
  const [data, setData] = useState<WeekData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [busy, setBusy] = useState(false);
  const [swapping, setSwapping] = useState<Slot | null>(null);
  const [alternatives, setAlternatives] = useState<Option[]>([]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}/autopilot/week`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Couldn't load the Autopilot week");
      setData(payload as WeekData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the Autopilot week");
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const slots = useMemo(() => data?.days.flatMap((d) => d.slots) ?? [], [data]);
  const items = useMemo(() => data?.days.flatMap((d) => d.items) ?? [], [data]);
  const waiting = slots.filter((s) => s.state === "PROPOSED");

  // Nothing is open until a send is clicked; if the open one disappears (e.g. a re-plan), close it.
  useEffect(() => {
    if (!data || !selection) return;
    const stillThere =
      selection.kind === "slot" ? slots.some((s) => s.id === selection.id) : items.some((i) => i.id === selection.id);
    if (!stillThere) setSelection(null);
  }, [data, slots, items, selection]);

  // Esc closes the open send.
  useEffect(() => {
    if (!selection || swapping) return;
    const onKey = (event: KeyboardEvent) => {
      // Another dialog (email preview, day editor) closes first.
      if (event.key === "Escape" && !document.querySelector('[role="dialog"]')) setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, swapping]);

  /** Clicking the open send again closes it. */
  const toggle = (next: NonNullable<Selection>) =>
    setSelection((current) => (current && current.kind === next.kind && current.id === next.id ? null : next));

  const selectedSlot = selection?.kind === "slot" ? slots.find((s) => s.id === selection.id) ?? null : null;
  const selectedItem = selection?.kind === "item" ? items.find((i) => i.id === selection.id) ?? null : null;
  const selectedDay = selectedSlot ? data?.days.find((d) => d.date === selectedSlot.date) : undefined;

  // Stored alternatives can go stale (picked elsewhere since): re-check them live.
  useEffect(() => {
    if (!selectedSlot) return setAlternatives([]);
    setAlternatives(selectedSlot.alternatives ?? []);
    let cancelled = false;
    fetch(`/api/clients/${clientId}/autopilot/candidates?slotId=${selectedSlot.id}&stored=1`)
      .then((r) => r.json())
      .then((payload) => !cancelled && Array.isArray(payload?.candidates) && setAlternatives(payload.candidates))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [clientId, selectedSlot?.id, selectedSlot?.groupKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const running = data?.runs?.[0]?.status === "RUNNING";
  const generating = slots.some((s) => s.item && ["QUEUED", "GENERATING"].includes(s.item.status));
  useEffect(() => {
    if (!running && !generating) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [running, generating, load]);

  // When a run finishes, the calendar below may have new items.
  const [wasRunning, setWasRunning] = useState(false);
  useEffect(() => {
    if (wasRunning && !running) onPlanChanged();
    setWasRunning(running);
  }, [running, wasRunning, onPlanChanged]);

  const act = useCallback(
    async (slot: Slot, action: string, body?: unknown, success?: string) => {
      setBusy(true);
      try {
        const response = await fetch(`/api/clients/${clientId}/autopilot/slots/${slot.id}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "That didn't work");
        if (payload?.warning) toast.error("Saved — but it breaks a rule", payload.warning);
        else if (success) toast.success(success);
        await load();
        onPlanChanged();
        return true;
      } catch (err) {
        toast.error("Couldn't update this send", err instanceof Error ? err.message : undefined);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [clientId, load, onPlanChanged, toast]
  );

  const approveAll = async () => {
    setBusy(true);
    const response = await fetch(`/api/clients/${clientId}/autopilot/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotIds: waiting.map((s) => s.id) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) toast.error("Couldn't approve", payload?.error);
    else toast.success(`Approved ${payload.approved} send${payload.approved === 1 ? "" : "s"}`);
    await load();
    setBusy(false);
  };

  const runNow = async () => {
    const response = await fetch(`/api/clients/${clientId}/autopilot/run`, { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) toast.error("Couldn't start the Autopilot", payload?.error);
    else toast.success("The Autopilot is picking", "The board updates in about a minute.");
    await load();
  };

  const settingsHref = `/clients/${clientId}?tab=autopilot`;
  const lastRun = data?.runs?.[0];
  const runNote = lastRun && lastRun.status !== "RUNNING" ? humanizeRunError(lastRun.error) : null;
  const now = data ? new Date(data.now).getTime() : Date.now();
  const approvedCount = slots.filter((s) => s.state === "APPROVED").length;

  return (
    <section className="rounded-xl border border-line bg-surface shadow-soft" aria-label="Autopilot">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand-600">Autopilot</p>
          <h2 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight text-ink">
            Next 7 days
            {data && (
              <Badge variant={data.mode === "ON" ? "success" : data.mode === "SHADOW" ? "brand" : "neutral"} dot>
                {data.mode === "ON" ? "On — emails are sent" : data.mode === "SHADOW" ? "Shadow — nothing is sent" : "Off"}
              </Badge>
            )}
          </h2>
          {data && data.mode !== "OFF" && (
            <p className="mt-1 text-sm text-body">
              <span className="font-medium text-ink">{waiting.length}</span> waiting for you ·{" "}
              <span className="font-medium text-ink">{approvedCount}</span> approved
              {lastRun && (
                <span className="text-muted">
                  {" "}
                  · {lastRun.status === "RUNNING"
                    ? "picking now…"
                    : `last run ${new Date(lastRun.finishedAt ?? lastRun.startedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: data.timezone })}`}
                </span>
              )}
            </p>
          )}
          {runNote && (
            <p className="mt-1 text-xs text-amber-700" title={lastRun?.error ?? undefined}>
              {runNote}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && data.mode !== "OFF" && (
            <>
              <Button size="sm" leftIcon={<CheckIcon className="h-4 w-4" />} disabled={!waiting.length || busy} onClick={approveAll}>
                Approve all{waiting.length ? ` (${waiting.length})` : ""}
              </Button>
              <Button size="sm" variant="secondary" leftIcon={<ArrowPathIcon className="h-4 w-4" />} isLoading={running} onClick={runNow}>
                Run now
              </Button>
            </>
          )}
          <Link
            href={settingsHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-body hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            <Cog6ToothIcon className="h-4 w-4" /> Settings
          </Link>
        </div>
      </header>

      {error && <p className="px-5 pt-4 text-sm text-rose-600">{error}</p>}

      {data?.mode === "OFF" && (
        <div className="m-5 rounded-lg border border-dashed border-line-strong bg-surface-muted/60 p-4 text-sm text-body">
          <SparklesIcon className="mr-1 inline h-4 w-4 text-brand-600" />
          The Autopilot picks two emails a day — best sellers, new products, FB winners and seasonal — and you approve them.{" "}
          <Link href={settingsHref} className="font-medium text-brand-700 hover:underline">
            Set it up
          </Link>
          , starting in shadow mode to compare its picks with yours.
        </div>
      )}

      {data && data.mode !== "OFF" && (
        <>
          <BucketLegend side="bottom" className="px-5 pt-3" />
          <div className="px-4 pt-3">
            <AutopilotBoard
              days={data.days}
              today={data.today}
              now={now}
              timezone={data.timezone}
              selectedId={selection?.id ?? null}
              onSelectSlot={(slot) => toggle({ kind: "slot", id: slot.id })}
              onSelectItem={(item) => toggle({ kind: "item", id: item.id })}
            />
          </div>

          {!selectedSlot && !selectedItem && (
            <p className="px-5 pb-4 pt-3 text-xs text-muted">Click a send to see why it was picked, its shop pages and alternatives.</p>
          )}

          {(selectedSlot || selectedItem) && (
          <div className="relative mt-4 border-t border-line px-5 py-5">
            <button
              type="button"
              onClick={() => setSelection(null)}
              aria-label="Close details"
              title="Close (Esc)"
              className="absolute right-3 top-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
            {selectedSlot && (
              <AutopilotSlotDetail
                slot={selectedSlot}
                timezone={data.timezone}
                now={now}
                lockAt={selectedDay?.lockAt ?? null}
                busy={busy}
                alternatives={alternatives}
                onApprove={() => act(selectedSlot, "approve", undefined, "Approved")}
                onSkip={() => act(selectedSlot, "skip", undefined, "Skipped — no email at this time")}
                onUnskip={() => act(selectedSlot, "unskip", undefined, "Picked again")}
                onSwap={(alternativeIndex) => act(selectedSlot, "swap", { alternativeIndex }, "Swapped")}
                onBrowse={() => setSwapping(selectedSlot)}
                onPreview={() => selectedSlot.item?.campaignId && onPreview(selectedSlot.item.campaignId, selectedSlot.groupKey ?? "")}
              />
            )}
            {selectedItem && <ManualItemDetail item={selectedItem} timezone={data.timezone} onPreview={onPreview} />}
          </div>
          )}
        </>
      )}

      <AutopilotSwapDialog
        clientId={clientId}
        slot={swapping}
        eligible={eligible}
        onClose={() => setSwapping(null)}
        onSwap={async (groupKey) => {
          if (!swapping) return;
          if (await act(swapping, "swap", { groupKey }, "Swapped")) setSwapping(null);
        }}
        onRebucket={async (bucket: Bucket) => {
          if (!swapping) return;
          if (await act(swapping, "rebucket", { bucket }, "Picked a new product")) setSwapping(null);
        }}
      />
    </section>
  );
}

function ManualItemDetail({ item, timezone, onPreview }: { item: ManualItem; timezone: string; onPreview: (campaignId: string, label: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="h-20 w-20 rounded-xl border border-line object-cover" />
      ) : (
        <div className="h-20 w-20 rounded-xl border border-line bg-surface-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-semibold tabular-nums text-ink">
          {new Date(item.sendDate).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: timezone })} ·{" "}
          {timeLabel(item.sendDate, timezone)}
        </p>
        <h3 className="text-xl font-semibold tracking-tight text-ink">{item.groupKey}</h3>
        <p className="text-sm text-body">
          {item.title} · {item.priceOverride ? `€${item.priceOverride}` : "no price"} · {item.status.toLowerCase()}
        </p>
        <p className="mt-1 text-xs text-muted">Added by hand in the planner — the Autopilot leaves this send alone. Edit it in the calendar below.</p>
      </div>
      {item.campaignId && (
        <Button size="sm" variant="secondary" leftIcon={<EnvelopeOpenIcon className="h-4 w-4" />} onClick={() => onPreview(item.campaignId!, item.groupKey ?? "")}>
          Preview email
        </Button>
      )}
    </div>
  );
}
