"use client";

import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import CustomSelect from "@/components/ui/custom-select";

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
  overrides: Record<string, string>; // countryCode -> mailingListId
  onOverrideChange: (countryCode: string, mailingListId: string) => void;
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

export default function MailingListOverrideSection({
  countryConfigs,
  mailingLists,
  overrides,
  onOverrideChange,
  isExpanded,
  onToggle,
}: MailingListOverrideSectionProps) {
  const overrideCount = Object.keys(overrides).length;

  const mailingListOptions = mailingLists.map((list) => ({
    value: list.id,
    label: list.name,
  }));

  // Add "Use default" option at the start
  const selectOptions = [
    { value: "", label: "Use default" },
    ...mailingListOptions,
  ];

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
              const hasOverride = Boolean(overrides[config.countryCode]);
              const currentOverrideValue = overrides[config.countryCode] || "";

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

                    {/* Right: Override Dropdown */}
                    <div className="flex-shrink-0 w-[200px]">
                      <CustomSelect
                        options={selectOptions}
                        value={currentOverrideValue}
                        onChange={(selected) =>
                          onOverrideChange(config.countryCode, selected)
                        }
                        placeholder="Use default"
                        dropdownPlacement="above"
                        gradientFrom="white"
                        gradientTo={hasOverride ? "indigo-50" : "gray-50"}
                        borderColor={hasOverride ? "indigo-300" : "gray-200"}
                        textColor={hasOverride ? "indigo-700" : "gray-700"}
                        hoverFrom={hasOverride ? "indigo-100" : "gray-100"}
                        hoverTo={hasOverride ? "indigo-200" : "gray-200"}
                        size="sm"
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
