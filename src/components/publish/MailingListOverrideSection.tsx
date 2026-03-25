"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDownIcon, ChevronUpIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface CountryConfig {
  countryCode: string;
  countryName: string;
  mailingListId: string;
  mailingListName: string;
}

interface MailingList {
  id: string;
  name: string;
}

interface MailingListOverrideSectionProps {
  countryConfigs: CountryConfig[];
  mailingLists: MailingList[];
  overrides: Record<string, string[]>; // countryCode -> mailingListIds
  onOverrideChange: (countryCode: string, mailingListIds: string[]) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

// Convert ISO country code to emoji flag (e.g., "HR" -> flag emoji)
function getCountryFlag(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function MultiSelect({
  options,
  selectedValues,
  onChange,
  placeholder = "Use default",
  hasOverride,
}: {
  options: MailingList[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  hasOverride: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (id: string) => {
    if (selectedValues.includes(id)) {
      onChange(selectedValues.filter((v) => v !== id));
    } else {
      onChange([...selectedValues, id]);
    }
  };

  const removeOption = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedValues.filter((v) => v !== id));
  };

  const selectedCount = selectedValues.length;

  // Build display label
  let displayLabel: string;
  if (selectedCount === 0) {
    displayLabel = placeholder;
  } else if (selectedCount === 1) {
    const opt = options.find((o) => o.id === selectedValues[0]);
    displayLabel = opt?.name || selectedValues[0];
  } else {
    displayLabel = `${selectedCount} lists selected`;
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger button — fixed height */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full h-8 px-3 text-xs rounded-full font-medium cursor-pointer
          flex items-center justify-between gap-1
          border transition-all duration-200
          ${hasOverride
            ? "bg-gradient-to-r from-white to-indigo-50 border-indigo-300 text-indigo-700 hover:from-indigo-100 hover:to-indigo-200"
            : "bg-gradient-to-r from-white to-gray-50 border-gray-200 text-gray-700 hover:from-gray-100 hover:to-gray-200"
          }
          ${isOpen ? `ring-2 ${hasOverride ? "ring-indigo-500" : "ring-gray-400"}` : ""}
        `}
      >
        <span className="truncate flex-1 text-left">
          {displayLabel}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {selectedCount > 1 && (
            <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-indigo-500 text-white">
              {selectedCount}
            </span>
          )}
          <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 bottom-full mb-2 z-50 w-64">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden">
            {/* Selected tags */}
            {selectedCount > 0 && (
              <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap gap-1.5">
                {selectedValues.map((id) => {
                  const opt = options.find((o) => o.id === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-indigo-100 text-indigo-700"
                    >
                      <span className="truncate max-w-[120px]">{opt?.name || id}</span>
                      <button
                        type="button"
                        onClick={(e) => removeOption(id, e)}
                        className="flex-shrink-0 hover:text-indigo-900 cursor-pointer"
                      >
                        <XMarkIcon className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Clear all */}
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full px-4 py-2 text-left text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors border-b border-gray-100 cursor-pointer"
              >
                Reset to default
              </button>
            )}

            {/* Options list */}
            <div className="max-h-52 overflow-y-auto">
              {options.map((option, index) => {
                const isSelected = selectedValues.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleOption(option.id)}
                    className={`
                      w-full px-4 py-2.5 text-left text-sm transition-all duration-150
                      flex items-center justify-between cursor-pointer
                      ${isSelected
                        ? "bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-800 font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                      }
                      ${index === options.length - 1 ? "rounded-b-2xl" : ""}
                    `}
                  >
                    <span className="truncate">{option.name}</span>
                    {isSelected && (
                      <CheckIcon className="w-4 h-4 text-indigo-600 flex-shrink-0 ml-2" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MailingListOverrideSection({
  countryConfigs,
  mailingLists,
  overrides,
  onOverrideChange,
  isExpanded,
  onToggle,
}: MailingListOverrideSectionProps) {
  const overrideCount = Object.values(overrides).filter((v) => v.length > 0).length;

  return (
    <div className="border border-gray-200 rounded-xl">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">
            Override mailing lists for this campaign
          </span>
          {overrideCount > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700">
              {overrideCount} override{overrideCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUpIcon className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronDownIcon className="w-5 h-5 text-gray-500" />
        )}
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="border-t border-gray-200">
          <div className="divide-y divide-gray-100">
            {countryConfigs.map((config) => {
              const selectedIds = overrides[config.countryCode] || [];
              const hasOverride = selectedIds.length > 0;

              return (
                <div
                  key={config.countryCode}
                  className={`px-4 py-3 ${hasOverride ? "bg-indigo-50/50" : "bg-white"}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    {/* Left: Country + Default */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-xl flex-shrink-0">
                        {getCountryFlag(config.countryCode)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 text-sm">
                            {config.countryName}
                          </p>
                          {hasOverride && (
                            <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                          )}
                        </div>
                        <p className={`text-xs truncate ${hasOverride ? "line-through text-gray-400" : "text-gray-500"}`}>
                          {config.mailingListName || "No default list"}
                        </p>
                      </div>
                    </div>

                    {/* Right: Multi-select Dropdown */}
                    <div className="flex-shrink-0 w-[200px]">
                      <MultiSelect
                        options={mailingLists}
                        selectedValues={selectedIds}
                        onChange={(ids) => onOverrideChange(config.countryCode, ids)}
                        placeholder="Use default"
                        hasOverride={hasOverride}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer hint */}
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-center text-xs text-gray-500">
            Overrides only apply to this campaign
          </div>
        </div>
      )}
    </div>
  );
}
