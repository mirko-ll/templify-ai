"use client";

import { useState, useEffect } from "react";
import CustomSelect from "@/components/ui/custom-select";
import { ArrowPathIcon, XMarkIcon, CheckIcon } from "@heroicons/react/24/outline";

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

interface IntegrationTabsProps {
  clientId: string;
  integration: Integration | null;
  countries: CountryConfig[];
  onUpdateCountry: (
    countryCode: string,
    payload: Record<string, unknown>,
    success?: string
  ) => Promise<void>;
  onRefresh: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  renderAlert: (alert: { type: "success" | "error"; message: string } | null) => React.ReactNode;
  alert: { type: "success" | "error"; message: string } | null;
}

async function updateIntegrationSettings(clientId: string, utmMedium: string): Promise<void> {
  const response = await fetch(`/api/clients/${clientId}/integration/squalomail`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ utmMedium: utmMedium.trim() || null }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "Failed to update settings");
  }
}

type CountryFormData = {
  mailingListId: string;
  mailingListName: string;
  senderEmail: string;
  senderName: string;
};

export default function IntegrationTabs({
  clientId,
  integration,
  countries,
  onUpdateCountry,
  onRefresh,
  onDisconnect,
  renderAlert,
  alert,
}: IntegrationTabsProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "squalomail" | "klaviyo">("overview");
  const [formData, setFormData] = useState<Record<string, CountryFormData>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // UTM Medium state
  const [utmMedium, setUtmMedium] = useState<string>("");
  const [isUtmDirty, setIsUtmDirty] = useState(false);
  const [isSavingUtm, setIsSavingUtm] = useState(false);

  const mailingLists =
    integration?.metadata && Array.isArray(integration.metadata.lists)
      ? (integration.metadata.lists as Array<{ id: string; name: string }>)
      : [];

  const mailingListOptions = [
    { value: "", label: "No mailing list" },
    ...mailingLists.map((list) => ({ value: list.id, label: list.name })),
  ];

  const connectedIntegrations = integration ? 1 : 0;
  const activeCountriesCount = countries.filter((c) => c.isActive).length;

  // Initialize form data from countries
  useEffect(() => {
    const initialData: Record<string, CountryFormData> = {};
    countries.filter((c) => c.isActive).forEach((country) => {
      initialData[country.countryCode] = {
        mailingListId: country.mailingListId || "",
        mailingListName: country.mailingListName || "",
        senderEmail: country.senderEmail || "",
        senderName: country.senderName || "",
      };
    });
    setFormData(initialData);
    setIsDirty(false);
  }, [countries]);

  // Initialize UTM Medium from integration metadata
  useEffect(() => {
    if (integration?.metadata && typeof integration.metadata === "object") {
      const metadata = integration.metadata as Record<string, unknown>;
      const savedUtmMedium = typeof metadata.utmMedium === "string" ? metadata.utmMedium : "";
      setUtmMedium(savedUtmMedium);
      setIsUtmDirty(false);
    }
  }, [integration]);

  const updateFormField = (countryCode: string, field: keyof CountryFormData, value: string) => {
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
      // Batch update all countries
      const updates = Object.entries(formData).map(([countryCode, data]) => ({
        countryCode,
        mailingListId: data.mailingListId || null,
        mailingListName: data.mailingListName || null,
        senderEmail: data.senderEmail || null,
        senderName: data.senderName || null,
      }));

      // Use the existing onUpdateCountry but batch all updates
      for (const update of updates) {
        await onUpdateCountry(
          update.countryCode,
          {
            mailingListId: update.mailingListId,
            mailingListName: update.mailingListName,
            senderEmail: update.senderEmail,
            senderName: update.senderName,
          }
        );
      }

      setIsDirty(false);
      setLastSaved(new Date());
    } catch (error) {
      console.error("Failed to save country configurations", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    // Reset form data to original values
    const initialData: Record<string, CountryFormData> = {};
    countries.filter((c) => c.isActive).forEach((country) => {
      initialData[country.countryCode] = {
        mailingListId: country.mailingListId || "",
        mailingListName: country.mailingListName || "",
        senderEmail: country.senderEmail || "",
        senderName: country.senderName || "",
      };
    });
    setFormData(initialData);
    setIsDirty(false);
  };

  const handleSaveUtmMedium = async () => {
    if (!clientId) return;

    setIsSavingUtm(true);
    try {
      await updateIntegrationSettings(clientId, utmMedium);
      setIsUtmDirty(false);
      // Trigger refresh to reload integration with updated metadata
      await onRefresh();
    } catch (error) {
      console.error("Failed to save UTM Medium", error);
    } finally {
      setIsSavingUtm(false);
    }
  };

  const handleDiscardUtmMedium = () => {
    if (integration?.metadata && typeof integration.metadata === "object") {
      const metadata = integration.metadata as Record<string, unknown>;
      const savedUtmMedium = typeof metadata.utmMedium === "string" ? metadata.utmMedium : "";
      setUtmMedium(savedUtmMedium);
      setIsUtmDirty(false);
    }
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "squalomail", label: "SqualoMail", disabled: !integration },
    { id: "klaviyo", label: "Klaviyo", disabled: true, comingSoon: true },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Tab Navigation */}
      <div className="border-b border-slate-200 px-6">
        <nav className="flex gap-6" aria-label="Integration tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id as any)}
              disabled={tab.disabled}
              className={`relative cursor-pointer border-b-2 px-1 py-4 text-sm font-semibold transition disabled:cursor-not-allowed ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : tab.disabled
                  ? "border-transparent text-slate-400"
                  : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              {tab.label}
              {tab.comingSoon && (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  Soon
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Integration Overview
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Manage your email marketing integrations and country configurations
              </p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Connected
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {connectedIntegrations}
                </p>
                <p className="mt-1 text-xs text-slate-500">Email service{connectedIntegrations !== 1 ? "s" : ""}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-emerald-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Active Countries
                </p>
                <p className="mt-2 text-3xl font-bold text-emerald-600">
                  {activeCountriesCount}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  of {countries.length} total
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-blue-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Mailing Lists
                </p>
                <p className="mt-2 text-3xl font-bold text-blue-600">
                  {mailingLists.length}
                </p>
                <p className="mt-1 text-xs text-slate-500">Available lists</p>
              </div>
            </div>

            {/* Status */}
            {!integration && (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                <p className="font-semibold">No integrations connected</p>
                <p className="mt-1 text-yellow-700">
                  Connect an email service provider to start managing campaigns
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "squalomail" && integration && (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  SqualoMail Configuration
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Manage your SqualoMail account settings and mailing lists
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onRefresh}
                  className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  Refresh
                </button>
                <button
                  onClick={onDisconnect}
                  className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
                >
                  <XMarkIcon className="h-4 w-4" />
                  Disconnect
                </button>
              </div>
            </div>

            {renderAlert(alert)}

            {/* UTM Medium Configuration */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">
                    UTM Tracking Configuration
                  </h4>
                  <p className="mt-1 text-xs text-slate-600">
                    Configure UTM parameters for automatic link tracking in your campaigns
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isUtmDirty && (
                    <>
                      <button
                        onClick={handleDiscardUtmMedium}
                        disabled={isSavingUtm}
                        className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Discard
                      </button>
                      <button
                        onClick={handleSaveUtmMedium}
                        disabled={isSavingUtm}
                        className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:shadow-md disabled:opacity-50"
                      >
                        {isSavingUtm ? (
                          <>
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <CheckIcon className="h-3.5 w-3.5" />
                            Save
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    UTM Medium <span className="text-slate-500">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={utmMedium}
                    onChange={(e) => {
                      setUtmMedium(e.target.value);
                      setIsUtmDirty(true);
                    }}
                    placeholder="e.g., email, newsletter, campaign"
                    className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    Leave empty to disable UTM tracking, or enter a value (e.g., "email") to enable automatic UTM parameter tracking on all links.
                    When enabled, links will include utm_medium, utm_source (country code), and utm_campaign (country code).
                  </p>
                </div>

                {isUtmDirty && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span className="font-semibold">Unsaved changes</span> - Click "Save" to apply UTM tracking settings
                  </div>
                )}
              </div>
            </div>

            {/* Important Note */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">
                📧 Important: Sender Email Configuration
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Sender emails must match exactly with the verified sender emails in your SqualoMail account.
                There is no API endpoint to fetch these, so please ensure they are correct before sending campaigns.
              </p>
            </div>

            {/* Country Configuration Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">
                    Country Configuration
                  </h4>
                  {lastSaved && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Last saved: {lastSaved.toLocaleTimeString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isDirty && (
                    <>
                      <button
                        onClick={handleDiscardChanges}
                        disabled={isSaving}
                        className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Discard
                      </button>
                      <button
                        onClick={handleSaveAll}
                        disabled={isSaving}
                        className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:shadow-md disabled:opacity-50"
                      >
                        {isSaving ? (
                          <>
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <CheckIcon className="h-3.5 w-3.5" />
                            Save All Changes
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {countries.filter((c) => c.isActive).length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  No active countries configured
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="max-h-[500px] overflow-y-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                            Country
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                            Mailing List
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                            Sender Email
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                            Sender Name
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {countries
                          .filter((country) => country.isActive)
                          .map((country) => {
                            const data = formData[country.countryCode] || {
                              mailingListId: "",
                              mailingListName: "",
                              senderEmail: "",
                              senderName: "",
                            };

                            return (
                              <tr key={country.id} className="hover:bg-slate-50 transition">
                                {/* Country */}
                                <td className="px-4 py-2.5 text-sm">
                                  <div>
                                    <p className="font-semibold text-slate-900">
                                      {country.country?.name || country.countryCode}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {country.countryCode}
                                    </p>
                                  </div>
                                </td>

                                {/* Mailing List */}
                                <td className="px-4 py-2.5">
                                  <div className="max-w-[280px]">
                                    {mailingLists.length === 0 ? (
                                      <p className="text-xs text-slate-400">No lists</p>
                                    ) : (
                                      <CustomSelect
                                        options={mailingListOptions}
                                        value={data.mailingListId}
                                        onChange={(selected) => {
                                          updateFormField(country.countryCode, "mailingListId", selected);
                                          updateFormField(
                                            country.countryCode,
                                            "mailingListName",
                                            mailingLists.find((list) => list.id === selected)?.name || ""
                                          );
                                        }}
                                        placeholder="Select"
                                        gradientFrom="white"
                                        gradientTo="slate-50"
                                        borderColor="slate-200"
                                        textColor="slate-700"
                                        hoverFrom="slate-100"
                                        hoverTo="slate-200"
                                        size="sm"
                                      />
                                    )}
                                  </div>
                                </td>

                                {/* Sender Email */}
                                <td className="px-4 py-2.5">
                                  <input
                                    type="email"
                                    value={data.senderEmail}
                                    onChange={(e) =>
                                      updateFormField(country.countryCode, "senderEmail", e.target.value)
                                    }
                                    placeholder="sender@example.com"
                                    className="w-full max-w-[240px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                  />
                                </td>

                                {/* Sender Name */}
                                <td className="px-4 py-2.5">
                                  <input
                                    type="text"
                                    value={data.senderName}
                                    onChange={(e) =>
                                      updateFormField(country.countryCode, "senderName", e.target.value)
                                    }
                                    placeholder="Company Name"
                                    className="w-full max-w-[200px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer with count */}
                  <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-center text-xs text-slate-600">
                    {countries.filter((c) => c.isActive).length} {countries.filter((c) => c.isActive).length === 1 ? 'country' : 'countries'} configured
                    {isDirty && <span className="ml-2 text-amber-600 font-semibold">• Unsaved changes</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
