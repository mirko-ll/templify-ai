import { cn } from "@/lib/cn";

/**
 * Inline reference to the merge variables SqualoMail substitutes at send time.
 * Shown under subject / preheader inputs — same tokens the /app publish modal uses.
 */
export function VariableHint({ className }: { className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted", className)}>
      <span>Variables:</span>
      <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px] text-ink">
        {"{subtag:name}"}
      </code>
      <span>subscriber name,</span>
      <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px] text-ink">
        {"{price}"}
      </code>
      <span>product price</span>
    </p>
  );
}
