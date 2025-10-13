"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import CustomSelect from "@/components/ui/custom-select";
import IntegrationCard from "@/components/integrations/IntegrationCard";
import IntegrationTabs from "@/components/integrations/IntegrationTabs";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  TrashIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
import { PageLoadingSpinner } from "@/components/ui/loading-spinner";

interface ClientDetail {
  id: string;
  name: string;
  description?: string | null;
  industry?: string | null;
  website?: string | null;
  notes?: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  integrations: Array<{
    id: string;
    provider: string;
    status: string;
    metadata?: unknown;
    lastSyncedAt?: string | null;
  }>;
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    scheduledAt?: string | null;
    sentAt?: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

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

interface SqualoIntegration {
  id: string;
  provider: string;
  status: string;
  metadata?: {
    lists?: Array<{ id: string; name: string }> | null;
    [key: string]: unknown;
  } | null;
  lastSyncedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

type Alert = { type: "success" | "error"; message: string };

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const clientId = params?.id ?? null;

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [countries, setCountries] = useState<CountryConfig[]>([]);
  const [integration, setIntegration] = useState<SqualoIntegration | null>(
    null
  );
  const [activeClientId, setActiveClientId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingActive, setSavingActive] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [integrationModalOpen, setIntegrationModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [integrationAlert, setIntegrationAlert] = useState<Alert | null>(null);
  const [countryAlert, setCountryAlert] = useState<Alert | null>(null);
  const [showAllCountries, setShowAllCountries] = useState(false);

  const request = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetch(input, init);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.error || response.statusText || "Request failed";
        throw new Error(message);
      }
      return response;
    },
    []
  );

  const loadData = useCallback(async () => {
    if (!clientId) {
      setLoading(false);
      setError("Client not found");
      return;
    }

    setLoading(true);
    setError(null);
    setIntegrationAlert(null);
    setCountryAlert(null);

    try {
      const [clientRes, countryRes, integrationRes, activeRes] =
        await Promise.all([
          fetch(`/api/clients/${clientId}`),
          fetch(`/api/clients/${clientId}/countries`),
          fetch(`/api/clients/${clientId}/integration/squalomail`),
          fetch(`/api/clients/active`),
        ]);

      if (clientRes.status === 404) {
        setError("Client not found");
        setClient(null);
        setCountries([]);
        setIntegration(null);
        return;
      }

      if (!clientRes.ok) {
        throw new Error("Failed to load client");
      }

      const clientData = (await clientRes.json()) as { client: ClientDetail };
      setClient(clientData.client);

      if (countryRes.ok) {
        const countryData = (await countryRes.json()) as {
          countries: CountryConfig[];
        };
        setCountries(
          Array.isArray(countryData.countries) ? countryData.countries : []
        );
      }

      if (integrationRes.ok) {
        const integrationData = (await integrationRes.json()) as {
          integration: SqualoIntegration | null;
        };
        setIntegration(integrationData.integration ?? null);
      }

      if (activeRes.ok) {
        const activeData = (await activeRes.json()) as {
          clientId: string | null;
        };
        setActiveClientId(activeData.clientId ?? null);
      }
    } catch (err) {
      console.error(err);
      setError("Unable to load client details. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const mailingLists = useMemo(() => {
    const lists = integration?.metadata && (integration.metadata as any).lists;
    return Array.isArray(lists)
      ? (lists as Array<{ id: string; name: string }>)
      : [];
  }, [integration]);

  const mailingListOptions = useMemo(
    () => [
      { value: "", label: "No mailing list" },
      ...mailingLists.map((list) => ({ value: list.id, label: list.name })),
    ],
    [mailingLists]
  );

  const handleSetActive = async () => {
    if (!clientId) return;
    setSavingActive(true);
    setError(null);

    try {
      await request(`/api/clients/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      setActiveClientId(clientId);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to set active client"
      );
    } finally {
      setSavingActive(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!clientId || !client) return;
    const confirmed = window.confirm(
      `Delete client "${client.name}"? This will archive their data and remove access from your workspace.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    try {
      await request(`/api/clients/${clientId}`, { method: "DELETE" });
      router.push("/clients");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to delete client");
      setDeleting(false);
    }
  };

  const handleConnectIntegration = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!clientId) return;

    setIntegrationAlert(null);
    try {
      const response = await request(
        `/api/clients/${clientId}/integration/squalomail`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
        }
      );
      const data = (await response.json()) as {
        integration: SqualoIntegration | null;
      };
      setIntegration(data.integration ?? null);
      setIntegrationModalOpen(false);
      setApiKeyInput("");
      setIntegrationAlert({
        type: "success",
        message: "SqualoMail connected successfully.",
      });
    } catch (err) {
      console.error(err);
      setIntegrationAlert({
        type: "error",
        message:
          err instanceof Error ? err.message : "Could not connect SqualoMail",
      });
    }
  };

  const handleDisconnectIntegration = async () => {
    if (!clientId) return;

    setIntegrationAlert(null);
    try {
      await request(`/api/clients/${clientId}/integration/squalomail`, {
        method: "DELETE",
      });
      setIntegration(null);
      setIntegrationAlert({
        type: "success",
        message: "Integration disconnected.",
      });
    } catch (err) {
      console.error(err);
      setIntegrationAlert({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Could not disconnect integration",
      });
    }
  };

  const refreshMailingLists = async () => {
    if (!clientId) return;

    setIntegrationAlert(null);
    try {
      const response = await request(
        `/api/clients/${clientId}/integration/squalomail?refresh=1`
      );
      const data = (await response.json()) as {
        integration: SqualoIntegration | null;
      };
      setIntegration(data.integration ?? null);
      setIntegrationAlert({
        type: "success",
        message: "Mailing lists refreshed.",
      });
    } catch (err) {
      console.error(err);
      setIntegrationAlert({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Unable to refresh mailing lists",
      });
    }
  };

  const updateCountry = async (
    countryCode: string,
    payload: Record<string, unknown>,
    success?: string
  ) => {
    if (!clientId) return;

    setCountryAlert(null);
    try {
      const response = await request(`/api/clients/${clientId}/countries`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [{ countryCode, ...payload }] }),
      });
      const data = (await response.json()) as { countries: CountryConfig[] };
      setCountries(Array.isArray(data.countries) ? data.countries : []);
      if (success) {
        setCountryAlert({ type: "success", message: success });
      }
    } catch (err) {
      console.error(err);
      setCountryAlert({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Unable to update country settings",
      });
    }
  };

  const renderAlert = (alert: Alert | null) => {
    if (!alert) return null;
    const style =
      alert.type === "success"
        ? "border-green-200 bg-green-50 text-green-700"
        : "border-red-200 bg-red-50 text-red-700";
    return (
      <div className={`rounded-xl border px-4 py-3 text-sm ${style}`}>
        {alert.message}
      </div>
    );
  };

  if (!clientId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">
        Invalid client id.
      </div>
    );
  }

  if (loading) {
    return <PageLoadingSpinner text="Loading client..." />;
  }

  if (error || !client) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center space-y-4 px-4 text-center">
        <p className="text-red-600 font-medium">
          {error || "Client unavailable"}
        </p>
        <button
          onClick={() => router.push("/clients")}
          className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeftIcon className="w-4 h-4" /> Back to clients
        </button>
      </div>
    );
  }

  const connectedIntegrations = integration ? 1 : 0;
  const activeCountriesCount = countries.filter((c) => c.isActive).length;
  const totalCampaigns = client.campaigns?.length || 0;

  const displayedCountries = showAllCountries
    ? countries
    : countries.filter((c) => c.isActive);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Header Section */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <Link
                href="/clients"
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium"
              >
                <ArrowLeftIcon className="w-4 h-4" /> Back to clients
              </Link>
              <span>/</span>
              <span>{client.name}</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-2">
              <h1 className="text-4xl font-bold text-slate-900">
                {client.name}
              </h1>
              {activeClientId === client.id && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                  <CheckCircleIcon className="h-4 w-4" />
                  Active Client
                </span>
              )}
            </div>
            {client.industry && (
              <p className="text-indigo-600 font-semibold mt-2">
                {client.industry}
              </p>
            )}
            {client.description && (
              <p className="text-slate-600 mt-2 max-w-2xl">
                {client.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {activeClientId !== client.id && (
              <button
                onClick={handleSetActive}
                disabled={savingActive}
                className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:shadow-xl disabled:opacity-60"
              >
                {savingActive ? "Setting..." : "Set as Active"}
              </button>
            )}
            <button
              onClick={handleDeleteClient}
              disabled={deleting}
              className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-60"
            >
              <TrashIcon className="w-4 h-4" />
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Integrations
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {connectedIntegrations}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Email service{connectedIntegrations !== 1 ? "s" : ""} connected
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Active Countries
            </p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">
              {activeCountriesCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              of {countries.length} configured
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Campaigns
            </p>
            <p className="mt-2 text-3xl font-bold text-blue-600">
              {totalCampaigns}
            </p>
            <p className="mt-1 text-xs text-slate-500">Total campaigns sent</p>
          </div>
        </div>

        {/* Integration Cards Section */}
        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Integrations</h2>
            <p className="mt-1 text-sm text-slate-600">
              Connect email service providers to manage campaigns
            </p>
          </div>

          {renderAlert(integrationAlert)}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <IntegrationCard
              provider="SQUALOMAIL"
              integration={integration}
              onConnect={() => {
                setIntegrationAlert(null);
                setIntegrationModalOpen(true);
              }}
              onDisconnect={handleDisconnectIntegration}
              onRefresh={refreshMailingLists}
            />
            <IntegrationCard
              provider="KLAVIYO"
              integration={null}
              onConnect={() => {}}
              onDisconnect={() => {}}
              onRefresh={() => {}}
            />
            <IntegrationCard
              provider="MAILCHIMP"
              integration={null}
              onConnect={() => {}}
              onDisconnect={() => {}}
              onRefresh={() => {}}
            />
          </div>
        </section>

        {/* Integration Configuration Tabs */}
        {integration && (
          <IntegrationTabs
            integration={integration}
            countries={countries}
            onUpdateCountry={updateCountry}
            onRefresh={refreshMailingLists}
            onDisconnect={handleDisconnectIntegration}
            renderAlert={renderAlert}
            alert={integrationAlert}
          />
        )}

        {/* Country Configuration Section */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                Country Configuration
              </h2>
              <p className="text-sm text-slate-600">
                Enable countries and configure their settings
              </p>
            </div>
            <button
              onClick={() => setShowAllCountries(!showAllCountries)}
              className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {showAllCountries ? (
                <>
                  <ChevronUpIcon className="h-4 w-4" />
                  Show Active Only
                </>
              ) : (
                <>
                  <ChevronDownIcon className="h-4 w-4" />
                  Show All Countries
                </>
              )}
            </button>
          </div>

          {renderAlert(countryAlert)}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {displayedCountries.map((country) => {
              const listId = country.mailingListId ?? "";
              return (
                <div
                  key={country.id}
                  className={`relative rounded-xl border p-4 transition ${
                    country.isActive
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {country.country?.name || country.countryCode}
                      </p>
                      <p className="text-xs text-slate-500">
                        {country.countryCode}
                      </p>
                    </div>
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={country.isActive}
                        onChange={() =>
                          updateCountry(
                            country.countryCode,
                            { isActive: !country.isActive },
                            `${
                              country.country?.name || country.countryCode
                            } ${country.isActive ? "deactivated" : "activated"}`
                          )
                        }
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </label>
                  </div>

                  {country.isActive && (
                    <div className="mt-3">
                      {mailingLists.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          No mailing lists available
                        </p>
                      ) : (
                        <CustomSelect
                          options={mailingListOptions}
                          value={listId}
                          onChange={(selected) =>
                            updateCountry(
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
                          gradientFrom="white"
                          gradientTo="emerald-50"
                          borderColor="emerald-200"
                          textColor="slate-700"
                          hoverFrom="emerald-100"
                          hoverTo="emerald-200"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {displayedCountries.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
              <p className="text-sm text-slate-500">
                {showAllCountries
                  ? "No countries configured"
                  : "No active countries. Click 'Show All Countries' to configure."}
              </p>
            </div>
          )}
        </section>
      </div>

      {integrationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Connect SqualoMail
              </h2>
              <button
                onClick={() => setIntegrationModalOpen(false)}
                className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <form
              className="mt-6 space-y-4"
              onSubmit={handleConnectIntegration}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SqualoMail API key
                </label>
                <input
                  type="text"
                  value={apiKeyInput}
                  onChange={(event) => setApiKeyInput(event.target.value)}
                  placeholder="Enter API key"
                  required
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              {integrationAlert?.type === "error" && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {integrationAlert.message}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIntegrationModalOpen(false)}
                  className="cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 text-white font-semibold shadow-lg hover:shadow-xl"
                >
                  Connect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
