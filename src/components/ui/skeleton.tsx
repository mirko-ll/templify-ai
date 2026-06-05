import { cn } from "@/lib/cn";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-line/70", className)}
      {...props}
    />
  );
}

/** Card-shaped placeholder used in grid loading states. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface p-5 shadow-soft sm:p-6",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-3.5 w-1/3" />
        </div>
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
      <Skeleton className="mt-5 h-3.5 w-full" />
      <Skeleton className="mt-2 h-3.5 w-4/5" />
      <div className="mt-6 space-y-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    </div>
  );
}

/** Stat-card-shaped placeholder. */
export function SkeletonStat({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface p-5 shadow-soft",
        className
      )}
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-9 w-16" />
      <Skeleton className="mt-2 h-3 w-20" />
    </div>
  );
}
