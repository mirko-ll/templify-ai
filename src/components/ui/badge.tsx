import * as React from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info";

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "border-line bg-surface-muted text-body",
  brand: "border-brand-200 bg-brand-50 text-brand-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
};

const dotClasses: Record<BadgeVariant, string> = {
  neutral: "bg-muted",
  brand: "bg-brand-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-sky-500",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

export function Badge({
  variant = "neutral",
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 rounded-full", dotClasses[variant])}
        />
      )}
      {children}
    </span>
  );
}

/** Map a backend status string to a badge variant. */
export function statusVariant(status?: string | null): BadgeVariant {
  const value = (status ?? "").toUpperCase();
  if (["SUCCESS", "ACTIVE", "APPROVED", "CONNECTED"].includes(value))
    return "success";
  if (["PARTIAL", "POSSIBLY_UNAVAILABLE", "PENDING", "DRAFT"].includes(value))
    return "warning";
  if (["FAILED", "ARCHIVED", "ERROR"].includes(value)) return "danger";
  return "neutral";
}

/** Title-case a SCREAMING_SNAKE status for display. */
function humanizeStatus(status?: string | null): string {
  if (!status) return "Unknown";
  return status
    .toLowerCase()
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function StatusBadge({
  status,
  label,
  dot = true,
  className,
}: {
  status?: string | null;
  label?: string;
  dot?: boolean;
  className?: string;
}) {
  return (
    <Badge variant={statusVariant(status)} dot={dot} className={className}>
      {label ?? humanizeStatus(status)}
    </Badge>
  );
}
