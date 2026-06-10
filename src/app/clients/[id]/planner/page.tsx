"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { PageLoadingSpinner } from "@/components/ui/loading-spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { PlannerDefaultsPanel } from "./PlannerDefaults";
import { MonthCalendar } from "./MonthCalendar";
import { DayEditor } from "./DayEditor";
import {
  DEFAULT_PLANNER_DEFAULTS,
  assignmentId,
  availableCountries,
  groupByDay,
  isLocked,
  localDayKey,
  localTimeKey,
  toSendDateISO,
  type CountryOption,
  type DayAssignment,
  type ItemStatus,
  type MailingList,
  type PlannerDefaults,
  type ProductGroup,
  type PromptOption,
} from "./planner-types";

interface PlanItemResponse {
  sendDate: string | null;
  status: ItemStatus;
  countryCodes: string[] | null;
  templateId: string | null;
  subject: string | null;
  preheader: string | null;
  mailingListOverrides: Record<string, string[]> | null;
  selectedImageUrl: string | null;
  priceOverride: string | null;
  errorMessage: string | null;
  productSnapshot: ProductGroup | null;
}

interface PlanResponse {
  id: string;
  strategy: { defaults?: Partial<PlannerDefaults> } | null;
  items: PlanItemResponse[];
}

/**
 * Flatten plan items into per-product assignments. Each day may hold several
 * products; an item's send time is treated as an override only when it differs
 * from the shared default (so changing the default still cascades to inherited
 * days), and items are keyed by `${day}::${product}` for stable editing.
 */
function buildAssignments(
  items: PlanItemResponse[],
  defaultSendTime: string
): DayAssignment[] {
  const out: DayAssignment[] = [];
  for (const item of items) {
    const snapshot = item.productSnapshot;
    if (!item.sendDate || !snapshot || !Array.isArray(snapshot.listings)) continue;
    const date = new Date(item.sendDate);
    const dayKey = localDayKey(date);
    const timeKey = localTimeKey(date);
    out.push({
      id: assignmentId(dayKey, snapshot.key),
      dayKey,
      group: snapshot,
      countryCodes: Array.isArray(item.countryCodes) ? item.countryCodes : null,
      templateId: item.templateId,
      subject: item.subject,
      preheader: item.preheader,
      sendTime: timeKey === defaultSendTime ? null : timeKey,
      mailingListOverrides: item.mailingListOverrides ?? null,
      selectedImageUrl: item.selectedImageUrl,
      priceOverride: item.priceOverride,
      status: item.status,
      errorMessage: item.errorMessage,
    });
  }
  return out;
}

