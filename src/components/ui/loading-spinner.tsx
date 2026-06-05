import { cn } from "@/lib/cn";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  color?: "brand" | "white" | "muted" | "current";
  className?: string;
  text?: string;
}

const sizeClasses = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-2",
  xl: "h-11 w-11 border-[3px]",
};

const colorClasses = {
  brand: "border-brand-600 border-t-transparent",
  white: "border-white border-t-transparent",
  muted: "border-muted border-t-transparent",
  current: "border-current border-t-transparent",
};

export function LoadingSpinner({
  size = "md",
  color = "brand",
  className = "",
  text,
}: LoadingSpinnerProps) {
  const spinner = (
    <div
      className={cn(
        "animate-spin rounded-full",
        sizeClasses[size],
        colorClasses[color],
        className
      )}
    />
  );

  if (text) {
    return (
      <div className="flex items-center gap-2.5">
        {spinner}
        <span className="text-sm text-muted">{text}</span>
      </div>
    );
  }

  return spinner;
}

// Preset components for common use cases
export function PageLoadingSpinner({ text }: { text?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="flex flex-col items-center justify-center text-center">
        <LoadingSpinner size="xl" />
        {text && <p className="mt-4 text-muted">{text}</p>}
      </div>
    </div>
  );
}

export function InlineLoadingSpinner({ text }: { text?: string }) {
  return <LoadingSpinner size="sm" text={text} />;
}

export function ButtonLoadingSpinner() {
  return <LoadingSpinner size="sm" color="current" />;
}
