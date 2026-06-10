"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  CubeIcon,
  GlobeAltIcon,
  PuzzlePieceIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import ProductsBrowser from "@/components/products/ProductsBrowser";
import PlanningSection from "@/components/products/PlanningSection";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal, useConfirm } from "@/components/ui/dialog";
import { Tabs, type TabDef } from "@/components/ui/tabs";
import { PageLoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/components/ui/toast";
import { ClientHeader } from "./ClientHeader";
import { OverviewTab } from "./OverviewTab";
import { IntegrationsTab } from "./IntegrationsTab";
import { CountriesTab } from "./CountriesTab";
import type {
  Alert,
  ClientDetail,
  CountryConfig,
  SqualoIntegration,
} from "./types";

const TAB_KEYS = ["overview", "products", "planning", "integrations", "countries"];

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const clientId = params?.id ?? null;

  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();

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

  const [tab, setTab] = useState("overview");

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

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("tab");
    if (param && TAB_KEYS.includes(param)) setTab(param);
  }, []);

  const handleTabChange = (key: string) => {
    setTab(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
  };

  const mailingLists = useMemo(() => {
    const lists =
      integration?.metadata && (integration.metadata as { lists?: unknown }).lists;
    return Array.isArray(lists)
      ? (lists as Array<{ id: string; name: string }>)
      : [];
  }, [integration]);

  const handleSetActive = async () => {
    if (!clientId) return;
    setSavingActive(true);
    try {
      await request(`/api/clients/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      setActiveClientId(clientId);
      toast.success("Active client set", `${client?.name ?? "Client"} is now active.`);
    } catch (err) {
      console.error(err);
      toast.error(
        "Couldn't set active client",
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setSavingActive(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!clientId || !client) return;
    const confirmed = await confirm({
      title: `Delete ${client.name}?`,
      description:
        "This archives their data and removes access from your workspace.",
      confirmLabel: "Delete client",
      confirmVariant: "danger",
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      await request(`/api/clients/${clientId}`, { method: "DELETE" });
      router.push("/clients");
    } catch (err) {
      console.error(err);
      toast.error(
        "Couldn't delete client",
        err instanceof Error ? err.message : undefined
      );
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
      toast.success("SqualoMail connected");
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
      toast.success("Integration disconnected");
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
    const styles =
      alert.type === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-rose-200 bg-rose-50 text-rose-700";
    return (
      <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
        {alert.message}
      </div>
    );
  };

  if (!clientId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-muted">
        Invalid client id.
      </div>
    );
  }

  if (loading) {
    return <PageLoadingSpinner text="Loading client..." />;
  }

  if (error || !client) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-4 text-center">
        <p className="font-medium text-rose-600">
          {error || "Client unavailable"}
        </p>
        <Button
          variant="secondary"
          onClick={() => router.push("/clients")}
          leftIcon={<ArrowLeftIcon className="h-4 w-4" />}
        >
          Back to clients
        </Button>
      </div>
    );
  }

  const connectedIntegrations = integration ? 1 : 0;
  const activeCountriesCount = countries.filter((c) => c.isActive).length;

  const tabs: TabDef[] = [
    {
      key: "overview",
      label: "Overview",
      icon: <Squares2X2Icon className="h-4 w-4" />,
      content: (
        <OverviewTab
          client={client}
          countries={countries}
          integration={integration}
        />
      ),
    },
    {
      key: "products",
      label: "Products",
      icon: <CubeIcon className="h-4 w-4" />,
      content: <ProductsBrowser clientId={client.id} />,
    },
    {
      key: "planning",
      label: "Planning",
      icon: <CalendarDaysIcon className="h-4 w-4" />,
      content: <PlanningSection clientId={client.id} />,
    },
    {
      key: "integrations",
      label: "Integrations",
      icon: <PuzzlePieceIcon className="h-4 w-4" />,
      badge: connectedIntegrations || undefined,
      content: (
        <IntegrationsTab
          clientId={client.id}
          integration={integration}
          countries={countries}
          integrationAlert={integrationAlert}
          renderAlert={renderAlert}
          onConnect={() => {
            setIntegrationAlert(null);
            setIntegrationModalOpen(true);
          }}
          onDisconnect={handleDisconnectIntegration}
          onRefresh={refreshMailingLists}
          onUpdateCountry={updateCountry}
        />
      ),
    },
    {
      key: "countries",
      label: "Countries",
      icon: <GlobeAltIcon className="h-4 w-4" />,
      badge: activeCountriesCount || undefined,
      content: (
        <CountriesTab
          countries={countries}
          mailingLists={mailingLists}
          countryAlert={countryAlert}
          renderAlert={renderAlert}
          onUpdateCountry={updateCountry}
        />
      ),
    },
  ];

  return (
    <div className="app-canvas min-h-screen">
      <ClientHeader
        client={client}
        isActive={activeClientId === client.id}
        savingActive={savingActive}
        deleting={deleting}
        onSetActive={handleSetActive}
        onDelete={handleDeleteClient}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <Tabs tabs={tabs} value={tab} onChange={handleTabChange} />
      </div>

      <Modal
        open={integrationModalOpen}
        onClose={() => setIntegrationModalOpen(false)}
        title="Connect SqualoMail"
        description="Enter your SqualoMail API key to connect this client."
        size="sm"
      >
        <form className="space-y-4" onSubmit={handleConnectIntegration}>
          <Field label="SqualoMail API key" htmlFor="squalo-api-key" required>
            <Input
              id="squalo-api-key"
              type="text"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              placeholder="Enter API key"
              required
              autoFocus
            />
          </Field>

          {integrationAlert?.type === "error" && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {integrationAlert.message}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIntegrationModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Connect</Button>
          </div>
        </form>
      </Modal>

      {confirmDialog}
    </div>
  );
}
