"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

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
  const toast = useToast();
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
      const name = clients.find((c) => c.id === clientId)?.name;
      toast.success("Active client set", name ? `${name} is now active.` : undefined);
    } catch (err) {
      console.error(err);
      toast.error(
        "Couldn't set active client",
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setActivatingId(null);
    }
  };

  const handleClearActiveClient = async () => {
    setActivatingId("clearing");
    setError(null);

    try {
      const response = await fetch("/api/clients/active", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to clear active client");
      }

      setActiveClientId(null);
      toast.success("Active client cleared");
    } catch (err) {
      console.error(err);
      toast.error(
        "Couldn't clear active client",
        err instanceof Error ? err.message : undefined
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

      const createdName = formData.name.trim();
      resetForm();
      await loadClients(search);
      await loadActiveClient();
      toast.success("Client created", `${createdName} was added to your workspace.`);
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

  const activeClientName = clients.find((c) => c.id === activeClientId)?.name;

  return (
    <div className="app-canvas min-h-screen">
      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Workspace"
          title="Clients"
          description="Manage your clients, track integration status, and configure the countries you target for campaign generation."
          actions={
            <Button leftIcon={<PlusIcon className="h-5 w-5" />} onClick={() => setIsCreating(true)}>
              New client
            </Button>
          }
        />

        <div className="space-y-4">
          <form
            onSubmit={handleSearch}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <div className="relative w-full sm:max-w-md">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search clients by name"
                className="pl-10"
                aria-label="Search clients by name"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              leftIcon={<ArrowPathIcon className="h-4 w-4" />}
            >
              Refresh
            </Button>
          </form>

          {activeClientId && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50/70 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white shadow-glow">
                  <CheckCircleIcon className="h-4 w-4" />
                </span>
                <span className="text-sm text-body">
                  Active client:{" "}
                  <span className="font-semibold text-ink">
                    {activeClientName || "Unknown"}
                  </span>
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleClearActiveClient}
                isLoading={activatingId === "clearing"}
              >
                Clear
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={<ArrowPathIcon className="h-6 w-6" />}
            title="Couldn't load clients"
            description={error}
            action={
              <Button
                variant="secondary"
                onClick={() => loadClients(search)}
                leftIcon={<ArrowPathIcon className="h-4 w-4" />}
              >
                Try again
              </Button>
            }
          />
        ) : activeClients.length === 0 ? (
          <EmptyState
            icon={<UsersIcon className="h-6 w-6" />}
            title="No clients yet"
            description="Add your first client to start configuring integrations and country preferences."
            action={
              <Button
                leftIcon={<PlusIcon className="h-5 w-5" />}
                onClick={() => setIsCreating(true)}
              >
                Create client
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {activeClients.map((client) => {
              const integration = client.integrations[0];
              const activeCountryCount = client.countryConfigs.filter(
                (config) => config.isActive
              ).length;
              const isActive = client.id === activeClientId;

              return (
                <Card
                  key={client.id}
                  interactive
                  className={cn(
                    "relative overflow-hidden",
                    isActive && "border-brand-300 ring-1 ring-brand-200"
                  )}
                >
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-6 h-9 w-1 rounded-r-full bg-brand-600"
                    />
                  )}
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-semibold tracking-tight text-ink">
                          {client.name}
                        </h3>
                        {client.industry && (
                          <p className="mt-0.5 text-sm font-medium text-brand-600">
                            {client.industry}
                          </p>
                        )}
                      </div>
                      {isActive && (
                        <Badge variant="brand" dot>
                          Active
                        </Badge>
                      )}
                    </div>

                    {client.description && (
                      <p className="mt-3 line-clamp-2 text-sm text-muted">
                        {client.description}
                      </p>
                    )}

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-line bg-surface-muted/60 px-3 py-2.5">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                          Countries
                        </p>
                        <p className="mt-1 text-sm font-semibold text-ink">
                          {activeCountryCount}
                          <span className="font-normal text-muted">
                            {" "}
                            / {client.countryConfigs.length}
                          </span>
                        </p>
                      </div>
                      <div className="rounded-lg border border-line bg-surface-muted/60 px-3 py-2.5">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                          Integration
                        </p>
                        <div className="mt-1">
                          {integration ? (
                            <StatusBadge status={integration.status} />
                          ) : (
                            <Badge variant="neutral">Not connected</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-line px-5 py-3 sm:px-6">
                    <Link
                      href={`/clients/${client.id}`}
                      className={buttonVariants({
                        variant: "secondary",
                        size: "sm",
                      })}
                    >
                      View
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    </Link>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700">
                        <CheckCircleIcon className="h-4 w-4" />
                        Active client
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetActiveClient(client.id)}
                        isLoading={activatingId === client.id}
                      >
                        Set active
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={isCreating}
        onClose={resetForm}
        title="Create client"
        description="Add a client to start configuring integrations and campaigns."
      >
        <form className="space-y-4" onSubmit={handleCreateClient}>
          <Field label="Client name" htmlFor="client-name" required>
            <Input
              id="client-name"
              type="text"
              value={formData.name}
              autoFocus
              onChange={(event) => handleInputChange("name", event.target.value)}
              placeholder="Acme Corp"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Industry" htmlFor="client-industry">
              <Input
                id="client-industry"
                type="text"
                value={formData.industry}
                onChange={(event) =>
                  handleInputChange("industry", event.target.value)
                }
                placeholder="E-commerce"
              />
            </Field>
            <Field label="Website" htmlFor="client-website">
              <Input
                id="client-website"
                type="url"
                value={formData.website}
                onChange={(event) =>
                  handleInputChange("website", event.target.value)
                }
                placeholder="https://example.com"
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="client-description">
            <Textarea
              id="client-description"
              value={formData.description}
              onChange={(event) =>
                handleInputChange("description", event.target.value)
              }
              rows={3}
              placeholder="Tell us more about this client"
            />
          </Field>

          <Field label="Notes" htmlFor="client-notes">
            <Textarea
              id="client-notes"
              value={formData.notes}
              onChange={(event) =>
                handleInputChange("notes", event.target.value)
              }
              rows={3}
              placeholder="Internal notes"
            />
          </Field>

          {formError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button type="button" variant="secondary" onClick={resetForm}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Create client
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
