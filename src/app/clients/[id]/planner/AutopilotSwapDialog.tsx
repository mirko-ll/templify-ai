"use client";

import { useEffect, useState } from "react";
import { SparklesIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { BUCKETS, BUCKET_HELP, BUCKET_META, type Bucket } from "@/components/autopilot/buckets";
import { cn } from "@/lib/cn";
import { ProductPicker } from "./ProductPicker";
import { dayLabel, type Option, type Slot } from "./autopilot-ui";

/**
 * "Swap product": browse any bucket's top products for this send (each one
 * already checked against the rules for that date), let the Autopilot re-pick
 * from a bucket, or search the whole catalog.
 */
export function AutopilotSwapDialog({
  clientId,
  slot,
  eligible,
  onClose,
  onSwap,
  onRebucket,
}: {
  clientId: string;
  slot: Slot | null;
  eligible: Set<string>;
  onClose: () => void;
  onSwap: (groupKey: string) => Promise<void>;
  onRebucket: (bucket: Bucket) => Promise<void>;
}) {
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [candidates, setCandidates] = useState<Option[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setBucket(slot?.bucket ?? null);
    setCandidates(null);
    setSearching(false);
  }, [slot?.id, slot?.bucket]);

  useEffect(() => {
    if (!slot || !bucket) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/clients/${clientId}/autopilot/candidates?slotId=${slot.id}&bucket=${bucket}`)
      .then((r) => r.json())
      .then((payload) => !cancelled && setCandidates(Array.isArray(payload?.candidates) ? payload.candidates : []))
      .catch(() => !cancelled && setCandidates([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [clientId, slot, bucket]);

  return (
    <Modal
      open={slot !== null}
      onClose={onClose}
      size="xl"
      title={slot ? `Swap ${slot.groupKey ?? "this send"}` : ""}
      description={slot ? `${dayLabel(slot.date, { weekday: "long", day: "numeric", month: "short" })} · every product listed passes the rules for that day` : undefined}
    >
      {slot && !searching && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Bucket">
            {BUCKETS.map((b) => (
              <button
                key={b}
                type="button"
                role="tab"
                aria-selected={bucket === b}
                onClick={() => setBucket(b)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
                  bucket === b ? BUCKET_META[b].chip : "border-line-strong text-body hover:bg-surface-muted"
                )}
              >
                {BUCKET_META[b].label}
              </button>
            ))}
          </div>

          {bucket && <p className="-mt-1 text-xs leading-relaxed text-body">{BUCKET_HELP[bucket].help}</p>}

          {bucket && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted/60 px-3 py-2">
              <p className="text-xs text-body">Not sure? Let the Autopilot choose the best {BUCKET_META[bucket].label.toLowerCase()} for this send.</p>
              <Button size="sm" variant="subtle" leftIcon={<SparklesIcon className="h-4 w-4" />} onClick={() => onRebucket(bucket)}>
                Pick for me
              </Button>
            </div>
          )}

          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-1">
            {loading && <p className="text-xs text-muted">Loading…</p>}
            {!loading && candidates?.length === 0 && (
              <p className="text-xs text-muted">Nothing in this bucket passes the rules for this day — try another bucket or search.</p>
            )}
            {!loading &&
              candidates?.map((option) => (
                <div key={option.groupKey} className="flex items-start gap-3 rounded-lg border border-line p-2.5">
                  {option.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={option.imageUrl} alt="" loading="lazy" className="h-12 w-12 flex-shrink-0 rounded-md border border-line object-cover" />
                  ) : (
                    <div className="h-12 w-12 flex-shrink-0 rounded-md border border-line bg-surface-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm">
                      <span className="font-semibold text-ink">{option.groupKey}</span>
                      <span className={cn("tabular-nums", option.priceSuggested ? "text-amber-700" : "text-body")}>
                        {option.price ? `€${option.price}` : "no price"}
                      </span>
                      <span className="text-xs text-muted">· {option.countryCodes.length} countries</span>
                    </p>
                    <p className="line-clamp-1 text-xs text-muted">{option.title}</p>
                    <p className="mt-0.5 text-xs text-body">{option.reason}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => onSwap(option.groupKey)}>
                    Use
                  </Button>
                </div>
              ))}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
            <p className="text-xs text-muted">Or pick any product — the rules are checked and shown as a warning.</p>
            <Button size="sm" variant="secondary" onClick={() => setSearching(true)}>
              Search all products
            </Button>
          </div>
        </div>
      )}
      {slot && searching && (
        <div className="flex flex-col gap-3">
          <Button size="sm" variant="ghost" className="self-start" onClick={() => setSearching(false)}>
            ← Back to buckets
          </Button>
          <ProductPicker selectedKey={slot.groupKey} eligible={eligible} onSelect={(group) => onSwap(group.key)} />
        </div>
      )}
    </Modal>
  );
}
