interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  color?: "indigo" | "blue" | "green" | "red" | "white" | "gray";
  className?: string;
  text?: string;
}

const sizeClasses = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-2",
  xl: "h-12 w-12 border-b-2",
};

const colorClasses = {
  indigo: "border-indigo-600 border-t-transparent",
  blue: "border-blue-600 border-t-transparent",
  green: "border-green-600 border-t-transparent",
  red: "border-red-600 border-t-transparent",
  white: "border-white border-t-transparent",
  gray: "border-gray-600 border-t-transparent",
};

export function LoadingSpinner({
  size = "md",
  color = "indigo",
  className = "",
  text,
}: LoadingSpinnerProps) {
  const spinnerClasses = `animate-spin rounded-full ${sizeClasses[size]} ${colorClasses[color]} ${className}`;

  const spinner = <div className={spinnerClasses} />;

  if (text) {
    return (
      <div className="flex items-center gap-2">
        {spinner}
        <span className="text-sm text-gray-600">{text}</span>
      </div>
    );
  }

  return spinner;
}

// Preset components for common use cases
export function PageLoadingSpinner({ text }: { text?: string }) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center flex flex-col items-center justify-center">
        <LoadingSpinner size="xl" />
        {text && <p className="mt-4 text-slate-600">{text}</p>}
      </div>
    </div>
  );
}

export function InlineLoadingSpinner({ text }: { text?: string }) {
  return <LoadingSpinner size="sm" text={text} />;
}

export function ButtonLoadingSpinner() {
  return <LoadingSpinner size="sm" color="white" />;
}
