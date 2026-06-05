"use client";

import * as React from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import {
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";
import { Button, type ButtonVariant } from "./button";

type ModalSize = "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: ModalSize;
  children?: React.ReactNode;
  /** Padding wrapper around children. Set false when children own their layout. */
  bodyClassName?: string;
}

/** Accessible dialog (focus trap, ESC, overlay click) styled to the design system. */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
  bodyClassName,
}: ModalProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-ink/40 backdrop-blur-sm transition-opacity duration-200 data-[closed]:opacity-0"
      />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel
            transition
            className={cn(
              "w-full rounded-2xl border border-line bg-surface shadow-overlay transition duration-200 data-[closed]:scale-95 data-[closed]:opacity-0",
              sizeClasses[size]
            )}
          >
            <div className="flex items-start justify-between gap-4 p-6 pb-4">
              <div className="min-w-0">
                {title && (
                  <DialogTitle className="text-lg font-semibold tracking-tight text-ink">
                    {title}
                  </DialogTitle>
                )}
                {description && (
                  <p className="mt-1 text-sm text-muted">{description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="-mr-1 -mt-1 flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className={cn("px-6 pb-6", bodyClassName)}>{children}</div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: Extract<ButtonVariant, "danger" | "primary">;
  isLoading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "danger",
  isLoading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={isLoading ? () => {} : onClose}
      className="relative z-[60]"
    >
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-ink/40 backdrop-blur-sm transition-opacity duration-200 data-[closed]:opacity-0"
      />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel
            transition
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-overlay transition duration-200 data-[closed]:scale-95 data-[closed]:opacity-0"
          >
            <div className="flex gap-4">
              <span
                className={cn(
                  "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border",
                  confirmVariant === "danger"
                    ? "border-rose-100 bg-rose-50 text-rose-600"
                    : "border-brand-100 bg-brand-50 text-brand-600"
                )}
              >
                <ExclamationTriangleIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-base font-semibold text-ink">
                  {title}
                </DialogTitle>
                {description && (
                  <div className="mt-1.5 text-sm text-muted">{description}</div>
                )}
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2.5">
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={isLoading}
              >
                {cancelLabel}
              </Button>
              <Button
                variant={confirmVariant}
                onClick={onConfirm}
                isLoading={isLoading}
              >
                {confirmLabel}
              </Button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}

interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: Extract<ButtonVariant, "danger" | "primary">;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve?: (value: boolean) => void;
}

/**
 * Promise-based confirmation, a drop-in for window.confirm.
 *   const { confirm, confirmDialog } = useConfirm();
 *   if (!(await confirm({ title: "Delete?" }))) return;
 *   // ...render {confirmDialog}
 */
export function useConfirm() {
  const [state, setState] = React.useState<ConfirmState>({
    open: false,
    title: "",
  });

  const confirm = React.useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, open: true, resolve });
    });
  }, []);

  const settle = React.useCallback(
    (value: boolean) => {
      state.resolve?.(value);
      setState((prev) => ({ ...prev, open: false, resolve: undefined }));
    },
    [state]
  );

  const confirmDialog = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      confirmVariant={state.confirmVariant}
      onConfirm={() => settle(true)}
      onClose={() => settle(false)}
    />
  );

  return { confirm, confirmDialog };
}
