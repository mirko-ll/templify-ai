"use client";

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useLayoutEffect,
  KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDownIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  /**
   * "auto" (default) flips above the trigger when there isn't enough room below.
   * "above" / "below" force a fixed placement.
   */
  dropdownPlacement?: "auto" | "above" | "below";
  clearable?: boolean;
  clearLabel?: string;
}

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "above" | "below";
}

const VIEWPORT_MARGIN = 8;
const DEFAULT_MAX_HEIGHT = 320;

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  emptyMessage = "No matches found",
  disabled = false,
  className = "",
  dropdownPlacement = "auto",
  clearable = false,
  clearLabel = "Clear selection",
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<DropdownPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) ?? null,
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      const haystack = `${opt.label} ${opt.description ?? ""} ${opt.badge ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inTrigger = containerRef.current?.contains(target) ?? false;
      const inDropdown = dropdownRef.current?.contains(target) ?? false;
      if (!inTrigger && !inDropdown) {
        setIsOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const recomputePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;

    let placement: "above" | "below";
    if (dropdownPlacement === "above") {
      placement = "above";
    } else if (dropdownPlacement === "below") {
      placement = "below";
    } else {
      // Auto: prefer below if there is room for at least 200px, otherwise pick the larger side.
      placement = spaceBelow >= 200 || spaceBelow >= spaceAbove ? "below" : "above";
    }

    const available = placement === "below" ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(160, Math.min(DEFAULT_MAX_HEIGHT, available));

    setPosition({
      top: placement === "below" ? rect.bottom + 6 : rect.top - 6,
      left: rect.left,
      width: rect.width,
      maxHeight,
      placement,
    });
  };

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    recomputePosition();
    const onScrollOrResize = () => recomputePosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      // Defer focus so the input mounts first
      const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  // Keep the active option scrolled into view during keyboard nav
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const node = listRef.current.querySelector<HTMLElement>(
      `[data-option-index="${activeIndex}"]`
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen]);

  const open = () => {
    if (disabled) return;
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setQuery("");
  };

  const choose = (optionValue: string) => {
    onChange(optionValue);
    close();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((idx) => Math.min(idx + 1, filteredOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((idx) => Math.max(idx - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filteredOptions[activeIndex];
      if (opt) choose(opt.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const dropdownStyle: React.CSSProperties | undefined = position
    ? {
        position: "fixed",
        left: position.left,
        width: position.width,
        maxHeight: position.maxHeight,
        ...(position.placement === "below"
          ? { top: position.top }
          : { top: position.top, transform: "translateY(-100%)" }),
      }
    : undefined;

  const dropdownAnimationClass = position?.placement === "above"
    ? "animate-in slide-in-from-bottom-2"
    : "animate-in slide-in-from-top-2";

  const dropdown =
    isOpen && position
      ? createPortal(
          <div
            ref={dropdownRef}
            role="listbox"
            style={dropdownStyle}
            className="z-[4000]"
          >
            <div
              className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ${dropdownAnimationClass}`}
              style={{ maxHeight: position.maxHeight }}
            >
              <div className="flex flex-shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2">
                <MagnifyingGlassIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={searchPlaceholder}
                  className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="flex-shrink-0 cursor-pointer rounded-full p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Clear search"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {clearable && value && (
                <button
                  type="button"
                  onClick={() => choose("")}
                  className="flex-shrink-0 w-full cursor-pointer border-b border-slate-100 px-4 py-2 text-left text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  {clearLabel}
                </button>
              )}

              <div ref={listRef} className="flex-1 overflow-y-auto sb-scroll">
                {filteredOptions.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">
                    {emptyMessage}
                  </div>
                ) : (
                  filteredOptions.map((option, index) => {
                    const isSelected = option.value === value;
                    const isActive = index === activeIndex;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        data-option-index={index}
                        onClick={() => choose(option.value)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`
                          relative w-full px-4 py-2.5 text-left transition-colors duration-100
                          flex items-start gap-3 cursor-pointer
                          ${isSelected
                            ? "bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-800"
                            : isActive
                            ? "bg-slate-50 text-slate-800"
                            : "text-slate-700"
                          }
                        `}
                      >
                        {isSelected && (
                          <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-blue-600" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{option.label}</span>
                            {option.badge && (
                              <span className="flex-shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                                {option.badge}
                              </span>
                            )}
                          </div>
                          {option.description && (
                            <p className="mt-0.5 text-xs text-slate-500 truncate">
                              {option.description}
                            </p>
                          )}
                        </div>
                        {isSelected && (
                          <CheckIcon className="h-4 w-4 flex-shrink-0 text-indigo-600 mt-0.5" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <style jsx>{`
              .sb-scroll::-webkit-scrollbar {
                width: 6px;
              }
              .sb-scroll::-webkit-scrollbar-track {
                background: #f1f5f9;
                border-radius: 3px;
              }
              .sb-scroll::-webkit-scrollbar-thumb {
                background: #cbd5e1;
                border-radius: 3px;
              }
              .sb-scroll::-webkit-scrollbar-thumb:hover {
                background: #94a3b8;
              }
            `}</style>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (isOpen ? close() : open())}
        className={`
          w-full flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 text-sm
          shadow-sm transition-all duration-200
          ${disabled ? "opacity-50 cursor-not-allowed border-slate-200 text-slate-400" : "cursor-pointer border-slate-300 text-slate-700 hover:border-indigo-300"}
          ${isOpen ? "border-indigo-400 ring-2 ring-indigo-200" : ""}
        `}
      >
        <span className={`flex-1 truncate text-left ${selectedOption ? "" : "text-slate-400"}`}>
          {selectedOption ? (
            <span className="inline-flex items-center gap-2">
              <span className="truncate">{selectedOption.label}</span>
              {selectedOption.badge && (
                <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                  {selectedOption.badge}
                </span>
              )}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {dropdown}
    </div>
  );
}
