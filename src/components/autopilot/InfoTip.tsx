"use client";

import { useId } from "react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

/** ⓘ that explains a setting on hover or keyboard focus. */
export function InfoTip({
  title,
  children,
  label,
  side = "top",
  align = "center",
  className,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  /** Accessible name, e.g. "About minimum margin". */
  label: string;
  side?: "top" | "bottom";
  align?: "center" | "start";
  className?: string;
}) {
  const id = useId();
  return (
    <span className={cn("group/tip relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="flex h-4 w-4 cursor-help items-center justify-center rounded-full text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
      >
        <InformationCircleIcon className="h-4 w-4" />
      </button>
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none invisible absolute z-30 w-80 max-w-[85vw] rounded-lg border border-line bg-surface p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-body opacity-0 shadow-overlay transition-opacity",
          "group-hover/tip:visible group-hover/tip:opacity-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"
        )}
      >
        <span className="mb-1 block text-sm font-semibold text-ink">{title}</span>
        {children}
      </span>
    </span>
  );
}
