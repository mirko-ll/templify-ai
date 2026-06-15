"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import {
  ArrowTopRightOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CubeIcon,
  TagIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { categoryLabel } from "@/lib/product-grouping";
import { groupPreviewUrl, type ProductGroup } from "./planner-types";

interface ProductMediaViewerProps {
  /** The offer whose media is shown — kept mounted through the exit transition. */
  group: ProductGroup | null;
  open: boolean;
  onClose: () => void;
  /** Optional — surfaces a "Use this product" action so the viewer can pick it. */
  onSelect?: (group: ProductGroup) => void;
}

/**
 * Lightbox over a product offer's full image set, with a representative
 * preview-page link. Layers above the day-editor modal (z-[60]) so it can be
 * opened from the product picker without dismissing the form behind it.
 */
export function ProductMediaViewer({
  group,
  open,
  onClose,
  onSelect,
}: ProductMediaViewerProps) {
  const images = group?.images ?? [];
  const count = images.length;
  const [index, setIndex] = useState(0);

  // Restart at the first frame whenever a different product opens.
  useEffect(() => {
    setIndex(0);
  }, [group?.key]);

  const go = useCallback(
    (delta: number) => {
      if (count === 0) return;
      setIndex((current) => (current + delta + count) % count);
    },
    [count]
  );

  // Arrow-key navigation while the lightbox is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  const previewHref = group ? groupPreviewUrl(group) : null;
  const activeImage = images[index] ?? null;

  return (
    <Dialog open={open} onClose={onClose} className="relative z-[60]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-ink/60 backdrop-blur-sm transition-opacity duration-200 data-[closed]:opacity-0"
      />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel
            transition
            className="w-full max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface shadow-overlay transition duration-200 data-[closed]:scale-95 data-[closed]:opacity-0"
          >
            {group && (
              <>
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-line p-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <DialogTitle className="truncate text-lg font-semibold tracking-tight text-ink">
                        {group.slug}
                      </DialogTitle>
                      {group.category && (
                        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-muted">
                          <TagIcon className="h-3 w-3" />
                          {categoryLabel(group.category)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-muted">
                      {group.title}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close media viewer"
                    className="-mr-1 -mt-1 flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                {/* Stage */}
                <div className="bg-surface-muted/40 px-5 py-4">
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-line bg-surface">
                    {activeImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeImage}
                        alt={`${group.slug} — image ${index + 1}`}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted">
                        <CubeIcon className="h-12 w-12" />
                      </div>
                    )}

                    {count > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => go(-1)}
                          aria-label="Previous image"
                          className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line bg-surface/90 text-ink shadow-soft backdrop-blur-sm transition-colors hover:bg-surface"
                        >
                          <ChevronLeftIcon className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => go(1)}
                          aria-label="Next image"
                          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line bg-surface/90 text-ink shadow-soft backdrop-blur-sm transition-colors hover:bg-surface"
                        >
                          <ChevronRightIcon className="h-5 w-5" />
                        </button>
                        <span className="absolute bottom-2 right-2 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                          {index + 1} / {count}
                        </span>
                      </>
                    )}
                  </div>

                  {count > 1 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                      {images.map((url, i) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => setIndex(i)}
                          aria-label={`Show image ${i + 1}`}
                          aria-current={i === index}
                          className={cn(
                            "h-14 w-14 flex-shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition-colors",
                            i === index
                              ? "border-brand-500"
                              : "border-line hover:border-line-strong"
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 border-t border-line p-4">
                  <span className="text-xs text-muted">
                    {count > 0
                      ? `${count} ${count === 1 ? "image" : "images"}`
                      : "No media"}
                  </span>
                  <div className="flex items-center gap-2">
                    {previewHref && (
                      <a
                        href={previewHref}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({
                          variant: "secondary",
                          size: "sm",
                        })}
                      >
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                        Preview page
                      </a>
                    )}
                    {onSelect && (
                      <Button
                        size="sm"
                        onClick={() => {
                          onSelect(group);
                          onClose();
                        }}
                      >
                        Use this product
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
