import * as React from "react";
import { cn } from "@/lib/cn";

type StatAccent = "brand" | "success" | "info" | "warning" | "neutral";

const valueAccent: Record<StatAccent, string> = {
  brand: "text-brand-700",
  success: "text-emerald-600",
  info: "text-sky-600",
  warning: "text-amber-600",
  neutral: "text-ink",
};

const iconAccent: Record<StatAccent, string> = {
  brand: "border-brand-100 bg-brand-50 text-brand-600",
  success: "border-emerald-100 bg-emerald-50 text-emerald-600",
  info: "border-sky-100 bg-sky-50 text-sky-600",
  warning: "border-amber-100 bg-amber-50 text-amber-600",
  neutral: "border-line bg-surface-muted text-muted",
};

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: StatAccent;
  className?: string;
}

/** Compact metric tile — mono eyebrow, bold value, tinted icon chip. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = "neutral",
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface p-5 shadow-soft",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
          {label}
        </p>
        {icon && (
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border",
              iconAccent[accent]
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-3 text-3xl font-semibold tracking-tight tabular-nums",
          valueAccent[accent]
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
