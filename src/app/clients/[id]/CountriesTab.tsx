"use client";

import { useMemo, useState } from "react";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import CustomSelect from "@/components/ui/custom-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import type { Alert, CountryConfig, UpdateCountryFn } from "./types";

interface CountriesTabProps {
  countries: CountryConfig[];
  mailingLists: Array<{ id: string; name: string }>;
  countryAlert: Alert | null;
  renderAlert: (alert: Alert | null) => React.ReactNode;
  onUpdateCountry: UpdateCountryFn;
}

export function CountriesTab({
  countries,
  mailingLists,
  countryAlert,
  renderAlert,
  onUpdateCountry,
}: CountriesTabProps) {
  const [showAllCountries, setShowAllCountries] = useState(false);

  const mailingListOptions = useMemo(
    () => [
      { value: "", label: "No mailing list" },
      ...mailingLists.map((list) => ({ value: list.id, label: list.name })),
    ],
    [mailingLists]
  );

  const displayedCountries = showAllCountries
    ? countries
    : countries.filter((c) => c.isActive);

  return (
    <section className="space-y-5">
      <SectionHeader
        title="Country configuration"
        description="Enable countries and configure their mailing lists."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAllCountries((prev) => !prev)}
            leftIcon={
              showAllCountries ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )
            }
          >
            {showAllCountries ? "Show active only" : "Show all countries"}
          </Button>
        }
      />

      {renderAlert(countryAlert)}

      {displayedCountries.length === 0 ? (
        <EmptyState
          icon={<GlobeAltIcon className="h-6 w-6" />}
          title={
            showAllCountries ? "No countries configured" : "No active countries"
          }
          description={
            showAllCountries
              ? "Countries will appear here once configured."
              : "Switch to “Show all countries” to activate and configure them."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {displayedCountries.map((country) => {
            const listId = country.mailingListId ?? "";
            const label = country.country?.name || country.countryCode;
            return (
              <Card
                key={country.id}
                className={cn(
                  "p-4 transition-colors",
                  country.isActive
                    ? "border-brand-200 bg-brand-50/40"
                    : "bg-surface"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                      {country.isActive && (
                        <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-brand-600" />
                      )}
                      {label}
                    </p>
                    <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
                      {country.countryCode}
                    </p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center">
                    <span className="sr-only">
                      Toggle {label} ({country.isActive ? "active" : "inactive"})
                    </span>
                    <input
                      type="checkbox"
                      checked={country.isActive}
                      onChange={() =>
                        onUpdateCountry(
                          country.countryCode,
                          { isActive: !country.isActive },
                          `${label} ${country.isActive ? "deactivated" : "activated"}`
                        )
                      }
                      className="h-4 w-4 cursor-pointer rounded border-line-strong accent-brand-600"
                    />
                  </label>
                </div>

                {country.isActive && (
                  <div className="mt-3">
                    {mailingLists.length === 0 ? (
                      <p className="text-xs text-muted">
                        No mailing lists available
                      </p>
                    ) : (
                      <CustomSelect
                        options={mailingListOptions}
                        value={listId}
                        onChange={(selected) =>
                          onUpdateCountry(
                            country.countryCode,
                            {
                              mailingListId: selected || null,
                              mailingListName:
                                mailingLists.find(
                                  (list) => list.id === selected
                                )?.name ?? null,
                            },
                            selected
                              ? "Mailing list saved"
                              : "Mailing list cleared"
                          )
                        }
                        placeholder="Select list"
                        size="sm"
                      />
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
