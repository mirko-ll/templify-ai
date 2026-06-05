"use client";

import { useEffect, useState } from "react";
import { ArrowPathIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import CustomSelect from "@/components/ui/custom-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

interface CountryConfig {
  id: string;
  countryCode: string;
  isActive: boolean;
  mailingListId?: string | null;
  mailingListName?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  lastSyncedAt?: string | null;
  country?: {
    code: string;
    name: string;
    isActive: boolean;
  } | null;
}

interface Integration {
  id: string;
  provider: string;
  status: string;
  metadata?: {
    lists?: Array<{ id: string; name: string }> | null;
    [key: string]: unknown;
  } | null;
  lastSyncedAt?: string | null;
}

interface SqualoMailConfigProps {
  clientId: string;
  integration: Integration;
  countries: CountryConfig[];
  mailingLists: Array<{ id: string; name: string }>;
  onUpdateCountry: (
    countryCode: string,
    payload: Record<string, unknown>,
    success?: string
  ) => Promise<void>;
  onRefresh: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  renderAlert: (
    alert: { type: "success" | "error"; message: string } | null
  ) => React.ReactNode;
  alert: { type: "success" | "error"; message: string } | null;
}

type CountryFormData = {
  mailingListId: string;
  mailingListName: string;
  senderEmail: string;
};

async function updateIntegrationSettings(
  clientId: string,
  utmMedium: string
): Promise<void> {
  const response = await fetch(
    `/api/clients/${clientId}/integration/squalomail`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ utmMedium: utmMedium.trim() || null }),
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "Failed to update settings");
  }
}

function buildInitialFormData(
  countries: CountryConfig[]
): Record<string, CountryFormData> {
  const data: Record<string, CountryFormData> = {};
  countries
    .filter((c) => c.isActive)
    .forEach((country) => {
      data[country.countryCode] = {
        mailingListId: country.mailingListId || "",
        mailingListName: country.mailingListName || "",
        senderEmail: country.senderEmail || "",
      };
    });
  return data;
}

