"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, CheckIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

interface Option {
  value: string;
  label: string;
  emoji?: string;
}

interface CustomSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Legacy theming props — accepted for compatibility, no longer used. */
  gradientFrom?: string;
  gradientTo?: string;
  borderColor?: string;
  textColor?: string;
  hoverFrom?: string;
  hoverTo?: string;
  disabled?: boolean;
  dropdownPlacement?: "above" | "below";
  size?: "sm" | "md";
}

export default function CustomSelect({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  className = "",
  disabled = false,
  dropdownPlacement = "below",
  size = "md",
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const triggerSize =
    size === "sm" ? "h-8 px-3 pr-9 text-xs" : "h-10 px-3.5 pr-10 text-sm";

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border bg-surface font-medium text-ink shadow-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30",
          triggerSize,
          isOpen ? "border-brand-400 ring-2 ring-brand-500/30" : "border-line-strong",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:border-line-strong"
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.emoji && <span>{selectedOption.emoji}</span>}
          <span className={cn("truncate", !selectedOption && "text-muted")}>
            {selectedOption?.label || placeholder}
          </span>
        </span>
        <ChevronDownIcon
          className={cn(
            "h-4 w-4 flex-shrink-0 text-muted transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className={cn(
            "absolute left-0 right-0 z-50 min-w-max",
            dropdownPlacement === "above" ? "bottom-full mb-2" : "top-full mt-2"
          )}
        >
          <div className="animate-rise max-h-64 min-w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-overlay">
            {options.map((option) => {
              const isSelected = value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors focus:outline-none",
                    isSelected
                      ? "bg-brand-50 font-medium text-brand-700"
                      : "text-body hover:bg-surface-muted hover:text-ink"
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    {option.emoji && <span>{option.emoji}</span>}
                    <span className="truncate">{option.label}</span>
                  </span>
                  {isSelected && (
                    <CheckIcon className="h-4 w-4 flex-shrink-0 text-brand-600" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
