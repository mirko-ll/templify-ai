"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import CustomSelect from "@/components/ui/custom-select";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

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
}

interface CountryConfig {
  id: string;
  countryCode: string;
  isActive: boolean;
  mailingListId?: string | null;
  mailingListName?: string | null;
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
  const [integration, setIntegration] = useState<SqualoIntegration | null>(null);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingActive, setSavingActive] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [integrationModalOpen, setIntegrationModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [integrationAlert, setIntegrationAlert] = useState<Alert | null>(null);
  const [countryAlert, setCountryAlert] = useState<Alert | null>(null);

  const request = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = payload?.error || response.statusText || "Request failed";
      throw new Error(message);
    }
    return response;
  }, []);

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
      const [clientRes, countryRes, integrationRes, activeRes] = await Promise.all([
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
        const countryData = (await countryRes.json()) as { countries: CountryConfig[] };
        setCountries(Array.isArray(countryData.countries) ? countryData.countries : []);
      }

      if (integrationRes.ok) {
        const integrationData = (await integrationRes.json()) as {
          integration: SqualoIntegration | null;
        };
        setIntegration(integrationData.integration ?? null);
      }

      if (activeRes.ok) {
        const activeData = (await activeRes.json()) as { clientId: string | null };
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
    return Array.isArray(lists) ? (lists as Array<{ id: string; name: string }>) : [];
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
      setError(err instanceof Error ? err.message : "Unable to set active client");
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

  const handleConnectIntegration = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clientId) return;

    setIntegrationAlert(null);
    try {
      const response = await request(`/api/clients/${clientId}/integration/squalomail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      const data = (await response.json()) as { integration: SqualoIntegration | null };
      setIntegration(data.integration ?? null);
      setIntegrationModalOpen(false);
      setApiKeyInput("");
      setIntegrationAlert({ type: "success", message: "SqualoMail connected successfully." });
    } catch (err) {
      console.error(err);
      setIntegrationAlert({
        type: "error",
        message: err instanceof Error ? err.message : "Could not connect SqualoMail",
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
      setIntegrationAlert({ type: "success", message: "Integration disconnected." });
    } catch (err) {
      console.error(err);
      setIntegrationAlert({
        type: "error",
        message: err instanceof Error ? err.message : "Could not disconnect integration",
      });
    }
  };

  const refreshMailingLists = async () => {
    if (!clientId) return;

    setIntegrationAlert(null);
    try {
      const response = await request(`/api/clients/${clientId}/integration/squalomail?refresh=1`);
      const data = (await response.json()) as { integration: SqualoIntegration | null };
      setIntegration(data.integration ?? null);
      setIntegrationAlert({ type: "success", message: "Mailing lists refreshed." });
    } catch (err) {
      console.error(err);
      setIntegrationAlert({
        type: "error",
        message: err instanceof Error ? err.message : "Unable to refresh mailing lists",
      });
    }
  };

  const updateCountry = async (countryCode: string, payload: Record<string, unknown>, success?: string) => {
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
        message: err instanceof Error ? err.message : "Unable to update country settings",
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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">
        Loading client...
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center space-y-4 px-4 text-center">
        <p className="text-red-600 font-medium">{error || "Client unavailable"}</p>
        <button
          onClick={() => router.push("/clients")}
          className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeftIcon className="w-4 h-4" /> Back to clients
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <Link
                href="/clients"
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
              >
                <ArrowLeftIcon className="w-4 h-4" /> Back to clients
              </Link>
              <span>/</span>
              <span>{client.name}</span>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mt-2">{client.name}</h1>
            {client.industry && (
              <p className="text-indigo-600 font-medium mt-1">{client.industry}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSetActive}
              disabled={savingActive || activeClientId === client.id}
              className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {activeClientId === client.id ? (
                <>
                  <CheckCircleIcon className="w-4 h-4 text-green-500" /> Active client
                </>
              ) : savingActive ? (
                "Setting..."
              ) : (
                "Set as active"
              )}
            </button>
            <button
              onClick={handleDeleteClient}
              disabled={deleting}
              className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-60"
            >
              <TrashIcon className="w-4 h-4" /> {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>

        {client.description && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm text-gray-600">
            {client.description}
          </div>
        )}

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">SqualoMail integration</h2>
              <p className="text-sm text-gray-500">
                Connect this client&apos;s SqualoMail account to fetch mailing lists per country and deliver campaigns directly.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={refreshMailingLists}
                className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <ArrowPathIcon className="w-4 h-4" /> Refresh lists
              </button>
              {integration ? (
                <button
                  onClick={handleDisconnectIntegration}
                  className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 hover:bg-red-100"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIntegrationAlert(null);
                    setIntegrationModalOpen(true);
                  }}
                  className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:shadow-xl"
                >
                  <PlusIcon className="w-4 h-4" /> Connect SqualoMail
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              {integration ? (
                <CheckCircleIcon className="w-5 h-5 text-green-500" />
              ) : (
                <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500" />
              )}
              <span>Status: {integration ? integration.status : "Not connected"}</span>
            </div>
            {integration?.lastSyncedAt && (
              <p className="mt-2">
                Last synced: {new Date(integration.lastSyncedAt).toLocaleString()}
              </p>
            )}
          </div>

          {renderAlert(integrationAlert)}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Country configuration</h2>
              <p className="text-sm text-gray-500">
                Toggle the countries you plan to target and map each one to a SqualoMail list.
              </p>
            </div>
          </div>

          {renderAlert(countryAlert)}

          <div className="relative rounded-xl border border-gray-200 overflow-visible">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Country
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Mailing list
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {countries.map((country) => {
                  const listId = country.mailingListId ?? "";
                  return (
                    <tr key={country.id} className="align-top">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="font-medium">{country.country?.name || country.countryCode}</div>
                        <div className="text-xs text-gray-500">{country.countryCode}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <label className="inline-flex items-center gap-2 text-gray-600">
                          <input
                            type="checkbox"
                            checked={country.isActive}
                            onChange={() =>
                              updateCountry(
                                country.countryCode,
                                { isActive: !country.isActive },
                                `${country.country?.name || country.countryCode} updated`
                              )
                            }
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{country.isActive ? "Active" : "Inactive"}</span>
                        </label>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {mailingLists.length === 0 ? (
                          <p className="text-xs text-gray-400">
                            Connect SqualoMail and refresh lists to enable selection.
                          </p>
                        ) : (
                          <div className="max-w-xs">
                            <CustomSelect
                              options={mailingListOptions}
                              value={listId}
                              onChange={(selected) =>
                                updateCountry(
                                  country.countryCode,
                                  {
                                    mailingListId: selected || null,
                                    mailingListName:
                                      mailingLists.find((list) => list.id === selected)?.name ?? null,
                                  },
                                  selected ? "Mailing list saved" : "Mailing list cleared"
                                )
                              }
                              placeholder="Select mailing list"
                              gradientFrom="white"
                              gradientTo="gray-50"
                              borderColor="gray-200"
                              textColor="gray-700"
                              hoverFrom="gray-100"
                              hoverTo="gray-200"
                              dropdownPlacement="above"
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {integrationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Connect SqualoMail</h2>
              <button
                onClick={() => setIntegrationModalOpen(false)}
                className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <form className="mt-6 space-y-4" onSubmit={handleConnectIntegration}>
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







