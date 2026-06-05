"use client";

import * as React from "react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  variant: ToastVariant;
  title: string;
  description?: string;
  leaving?: boolean;
}

interface ShowOptions {
  variant?: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastApi {
  show: (options: ShowOptions) => number;
  success: (title: string, description?: string) => number;
  error: (title: string, description?: string) => number;
  info: (title: string, description?: string) => number;
  warning: (title: string, description?: string) => number;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const EXIT_MS = 220;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
    );
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_MS);
  }, []);

  const show = React.useCallback(
    ({ variant = "info", title, description, duration = 4500 }: ShowOptions) => {
      const id = (idRef.current += 1);
      setToasts((prev) => [...prev, { id, variant, title, description }]);
      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  const api = React.useMemo<ToastApi>(
    () => ({
      show,
      success: (title, description) =>
        show({ variant: "success", title, description }),
      error: (title, description) =>
        show({ variant: "error", title, description, duration: 6000 }),
      info: (title, description) =>
        show({ variant: "info", title, description }),
      warning: (title, description) =>
        show({ variant: "warning", title, description }),
      dismiss,
    }),
    [show, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const variantStyles: Record<
  ToastVariant,
  { icon: React.ReactNode; accent: string }
> = {
  success: {
    icon: <CheckCircleIcon className="h-5 w-5" />,
    accent: "text-emerald-600",
  },
  error: {
    icon: <XCircleIcon className="h-5 w-5" />,
    accent: "text-rose-600",
  },
  info: {
    icon: <InformationCircleIcon className="h-5 w-5" />,
    accent: "text-brand-600",
  },
  warning: {
    icon: <ExclamationTriangleIcon className="h-5 w-5" />,
    accent: "text-amber-600",
  },
};

function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => {
        const style = variantStyles[toast.variant];
        return (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-overlay transition-all duration-200",
              toast.leaving
                ? "translate-y-1 opacity-0 sm:translate-x-2 sm:translate-y-0"
                : "animate-rise"
            )}
          >
            <span className={cn("mt-0.5 flex-shrink-0", style.accent)}>
              {style.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-sm text-muted">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="-mr-1 -mt-1 flex h-6 w-6 flex-shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
