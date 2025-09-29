"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

interface ClientSummary {
  id: string;
  name: string;
  description?: string | null;
  industry?: string | null;
  website?: string | null;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
  countryConfigs: Array<{
    id: string;
    countryCode: string;
    isActive: boolean;
  }>;
  integrations: Array<{
    id: string;
    provider: string;
    status: string;
    updatedAt: string;
  }>;
}

interface FormState {
  name: string;
  description: string;
  industry: string;
  website: string;
  notes: string;
}

const initialFormState: FormState = {
  name: "",
  description: "",
  industry: "",
  website: "",
  notes: "",
};

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<FormState>(initialFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadClients();
    loadActiveClient();
  }, []);

  const loadClients = async (query?: string) => {
    setLoading(true);
    setError(null);

    try {
      let url = "/api/clients";
      if (query && query.trim()) {
        url += `?search=${encodeURIComponent(query.trim())}`;
      }
      const response = await fetch(url, { method: "GET" });
      if (!response.ok) {
        throw new Error("Failed to load clients");
      }
      const data = (await response.json()) as { clients: ClientSummary[] };
      setClients(Array.isArray(data.clients) ? data.clients : []);
    } catch (err) {
      console.error(err);
      setError("We couldn't load clients. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadActiveClient = async () => {
    try {
      const response = await fetch("/api/clients/active", { method: "GET" });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { clientId: string | null };
      setActiveClientId(data.clientId ?? null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadClients(search);
    await loadActiveClient();
  };

  const handleSetActiveClient = async (clientId: string) => {
    setActivatingId(clientId);
    setError(null);

    try {
      const response = await fetch("/api/clients/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to set active client");
      }

      setActiveClientId(clientId);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Failed to set active client"
      );
    } finally {
      setActivatingId(null);
    }
  };

  const handleInputChange = (field: keyof FormState, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setFormData(initialFormState);
    setFormError(null);
    setIsCreating(false);
  };

  const handleCreateClient = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!formData.name.trim()) {
      setFormError("Client name is required");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          industry: formData.industry.trim() || undefined,
          website: formData.website.trim() || undefined,
          notes: formData.notes.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to create client");
      }

      resetForm();
      await loadClients(search);
      await loadActiveClient();
    } catch (err) {
      console.error(err);
      setFormError(
        err instanceof Error ? err.message : "Unable to create client"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeClients = useMemo(
    () => clients.filter((client) => !client.isArchived),
    [clients]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Clients</h1>
            <p className="text-gray-600 mt-2 max-w-2xl">
              Manage your clients, track integration status, and configure the
              countries you plan to target for campaign generation.
            </p>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3 px-5 text-white font-semibold shadow-lg hover:shadow-xl"
          >
            <PlusIcon className="w-5 h-5" />
            New Client
          </button>
        </div>

        <form
          onSubmit={handleSearch}
          className="flex flex-col sm:flex-row gap-3 items-start sm:items-center"
        >
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search clients by name"
            className="w-full sm:max-w-md rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button
            type="submit"
            className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Refresh
          </button>
        </form>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-500">
            Loading clients...
          </div>
        ) : activeClients.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <h2 className="text-xl font-semibold text-gray-800">
              No clients yet
            </h2>
            <p className="text-gray-500 mt-2">
              Add your first client to start configuring integrations and
              country preferences.
            </p>
            <button
              onClick={() => setIsCreating(true)}
              className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 text-white font-semibold shadow-lg hover:shadow-xl"
            >
              <PlusIcon className="w-5 h-5" />
              Create client
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {activeClients.map((client) => {
              const integration = client.integrations[0];
              const activeCountryCount = client.countryConfigs.filter(
                (config) => config.isActive
              ).length;
              const isActive = client.id === activeClientId;

              return (
                <div
                  key={client.id}
                  className={`relative rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition ${
                    isActive
                      ? "border-indigo-400 ring-1 ring-indigo-100 shadow-md"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">
                        {client.name}
                      </h3>
                      {client.industry && (
                        <p className="text-sm text-indigo-600 font-medium">
                          {client.industry}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                          Active client
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSetActiveClient(client.id)}
                          disabled={activatingId === client.id}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-indigo-100 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {activatingId === client.id
                            ? "Setting..."
                            : "Set active"}
                        </button>
                      )}
                      <Link
                        href={`/clients/${client.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        View
                        <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>

                  {client.description && (
                    <p className="mt-3 text-sm text-gray-600 line-clamp-3">
                      {client.description}
                    </p>
                  )}

                  <div className="mt-5 space-y-2 text-sm text-gray-600">
                    <div className="flex items-center justify-between">
                      <span>Countries configured</span>
                      <span className="font-semibold text-gray-900">
                        {activeCountryCount} / {client.countryConfigs.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Integration status</span>
                      <span className="font-semibold text-gray-900">
                        {integration ? integration.status : "Not connected"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-gray-900">
                  Create client
                </h2>
                <button
                  onClick={resetForm}
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleCreateClient}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Client name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    autoFocus
                    onChange={(event) =>
                      handleInputChange("name", event.target.value)
                    }
                    placeholder="Acme Corp"
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Industry
                    </label>
                    <input
                      type="text"
                      value={formData.industry}
                      onChange={(event) =>
                        handleInputChange("industry", event.target.value)
                      }
                      placeholder="E-commerce"
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Website
                    </label>
                    <input
                      type="url"
                      value={formData.website}
                      onChange={(event) =>
                        handleInputChange("website", event.target.value)
                      }
                      placeholder="https://example.com"
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(event) =>
                      handleInputChange("description", event.target.value)
                    }
                    rows={3}
                    placeholder="Tell us more about this client"
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(event) =>
                      handleInputChange("notes", event.target.value)
                    }
                    rows={3}
                    placeholder="Internal notes"
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>

                {formError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {formError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 text-white font-semibold shadow-lg hover:shadow-xl disabled:opacity-60"
                  >
                    {isSubmitting ? "Saving..." : "Create client"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
