"use client";

import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";
import { BUCKETS, BUCKET_HELP, BUCKET_META, type Bucket } from "./buckets";

/** ⓘ next to a bucket name: hover or focus shows what the bucket is. */
export function BucketInfo({ bucket, side = "top", className }: { bucket: Bucket; side?: "top" | "bottom"; className?: string }) {
  const id = `bucket-help-${bucket}-${side}`;
  return (
    <span className={cn("group/tip relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={`What is ${BUCKET_META[bucket].label}?`}
        aria-describedby={id}
        className="flex h-4 w-4 cursor-help items-center justify-center rounded-full text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
      >
        <InformationCircleIcon className="h-4 w-4" />
      </button>
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none invisible absolute left-1/2 z-30 w-64 -translate-x-1/2 rounded-lg border border-line bg-surface p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-body opacity-0 shadow-overlay transition-opacity",
          "group-hover/tip:visible group-hover/tip:opacity-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2"
        )}
      >
        <span className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <span className={cn("h-2 w-2 rounded-full", BUCKET_META[bucket].dot)} />
          {BUCKET_META[bucket].label}
        </span>
        {BUCKET_HELP[bucket].help}
      </span>
    </span>
  );
}

/** One line of colour dots with names and ⓘ — what the board / grid colours mean. */
export function BucketLegend({ side = "bottom", className }: { side?: "top" | "bottom"; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-body", className)}>
      {BUCKETS.map((bucket) => (
        <span key={bucket} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-full", BUCKET_META[bucket].dot)} aria-hidden />
          <span className="font-medium text-ink">{BUCKET_META[bucket].label}</span>
          <span className="text-muted">{BUCKET_HELP[bucket].short}</span>
          <BucketInfo bucket={bucket} side={side} />
        </span>
      ))}
    </div>
  );
}
