"use client";

import { useEffect, useMemo, useState, Suspense, type ReactElement } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import CustomSelect from "@/components/ui/custom-select";
import {
  ArrowPathIcon,
  SparklesIcon,
  GlobeAltIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";

interface CampaignTargetSummary {
  id: string;
  countryCode: string;
  countryName: string | null;
  mailingListId: string | null;
  externalId: string | null;
}

interface ActiveTargetState {
  campaignId: string;
  targetId: string;
}

interface CampaignSummary {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  countryTargets: CampaignTargetSummary[];
}

interface ClientSummary {
  id: string;
  name: string;
  description?: string | null;
}

type CampaignStatus =
  | "DRAFT"
  | "READY"
  | "SCHEDULED"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "CANCELLED";

interface CampaignPagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

interface NewsletterMetrics {
  sentTotal: number;
  openTotal: number;
  clickTotal: number;
  openRate: number;
  clickRate: number;
}

const STATUS_OPTIONS: Array<{ value: CampaignStatus | "ALL"; label: string }> =
  [
    { value: "ALL", label: "All statuses" },
    { value: "READY", label: "Ready" },
    { value: "SCHEDULED", label: "Scheduled" },
    { value: "SENDING", label: "Sending" },
    { value: "SENT", label: "Sent" },
    { value: "FAILED", label: "Failed" },
    { value: "CANCELLED", label: "Cancelled" },
    { value: "DRAFT", label: "Draft" },
  ];

const STATUS_STYLES: Record<
  CampaignStatus,
  { label: string; className: string; dot: string; icon: ReactElement }
> = {
  DRAFT: {
    label: "Draft",
    className: "bg-gray-100 text-gray-700",
    dot: "bg-gray-400",
    icon: <SparklesIcon className="h-4 w-4" />,
  },
  READY: {
    label: "Ready",
    className: "bg-indigo-100 text-indigo-700",
    dot: "bg-indigo-500",
    icon: <SparklesIcon className="h-4 w-4" />,
  },
  SCHEDULED: {
    label: "Scheduled",
    className: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
    icon: <ClockIcon className="h-4 w-4" />,
  },
  SENDING: {
    label: "Sending",
    className: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
    icon: <ArrowPathIcon className="h-4 w-4" />,
  },
  SENT: {
    label: "Sent",
    className: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
    icon: <CheckCircleIcon className="h-4 w-4" />,
  },
  FAILED: {
    label: "Failed",
    className: "bg-red-100 text-red-700",
    dot: "bg-red-500",
    icon: <XCircleIcon className="h-4 w-4" />,
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-orange-100 text-orange-700",
    dot: "bg-orange-500",
    icon: <XCircleIcon className="h-4 w-4" />,
  },
};

const PAGE_SIZE = 10;

function formatDateTime(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("sl-SI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Ljubljana",
  }).format(date);
}

function formatPercentage(value: number) {
  const percentage = Number.isFinite(value) ? value * 100 : 0;
  return `${percentage.toFixed(1)}%`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("sl-SI").format(value ?? 0);
}

function CampaignsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialClientId = searchParams.get("clientId");
  const initialStatusParam = searchParams.get("status")?.toUpperCase() ?? "ALL";
  const initialStatus = (STATUS_OPTIONS.find(
    (option) => option.value === initialStatusParam
  )?.value ?? "ALL") as CampaignStatus | "ALL";
  const initialPageParam = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const initialPage =
    Number.isFinite(initialPageParam) && initialPageParam > 0
      ? initialPageParam
      : 1;

  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [activeClientId, setActiveClientId] = useState<string | null>(
    initialClientId
  );
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "ALL">(
    initialStatus
  );
  const [page, setPage] = useState(initialPage);
  const [pagination, setPagination] = useState<CampaignPagination>({
    page: initialPage,
    limit: PAGE_SIZE,
    totalCount: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientLoading, setClientLoading] = useState(true);
  const [metrics, setMetrics] = useState<Record<string, NewsletterMetrics>>({});
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [activeTarget, setActiveTarget] = useState<ActiveTargetState | null>(
    null
  );
  const [publishToast, setPublishToast] = useState<string | null>(null);

  const clientOptions = useMemo(
    () =>
      clients.map((client) => ({
        value: client.id,
        label: client.name,
      })),
    [clients]
  );

  const statusOptions = useMemo(() => STATUS_OPTIONS, []);

  const loadContext = async () => {
    setClientLoading(true);
    try {
      const [clientsResponse, activeResponse] = await Promise.all([
        fetch("/api/clients"),
        fetch("/api/clients/active"),
      ]);

      const clientsPayload = await clientsResponse.json().catch(() => ({}));
      const activePayload = await activeResponse.json().catch(() => ({}));

      const fetchedClients: ClientSummary[] = Array.isArray(
        clientsPayload?.clients
      )
        ? clientsPayload.clients.map((client: any) => ({
            id: client.id,
            name: client.name,
            description: client.description ?? null,
          }))
        : [];
      setClients(fetchedClients);

      if (!initialClientId) {
        setActiveClientId(activePayload?.clientId ?? null);
      }
    } catch (err) {
      console.error("Failed to load clients", err);
      setError("Unable to load clients. Please try again.");
    } finally {
      setClientLoading(false);
    }
  };

  const fetchMetrics = async (
    clientId: string,
    campaignList: CampaignSummary[]
  ) => {
    const ids = new Set<string>();
    campaignList.forEach((campaign) => {
      campaign.countryTargets.forEach((target) => {
        if (target.externalId) {
          ids.add(target.externalId);
        }
      });
    });

    if (ids.size === 0) {
      setMetrics({});
      return;
    }

    setMetricsLoading(true);
    try {
      const response = await fetch("/api/campaigns/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, newsletterIds: Array.from(ids) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load metrics");
      }
      setMetrics((payload?.metrics as Record<string, NewsletterMetrics>) ?? {});
    } catch (err) {
      console.error("Failed to load SqualoMail metrics", err);
      setMetrics({});
    } finally {
      setMetricsLoading(false);
    }
  };

  const toggleTargetMetrics = (campaignId: string, targetId: string) => {
    setActiveTarget((prev) => {
      if (!prev) {
        return { campaignId, targetId };
      }
      if (prev.campaignId === campaignId && prev.targetId === targetId) {
        return null;
      }
      return { campaignId, targetId };
    });
  };

  const loadCampaigns = async (
    clientId: string,
    nextPage: number,
    { silent = false } = {}
  ) => {
    if (!clientId) {
      setCampaigns([]);
      setPagination({
        page: nextPage,
        limit: PAGE_SIZE,
        totalCount: 0,
        totalPages: 1,
      });
      return;
    }

    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const params = new URLSearchParams({
        clientId,
        page: String(nextPage),
        limit: String(PAGE_SIZE),
      });
      if (statusFilter && statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }

      const response = await fetch(`/api/campaigns?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load campaigns");
      }

      const campaignsData: CampaignSummary[] = Array.isArray(payload?.campaigns)
        ? payload.campaigns
        : [];
      setCampaigns(campaignsData);
      setPagination(
        payload?.pagination ?? {
          page: nextPage,
          limit: PAGE_SIZE,
          totalCount: campaignsData.length,
          totalPages: 1,
        }
      );
      await fetchMetrics(clientId, campaignsData);
    } catch (err) {
      console.error("Failed to load campaigns", err);
      setError(
        err instanceof Error ? err.message : "Unable to load campaigns."
      );
      setCampaigns([]);
      setPagination({
        page: nextPage,
        limit: PAGE_SIZE,
        totalCount: 0,
        totalPages: 1,
      });
      setMetrics({});
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const message = window.sessionStorage.getItem("templaito_publish_toast");
    if (message) {
      setPublishToast(message);
      window.sessionStorage.removeItem("templaito_publish_toast");
    }
  }, []);

  useEffect(() => {
    if (!publishToast) {
      return;
    }
    const timer = window.setTimeout(() => setPublishToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [publishToast]);

  useEffect(() => {
    const queryClientId = searchParams.get("clientId");
    const queryStatus = searchParams.get("status")?.toUpperCase() ?? null;
    const queryPageParam = Number.parseInt(searchParams.get("page") ?? "", 10);
    const queryPage =
      Number.isFinite(queryPageParam) && queryPageParam > 0
        ? queryPageParam
        : 1;

    if (queryClientId && queryClientId !== activeClientId) {
      setActiveClientId(queryClientId);
    }

    if (queryStatus) {
      const resolved =
        STATUS_OPTIONS.find((option) => option.value === queryStatus)?.value ??
        "ALL";
      if (resolved !== statusFilter) {
        setStatusFilter(resolved as CampaignStatus | "ALL");
      }
    }

    if (queryPage !== page) {
      setPage(queryPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!activeClientId) {
      setCampaigns([]);
      setPagination({
        page: 1,
        limit: PAGE_SIZE,
        totalCount: 0,
        totalPages: 1,
      });
      setMetrics({});
      setLoading(false);
      return;
    }

    setLoading(true);
    loadCampaigns(activeClientId, page).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClientId, statusFilter, page]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeClientId) {
      params.set("clientId", activeClientId);
    }
    if (statusFilter && statusFilter !== "ALL") {
      params.set("status", statusFilter);
    }
    if (page > 1) {
      params.set("page", String(page));
    }

    const queryString = params.toString();
    const nextUrl = `/campaigns${queryString ? `?${queryString}` : ""}`;

    if (typeof window === "undefined") {
      router.replace(nextUrl, { scroll: false });
      return;
    }

    const current = window.location.pathname + window.location.search;
    if (current !== nextUrl) {
      router.replace(nextUrl, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClientId, statusFilter, page]);

  const handleClientChange = async (clientId: string) => {
    if (!clientId) {
      setActiveClientId(null);
      setCampaigns([]);
      setMetrics({});
      return;
    }

    setActiveClientId(clientId);
    setPage(1);
    try {
      await fetch("/api/clients/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
    } catch (err) {
      console.error("Failed to set active client", err);
    }
  };

  const handleStatusChange = (value: string) => {
    const resolved = (STATUS_OPTIONS.find((option) => option.value === value)
      ?.value ?? "ALL") as CampaignStatus | "ALL";
    setStatusFilter(resolved);
    setPage(1);
  };

  const refreshManually = () => {
    if (!activeClientId) {
      return;
    }
    setRefreshing(true);
    loadCampaigns(activeClientId, page).finally(() => setRefreshing(false));
  };

  const goToPage = (nextPage: number) => {
    if (nextPage < 1 || nextPage > pagination.totalPages || nextPage === page) {
      return;
    }
    setPage(nextPage);
  };

  const currentStatusStyles = (status: CampaignStatus) =>
    STATUS_STYLES[status] ?? STATUS_STYLES.DRAFT;

  return (
    <>
      {publishToast && (
        <div className="fixed top-4 right-4 z-[2000] max-w-sm rounded-2xl border border-indigo-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="mt-1 h-2 w-2 rounded-full bg-indigo-500" />
            <div className="text-sm text-indigo-700">{publishToast}</div>
          </div>
        </div>
      )}
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <div className="mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                SqualoMail Campaigns
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                Once a campaign appears here it already lives in SqualoMail.
                Monitor localisation health, delivery status, and engagement by
                country without leaving Templaito.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={refreshManually}
                className="inline-flex items-center cursor-pointer gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!activeClientId || loading}
              >
                <ArrowPathIcon
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
              <Link
                href="/app"
                className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-xl"
              >
                <SparklesIcon className="h-4 w-4" />
                Create campaign
              </Link>
            </div>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    Client
                  </label>
                  <CustomSelect
                    options={clientOptions}
                    value={activeClientId ?? ""}
                    onChange={handleClientChange}
                    placeholder={
                      clientLoading ? "Loading clients..." : "Select a client"
                    }
                    disabled={clientLoading}
                    gradientFrom="slate-50"
                    gradientTo="slate-100"
                    borderColor="slate-200"
                    textColor="slate-700"
                    hoverFrom="slate-100"
                    hoverTo="slate-200"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    Status
                  </label>
                  <CustomSelect
                    options={statusOptions}
                    value={statusFilter}
                    onChange={handleStatusChange}
                    placeholder="All statuses"
                    gradientFrom="indigo-50"
                    gradientTo="purple-50"
                    borderColor="indigo-200"
                    textColor="indigo-700"
                    hoverFrom="indigo-100"
                    hoverTo="purple-100"
                    disabled={loading}
                  />
                </div>
              </div>
              {activeClientId ? (
                <p className="mt-4 text-sm text-slate-500">
                  Campaigns update when you refresh. Preview localisation
                  quality, scheduled send times, and newsletter IDs per country.
                </p>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  Select a client to review their SqualoMail campaigns.
                </p>
              )}
            </div>

            <div className="rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 p-6 text-white shadow-xl">
              <h2 className="text-lg font-semibold">How it works</h2>
              <ul className="mt-4 space-y-3 text-sm text-indigo-50">
                <li className="flex items-start gap-3">
                  <SparklesIcon className="h-5 w-5 flex-shrink-0" />
                  Generate a template in the App and click &quot;Publish to
                  SqualoMail&quot;.
                </li>
                <li className="flex items-start gap-3">
                  <GlobeAltIcon className="h-5 w-5 flex-shrink-0" />
                  We translate, localise links, and create a newsletter for
                  every configured country.
                </li>
                <li className="flex items-start gap-3">
                  <ChartBarIcon className="h-5 w-5 flex-shrink-0" />
                  Track opens and clicks by country as soon as numbers start
                  rolling in.
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 space-y-6">
            {error && (
              <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">
                {error}
              </div>
            )}

            {!activeClientId && !loading ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
                Select a client to view their SqualoMail campaigns.
              </div>
            ) : null}

            {activeClientId && loading ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">
                Loading campaigns...
              </div>
            ) : null}

            {activeClientId && !loading && campaigns.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">
                No campaigns yet. Publish one from the app to see it here
                instantly.
              </div>
            ) : null}

            {activeClientId && !loading && campaigns.length > 0 ? (
              <div className="space-y-6">
                {campaigns.map((campaign) => {
                  const statusConfig = currentStatusStyles(campaign.status);
                  return (
                    <div
                      key={campaign.id}
                      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-xl font-semibold text-slate-900">
                              {campaign.name}
                            </h3>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${statusConfig.className}`}
                            >
                              <span
                                className={`h-2 w-2 rounded-full ${statusConfig.dot}`}
                              />
                              {statusConfig.label}
                            </span>
                          </div>
                          {campaign.description && (
                            <p className="text-sm text-slate-500">
                              {campaign.description}
                            </p>
                          )}
                          <dl className="grid gap-4 text-xs text-slate-500 sm:grid-cols-3">
                            <div>
                              <dt className="font-medium uppercase tracking-wide text-slate-400">
                                Created
                              </dt>
                              <dd className="text-sm text-slate-700">
                                {formatDateTime(campaign.createdAt)}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-medium uppercase tracking-wide text-slate-400">
                                Scheduled
                              </dt>
                              <dd className="text-sm text-slate-700">
                                {formatDateTime(campaign.scheduledAt)}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-medium uppercase tracking-wide text-slate-400">
                                Sent
                              </dt>
                              <dd className="text-sm text-slate-700">
                                {formatDateTime(campaign.sentAt)}
                              </dd>
                            </div>
                          </dl>
                        </div>
                        <Link
                          href={`/clients/${activeClientId}`}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                        >
                          Manage client
                        </Link>
                      </div>

                      <div className="mt-6 border-t border-slate-100 pt-6">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="text-sm font-semibold text-slate-700">
                            Country deliveries
                          </h4>
                          {metricsLoading && (
                            <span className="text-xs text-slate-400">
                              Refreshing metrics...
                            </span>
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {campaign.countryTargets.map((target) => {
                            const isActive =
                              activeTarget?.campaignId === campaign.id &&
                              activeTarget.targetId === target.id;
                            return (
                              <button
                                key={target.id}
                                type="button"
                                onClick={() =>
                                  toggleTargetMetrics(campaign.id, target.id)
                                }
                                className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                                  isActive
                                    ? "border-indigo-400 bg-indigo-50 text-indigo-700 shadow"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
                                }`}
                              >
                                <span>{target.countryCode}</span>
                                <span className="text-[10px] font-normal text-slate-400">
                                  {target.countryName ?? "Unknown"}
                                </span>
                                {target.externalId ? (
                                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                    #{target.externalId}
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                                    Draft
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {campaign.countryTargets.map((target) => {
                          if (
                            !(
                              activeTarget?.campaignId === campaign.id &&
                              activeTarget.targetId === target.id
                            )
                          ) {
                            return null;
                          }
                          const stats = target.externalId
                            ? metrics[target.externalId]
                            : undefined;
                          return (
                            <div
                              key={`metrics-${target.id}`}
                              className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-5 shadow-inner sm:grid-cols-3"
                            >
                              {target.externalId && stats ? (
                                <>
                                  <div className="rounded-xl bg-white/80 p-4">
                                    <p className="text-xs font-medium text-slate-500">
                                      Open rate
                                    </p>
                                    <p className="mt-2 text-lg font-semibold text-emerald-600">
                                      {formatPercentage(stats.openRate)}
                                    </p>
                                    <p className="text-[11px] text-slate-400">
                                      {formatCount(stats.openTotal)} unique
                                      opens
                                    </p>
                                  </div>
                                  <div className="rounded-xl bg-white/80 p-4">
                                    <p className="text-xs font-medium text-slate-500">
                                      Click rate
                                    </p>
                                    <p className="mt-2 text-lg font-semibold text-indigo-600">
                                      {formatPercentage(stats.clickRate)}
                                    </p>
                                    <p className="text-[11px] text-slate-400">
                                      {formatCount(stats.clickTotal)} unique
                                      clicks
                                    </p>
                                  </div>
                                  <div className="rounded-xl bg-white/80 p-4">
                                    <p className="text-xs font-medium text-slate-500">
                                      Total sent
                                    </p>
                                    <p className="mt-2 text-lg font-semibold text-slate-700">
                                      {formatCount(stats.sentTotal)}
                                    </p>
                                  </div>
                                </>
                              ) : target.externalId ? (
                                <div className="rounded-xl bg-white/80 p-4 text-xs text-slate-500">
                                  Metrics will appear once SqualoMail starts
                                  tracking opens and clicks.
                                </div>
                              ) : (
                                <div className="rounded-xl bg-white/80 p-4 text-xs text-slate-500">
                                  Waiting for publication. Configure this
                                  country and publish to SqualoMail to track
                                  performance.
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {activeClientId && pagination.totalPages > 1 && (
              <div className="flex flex-col items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm sm:flex-row">
                <div>
                  Page {pagination.page} of {pagination.totalPages} •{" "}
                  {pagination.totalCount} campaigns
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => goToPage(pagination.page - 1)}
                    className="rounded-full border border-slate-200 px-4 py-2 font-medium text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={pagination.page <= 1 || loading}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => goToPage(pagination.page + 1)}
                    className="rounded-full border border-slate-200 px-4 py-2 font-medium text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={
                      pagination.page >= pagination.totalPages || loading
                    }
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
        <p className="mt-4 text-slate-600">Loading campaigns...</p>
      </div>
    </div>}>
      <CampaignsPageContent />
    </Suspense>
  );
}