export default function PlannerPage() {
  const params = useParams<{ id: string }>();
  const clientId = params?.id ?? "";
  const toast = useToast();

  const todayKey = useMemo(() => localDayKey(new Date()), []);
  const now = useMemo(() => new Date(), []);
  const initialDate = useMemo(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const y = Number(sp.get("year"));
      const m = Number(sp.get("month"));
      if (y >= 2020 && m >= 1 && m <= 12) return { year: y, month: m };
    }
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }, [now]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [hasProducts, setHasProducts] = useState(false);
  const [prompts, setPrompts] = useState<PromptOption[]>([]);
  const [eligible, setEligible] = useState<Set<string>>(new Set());
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>([]);
  const [mailingLists, setMailingLists] = useState<MailingList[]>([]);
  const [integrationConnected, setIntegrationConnected] = useState(false);

  const [planId, setPlanId] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<PlannerDefaults>(
    DEFAULT_PLANNER_DEFAULTS
  );
  const [assignments, setAssignments] = useState<DayAssignment[]>([]);

  const assignmentsByDay = useMemo(
    () => groupByDay(assignments, defaults.sendTime),
    [assignments, defaults.sendTime]
  );

  const [viewYear, setViewYear] = useState(initialDate.year);
  const [viewMonth, setViewMonth] = useState(initialDate.month);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const counts = useMemo(() => {
    const acc = { planned: 0, scheduled: 0, failed: 0, busy: 0 };
    for (const assignment of assignments) {
      if (assignment.status === "SCHEDULED") acc.scheduled++;
      else if (assignment.status === "FAILED") acc.failed++;
      else if (assignment.status === "QUEUED" || assignment.status === "GENERATING")
        acc.busy++;
      else acc.planned++;
    }
    return acc;
  }, [assignments]);

  const busy = counts.busy > 0;

  /** Persist current state (defaults + items) to the plan. */
  const persist = useCallback(
    async (
      currentPlanId: string,
      list: DayAssignment[],
      currentDefaults: PlannerDefaults
    ) => {
      setSaving(true);
      try {
        // Locked items (already in the generation pipeline) are preserved server
        // side — only send the editable ones, each at its own send time.
        const items = list
          .filter((assignment) => !isLocked(assignment.status))
          .map((assignment) => {
            const available = availableCountries(assignment.group, eligible);
            const countryCodes =
              assignment.countryCodes && assignment.countryCodes.length > 0
                ? assignment.countryCodes.filter((code) => available.includes(code))
                : available;
            return {
              sendDate: toSendDateISO(
                assignment.dayKey,
                assignment.sendTime ?? currentDefaults.sendTime
              ),
              groupKey: assignment.group.key,
              productId: assignment.group.productIds[0] ?? null,
              productSnapshot: assignment.group,
              countryCodes,
              templateId: assignment.templateId,
              subject: assignment.subject,
              preheader: assignment.preheader,
              mailingListOverrides: assignment.mailingListOverrides,
              selectedImageUrl: assignment.selectedImageUrl,
              priceOverride: assignment.priceOverride,
            };
          });
        const response = await fetch(
          `/api/clients/${clientId}/campaign-plans/${currentPlanId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ defaults: currentDefaults, items }),
          }
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || "Failed to save plan");
        }
      } catch (err) {
        toast.error(
          "Couldn't save the plan",
          err instanceof Error ? err.message : undefined
        );
      } finally {
        setSaving(false);
      }
    },
    [clientId, eligible, toast]
  );

  /** Load (or create) the MANUAL draft plan for a month and hydrate state. */
  const loadPlan = useCallback(
    async (year: number, month: number) => {
      const response = await fetch(`/api/clients/${clientId}/campaign-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "MANUAL", year, month }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load monthly plan");
      }
      const plan = payload.plan as PlanResponse;
      const planDefaults = {
        ...DEFAULT_PLANNER_DEFAULTS,
        ...(plan.strategy?.defaults ?? {}),
      };
      setPlanId(plan.id);
      setDefaults(planDefaults);
      setAssignments(buildAssignments(plan.items, planDefaults.sendTime));
    },
    [clientId]
  );

  /** Refetch just the plan items (for generation progress polling). */
  const refreshPlanItems = useCallback(async () => {
    if (!planId) return;
    const response = await fetch(
      `/api/clients/${clientId}/campaign-plans/${planId}`
    );
    if (!response.ok) return;
    const payload = await response.json().catch(() => ({}));
    const plan = payload.plan as PlanResponse | undefined;
    if (plan) setAssignments(buildAssignments(plan.items, defaults.sendTime));
  }, [clientId, planId, defaults.sendTime]);

  // Initial client-level data + first month.
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [clientRes, countriesRes, integrationRes, groupsRes, promptsRes] =
          await Promise.all([
            fetch(`/api/clients/${clientId}`),
            fetch(`/api/clients/${clientId}/countries`),
            fetch(`/api/clients/${clientId}/integration/squalomail`),
            // Just a count — the day editor searches products on demand.
            fetch(`/api/clients/${clientId}/products/grouped?page=1&pageSize=1`),
            fetch(`/api/prompts/active`),
          ]);
        if (cancelled) return;

        if (clientRes.ok) {
          const data = await clientRes.json();
          setClientName(data?.client?.name ?? "");
        }
        if (countriesRes.ok) {
          const data = await countriesRes.json();
          const eligibleConfigs = (
            Array.isArray(data?.countries) ? data.countries : []
          ).filter((c: any) => c.isActive && c.mailingListId);
          setEligible(
            new Set<string>(
              eligibleConfigs.map((c: any) => String(c.countryCode).toUpperCase())
            )
          );
          setCountryOptions(
            eligibleConfigs.map((c: any) => ({
              code: String(c.countryCode).toUpperCase(),
              name: c.country?.name ?? c.countryCode,
              defaultListId: c.mailingListId ?? null,
              defaultListName: c.mailingListName ?? null,
            }))
          );
        }
        if (integrationRes.ok) {
          const data = await integrationRes.json();
          setIntegrationConnected(data?.integration?.status === "CONNECTED");
          const lists = data?.integration?.metadata?.lists;
          setMailingLists(
            Array.isArray(lists)
              ? lists.filter((l: any) => l?.id).map((l: any) => ({ id: l.id, name: l.name ?? "" }))
              : []
          );
        }
        if (groupsRes.ok) {
          const data = await groupsRes.json();
          setHasProducts((data?.total ?? 0) > 0);
        }
        if (promptsRes.ok) {
          const data = await promptsRes.json();
          setPrompts(
            (Array.isArray(data?.prompts) ? data.prompts : []).filter(
              (p: PromptOption) => p.templateType === "SINGLE_PRODUCT"
            )
          );
        }

        await loadPlan(initialDate.year, initialDate.month);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Unable to load the planner"
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // Poll while any item is generating.
  useEffect(() => {
    if (!busy) {
      setGenerating(false);
      return;
    }
    const interval = setInterval(refreshPlanItems, 4000);
    return () => clearInterval(interval);
  }, [busy, refreshPlanItems]);

  const changeMonth = async (delta: number) => {
    const base = new Date(viewYear, viewMonth - 1 + delta, 1);
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth() + 1);
    try {
      await loadPlan(base.getFullYear(), base.getMonth() + 1);
    } catch (err) {
      toast.error(
        "Couldn't load that month",
        err instanceof Error ? err.message : undefined
      );
    }
  };

  /** Replace every assignment for a day with the editor's working list, then save. */
  const handleChangeDay = (dayKey: string, dayItems: DayAssignment[]) => {
    const next = [
      ...assignments.filter((assignment) => assignment.dayKey !== dayKey),
      ...dayItems,
    ];
    setAssignments(next);
    if (planId) void persist(planId, next, defaults);
  };

  const handleDefaultsChange = (
    patch: Partial<PlannerDefaults>,
    immediate = false
  ) => {
    const next = { ...defaults, ...patch };
    setDefaults(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Discrete picks (mailing lists, reset) save right away so they stick even
    // if the user leaves immediately; text fields debounce to avoid churn.
    if (immediate) {
      if (planId) void persist(planId, assignments, next);
      return;
    }
    saveTimer.current = setTimeout(() => {
      if (planId) void persist(planId, assignments, next);
    }, 700);
  };

  const handleGenerate = async (onlyFailed = false) => {
    if (!planId) return;
    setGenerating(true);
    try {
      // Make sure the latest edits are saved before generating.
      await persist(planId, assignments, defaults);
      const response = await fetch(
        `/api/clients/${clientId}/campaign-plans/${planId}/generate${
          onlyFailed ? "?only=failed" : ""
        }`,
        { method: "POST" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to start generation");
      }
      toast.success(
        "Generating campaigns",
        `${payload.queued} day${payload.queued === 1 ? "" : "s"} queued. You can leave this page.`
      );
      await refreshPlanItems();
    } catch (err) {
      setGenerating(false);
      toast.error(
        "Couldn't start generation",
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const editingDayItems = editingDay
    ? assignmentsByDay.get(editingDay) ?? []
    : [];
  const hasGeneratable = counts.planned > 0 || counts.failed > 0;

  if (loading) {
    return <PageLoadingSpinner text="Loading planner…" />;
  }

  return (
    <div className="app-canvas min-h-screen">
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <Link
          href={`/clients/${clientId}?tab=planning`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-brand-700"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to {clientName || "client"}
        </Link>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-brand-600">
              {clientName || "Client"}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Monthly planner
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Schedule one or more products per day — each with its own send
              time — then generate and schedule every campaign at once.
              Generation runs on the server, so you can close this page once it
              starts.
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2.5">
            <span className="text-xs text-muted">
              {saving ? "Saving…" : "All changes saved"}
            </span>
            {counts.failed > 0 && !busy && (
              <Button
                variant="secondary"
                onClick={() => handleGenerate(true)}
                leftIcon={<ExclamationTriangleIcon className="h-4 w-4" />}
              >
                Retry failed ({counts.failed})
              </Button>
            )}
            <Button
              onClick={() => handleGenerate(false)}
              disabled={
                !integrationConnected || !hasGeneratable || busy || generating
              }
              isLoading={generating || busy}
              leftIcon={<SparklesIcon className="h-4 w-4" />}
            >
              Generate &amp; schedule
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {!integrationConnected && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Connect SqualoMail for this client before generating campaigns.
          </div>
        )}

        {eligible.size === 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            No active countries with a mailing list. Configure them in the
            client&apos;s Countries tab first.
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Planned"
            value={counts.planned}
            accent="brand"
            icon={<CalendarDaysIcon className="h-4 w-4" />}
          />
          <StatCard
            label="Scheduled"
            value={counts.scheduled}
            accent="success"
            icon={<CheckCircleIcon className="h-4 w-4" />}
          />
          <StatCard
            label="In progress"
            value={counts.busy}
            accent="info"
            icon={<SparklesIcon className="h-4 w-4" />}
          />
          <StatCard
            label="Failed"
            value={counts.failed}
            accent="warning"
            icon={<ExclamationTriangleIcon className="h-4 w-4" />}
          />
        </div>

        <div className="mt-6">
          <PlannerDefaultsPanel
            defaults={defaults}
            prompts={prompts}
            countries={countryOptions}
            mailingLists={mailingLists}
            disabled={busy}
            onChange={handleDefaultsChange}
          />
        </div>

        <div className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-soft">
          {!hasProducts ? (
            <EmptyState
              compact
              icon={<CalendarDaysIcon className="h-6 w-6" />}
              title="No products to plan with"
              description="Sync a product source first — synced products appear here for planning."
            />
          ) : (
            <MonthCalendar
              year={viewYear}
              month={viewMonth}
              todayKey={todayKey}
              assignmentsByDay={assignmentsByDay}
              defaultSendTime={defaults.sendTime}
              disabledEditing={busy}
              onSelectDay={(dayKey) => setEditingDay(dayKey)}
              onPrev={() => changeMonth(-1)}
              onNext={() => changeMonth(1)}
            />
          )}
        </div>
      </div>

      <DayEditor
        open={editingDay !== null}
        dayKey={editingDay}
        prompts={prompts}
        eligible={eligible}
        countryOptions={countryOptions}
        mailingLists={mailingLists}
        defaults={defaults}
        items={editingDayItems}
        onClose={() => setEditingDay(null)}
        onChangeDay={handleChangeDay}
      />
    </div>
  );
}