export function SqualoMailConfig({
  clientId,
  integration,
  countries,
  mailingLists,
  onUpdateCountry,
  onRefresh,
  onDisconnect,
  renderAlert,
  alert,
}: SqualoMailConfigProps) {
  const toast = useToast();
  const [formData, setFormData] = useState<Record<string, CountryFormData>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const [utmMedium, setUtmMedium] = useState<string>("");
  const [isUtmDirty, setIsUtmDirty] = useState(false);
  const [isSavingUtm, setIsSavingUtm] = useState(false);

  const mailingListOptions = [
    { value: "", label: "No mailing list" },
    ...mailingLists.map((list) => ({ value: list.id, label: list.name })),
  ];

  const activeCountries = countries.filter((c) => c.isActive);

  useEffect(() => {
    setFormData(buildInitialFormData(countries));
    setIsDirty(false);
  }, [countries]);

  useEffect(() => {
    if (integration?.metadata && typeof integration.metadata === "object") {
      const metadata = integration.metadata as Record<string, unknown>;
      const savedUtmMedium =
        typeof metadata.utmMedium === "string" ? metadata.utmMedium : "";
      setUtmMedium(savedUtmMedium);
      setIsUtmDirty(false);
    }
  }, [integration]);

  const updateFormField = (
    countryCode: string,
    field: keyof CountryFormData,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [countryCode]: {
        ...prev[countryCode],
        [field]: value,
      },
    }));
    setIsDirty(true);
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const updates = Object.entries(formData).map(([countryCode, data]) => ({
        countryCode,
        mailingListId: data.mailingListId || null,
        mailingListName: data.mailingListName || null,
        senderEmail: data.senderEmail || null,
      }));

      for (const update of updates) {
        await onUpdateCountry(update.countryCode, {
          mailingListId: update.mailingListId,
          mailingListName: update.mailingListName,
          senderEmail: update.senderEmail,
        });
      }

      setIsDirty(false);
      setLastSaved(new Date());
      toast.success("Country settings saved");
    } catch (error) {
      console.error("Failed to save country configurations", error);
      toast.error(
        "Couldn't save country settings",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    setFormData(buildInitialFormData(countries));
    setIsDirty(false);
  };

  const handleSaveUtmMedium = async () => {
    if (!clientId) return;

    setIsSavingUtm(true);
    try {
      await updateIntegrationSettings(clientId, utmMedium);
      setIsUtmDirty(false);
      await onRefresh();
    } catch (error) {
      console.error("Failed to save UTM Medium", error);
      toast.error(
        "Couldn't save UTM medium",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setIsSavingUtm(false);
    }
  };

  const handleDiscardUtmMedium = () => {
    if (integration?.metadata && typeof integration.metadata === "object") {
      const metadata = integration.metadata as Record<string, unknown>;
      const savedUtmMedium =
        typeof metadata.utmMedium === "string" ? metadata.utmMedium : "";
      setUtmMedium(savedUtmMedium);
      setIsUtmDirty(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ink">
            SqualoMail configuration
          </h3>
          <p className="mt-1 text-sm text-muted">
            Manage your SqualoMail account settings and mailing lists.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            leftIcon={<ArrowPathIcon className="h-4 w-4" />}
          >
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onDisconnect}
            leftIcon={<XMarkIcon className="h-4 w-4" />}
            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            Disconnect
          </Button>
        </div>
      </div>

      {renderAlert(alert)}

      {/* UTM tracking */}
      <div className="rounded-xl border border-line bg-surface p-5 shadow-soft">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-ink">
              UTM tracking configuration
            </h4>
            <p className="mt-1 text-xs text-muted">
              Configure UTM parameters for automatic link tracking in your
              campaigns.
            </p>
          </div>
          {isUtmDirty && (
            <div className="flex flex-shrink-0 items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDiscardUtmMedium}
                disabled={isSavingUtm}
              >
                Discard
              </Button>
              <Button
                size="sm"
                onClick={handleSaveUtmMedium}
                isLoading={isSavingUtm}
                leftIcon={<CheckIcon className="h-4 w-4" />}
              >
                Save
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="utm-medium"
              className="mb-1.5 block text-xs font-medium text-ink"
            >
              UTM medium <span className="text-muted">(optional)</span>
            </label>
            <Input
              id="utm-medium"
              type="text"
              value={utmMedium}
              onChange={(e) => {
                setUtmMedium(e.target.value);
                setIsUtmDirty(true);
              }}
              placeholder="e.g., email, newsletter, campaign"
              className="max-w-md"
            />
            <p className="mt-1.5 text-xs text-muted">
              Leave empty to disable UTM tracking, or enter a value (e.g., email)
              to enable automatic UTM parameter tracking on all links. When
              enabled, links include utm_medium, utm_source (country code), and
              utm_campaign (country code).
            </p>
          </div>

          {isUtmDirty && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span className="font-semibold">Unsaved changes</span> — click Save
              to apply UTM tracking settings.
            </div>
          )}
        </div>
      </div>

      {/* Important note */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">
          Important: sender email configuration
        </p>
        <p className="mt-1 text-xs text-amber-800">
          Sender emails must match exactly with the verified sender emails in
          your SqualoMail account. There is no API endpoint to fetch these, so
          please ensure they are correct before sending campaigns.
        </p>
      </div>

      {/* Country configuration table */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-ink">
              Country configuration
            </h4>
            {lastSaved && (
              <p className="mt-0.5 text-xs text-muted">
                Last saved: {lastSaved.toLocaleTimeString()}
              </p>
            )}
          </div>
          {isDirty && (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDiscardChanges}
                disabled={isSaving}
              >
                Discard
              </Button>
              <Button
                size="sm"
                onClick={handleSaveAll}
                isLoading={isSaving}
                leftIcon={<CheckIcon className="h-4 w-4" />}
              >
                Save all changes
              </Button>
            </div>
          )}
        </div>

        {activeCountries.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface-muted/50 p-8 text-center text-sm text-muted">
            No active countries configured.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="min-w-full divide-y divide-line">
                <thead className="sticky top-0 z-10 bg-surface-muted">
                  <tr>
                    <th className="px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Country
                    </th>
                    <th className="px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Mailing list
                    </th>
                    <th className="px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Sender email
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {activeCountries.map((country) => {
                    const data = formData[country.countryCode] || {
                      mailingListId: "",
                      mailingListName: "",
                      senderEmail: "",
                    };

                    return (
                      <tr
                        key={country.id}
                        className="transition-colors hover:bg-surface-muted/50"
                      >
                        <td className="px-4 py-2.5 text-sm">
                          <p className="font-semibold text-ink">
                            {country.country?.name || country.countryCode}
                          </p>
                          <p className="text-xs text-muted">
                            {country.countryCode}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="max-w-[280px]">
                            {mailingLists.length === 0 ? (
                              <p className="text-xs text-muted">No lists</p>
                            ) : (
                              <CustomSelect
                                options={mailingListOptions}
                                value={data.mailingListId}
                                onChange={(selected) => {
                                  updateFormField(
                                    country.countryCode,
                                    "mailingListId",
                                    selected
                                  );
                                  updateFormField(
                                    country.countryCode,
                                    "mailingListName",
                                    mailingLists.find(
                                      (list) => list.id === selected
                                    )?.name || ""
                                  );
                                }}
                                placeholder="Select"
                                size="sm"
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <Input
                            type="email"
                            value={data.senderEmail}
                            onChange={(e) =>
                              updateFormField(
                                country.countryCode,
                                "senderEmail",
                                e.target.value
                              )
                            }
                            placeholder="sender@example.com"
                            className="h-8 max-w-[320px] text-xs"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-center gap-2 border-t border-line bg-surface-muted px-4 py-2 text-xs text-muted">
              <span>
                {activeCountries.length}{" "}
                {activeCountries.length === 1 ? "country" : "countries"}{" "}
                configured
              </span>
              {isDirty && (
                <Badge variant="warning" dot>
                  Unsaved changes
                </Badge>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
