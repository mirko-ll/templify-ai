"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  RssIcon,
} from "@heroicons/react/24/outline";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { SectionHeader } from "@/components/ui/page-header";
import { Skeleton, SkeletonStat } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/dialog";
import {
  defaultSourceForm,
  parseTemplateOverrides,
  type CampaignPlan,
  type ProductSource,
  type SourceFormState,
} from "./product-catalog-types";
import { ProductSourceForm } from "./ProductSourceForm";
import { ProductSourceList } from "./ProductSourceList";
import {
  ProductSourceEditModal,
  type SourceUpdatePayload,
} from "./ProductSourceEditModal";
import { MonthlyPlansSection } from "./MonthlyPlansSection";
import { SalesReportsSection } from "./SalesReportsSection";

interface PlanningSectionProps {
  clientId: string;
}

/**
 * Sync sources + monthly planning. Browsing the resulting catalog lives in the
 * separate Products tab; this tab is about getting products in and scheduling
 * them across the month.
 */
export default function PlanningSection({ clientId }: PlanningSectionProps) {
  const toast = useToast();
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();

  const openPlanner = useCallback(
    (target?: { year: number; month: number }) => {
      const query = target ? `?year=${target.year}&month=${target.month}` : "";
      router.push(`/clients/${clientId}/planner${query}`);
    },
    [clientId, router]
  );

  const [sources, setSources] = useState<ProductSource[]>([]);
  const [plans, setPlans] = useState<CampaignPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceForm, setSourceForm] = useState<SourceFormState>(defaultSourceForm);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [creatingSource, setCreatingSource] = useState(false);
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [removingSourceId, setRemovingSourceId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<ProductSource | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState<"MANUAL" | "ASSISTED" | null>(
    null
  );
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);

  const loadSources = useCallback(async () => {
    const response = await fetch(`/api/clients/${clientId}/product-sources`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(payload?.error || "Failed to load product sources");
    setSources(Array.isArray(payload.sources) ? payload.sources : []);
  }, [clientId]);

  const loadPlans = useCallback(async () => {
    const response = await fetch(`/api/clients/${clientId}/campaign-plans`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(payload?.error || "Failed to load campaign plans");
    setPlans(Array.isArray(payload.plans) ? payload.plans : []);
  }, [clientId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await Promise.all([loadSources(), loadPlans()]);
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Unable to load planning data";
      setLoadError(text);
      toast.error("Couldn't load planning", text);
    } finally {
      setLoading(false);
    }
  }, [loadPlans, loadSources, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const latestRun = useMemo(() => {
    return sources
      .flatMap((source) => source.syncRuns ?? [])
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      )[0];
  }, [sources]);

  const createSource = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingSource(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/product-sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sourceForm.name.trim() || undefined,
          url: sourceForm.url.trim(),
          countryCode: sourceForm.countryCode.trim() || undefined,
          config: {
            campaignUrlTemplate: sourceForm.campaignUrlTemplate.trim(),
            countryCampaignUrlTemplates: parseTemplateOverrides(
              sourceForm.countryCampaignUrlTemplates,
              (key) => key.toUpperCase()
            ),
            domainCampaignUrlTemplates: parseTemplateOverrides(
              sourceForm.domainCampaignUrlTemplates,
              (key) => key.toLowerCase().replace(/^www\./, "")
            ),
            defaultPrice: sourceForm.defaultPrice.trim(),
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Failed to add source");
      setSourceForm(defaultSourceForm);
      toast.success("Product source added");
      await loadSources();
    } catch (error) {
      toast.error(
        "Couldn't add source",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setCreatingSource(false);
    }
  };

  const syncSource = async (sourceId: string) => {
    setSyncingSourceId(sourceId);
    try {
      const response = await fetch(
        `/api/clients/${clientId}/product-sources/${sourceId}/sync`,
        { method: "POST" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Product sync failed");
      toast.success(
        "Sync started",
        payload?.message || "Refresh to follow progress."
      );
      await loadSources();
      window.setTimeout(() => {
        loadSources().catch(() => null);
      }, 2500);
    } catch (error) {
      toast.error(
        "Product sync failed",
        error instanceof Error ? error.message : undefined
      );
      await loadSources().catch(() => null);
    } finally {
      setSyncingSourceId(null);
    }
  };

  const syncAll = async () => {
    setSyncingAll(true);
    try {
      const response = await fetch(
        `/api/clients/${clientId}/product-sources/sync-all`,
        { method: "POST" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Failed to start sync");
      toast.success(
        "Syncing all sources",
        `${payload.sourceCount ?? "All"} sources queued — this runs in the background.`
      );
      await loadSources();
      window.setTimeout(() => {
        loadSources().catch(() => null);
      }, 3000);
    } catch (error) {
      toast.error(
        "Couldn't start sync",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setSyncingAll(false);
    }
  };

  const saveSource = async (sourceId: string, payload: SourceUpdatePayload) => {
    setSavingEdit(true);
    try {
      const response = await fetch(
        `/api/clients/${clientId}/product-sources/${sourceId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Failed to save source");
      toast.success("Source updated");
      setEditingSource(null);
      await loadSources();
    } catch (error) {
      toast.error(
        "Couldn't save source",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const removeSource = async (sourceId: string) => {
    const confirmed = await confirm({
      title: "Remove product source?",
      description: "Existing synced products will stay in the catalog.",
      confirmLabel: "Remove source",
      confirmVariant: "danger",
    });
    if (!confirmed) return;

    setRemovingSourceId(sourceId);
    try {
      const response = await fetch(
        `/api/clients/${clientId}/product-sources/${sourceId}`,
        { method: "DELETE" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload?.error || "Failed to remove source");
      toast.success("Product source removed");
      await loadSources();
    } catch (error) {
      toast.error(
        "Couldn't remove source",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setRemovingSourceId(null);
    }
  };

  const createPlan = async (mode: "MANUAL" | "ASSISTED") => {
    setCreatingPlan(mode);
    try {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const response = await fetch(`/api/clients/${clientId}/campaign-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          month: nextMonth.getMonth() + 1,
          year: nextMonth.getFullYear(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Failed to create plan");
      toast.success(
        mode === "ASSISTED"
          ? "Assisted monthly plan created for review"
          : "Manual monthly plan created"
      );
      await loadPlans();
    } catch (error) {
      toast.error(
        "Couldn't create plan",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setCreatingPlan(null);
    }
  };

  const deletePlan = async (planId: string) => {
    const confirmed = await confirm({
      title: "Delete monthly plan?",
      description:
        "Planned days are removed. Plans with scheduled or generating campaigns can't be deleted — unschedule those days first.",
      confirmLabel: "Delete plan",
      confirmVariant: "danger",
    });
    if (!confirmed) return;

    setDeletingPlanId(planId);
    try {
      const response = await fetch(
        `/api/clients/${clientId}/campaign-plans/${planId}`,
        { method: "DELETE" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload?.error || "Failed to delete plan");
      toast.success("Monthly plan deleted");
      await loadPlans();
    } catch (error) {
      toast.error(
        "Couldn't delete plan",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setDeletingPlanId(null);
    }
  };

  return (
    <Card>
      <div className="space-y-6 p-5 sm:p-6">
        <SectionHeader
          title="Sources & Monthly Planning"
          description="Sync product URLs into Templaito, then plan each month manually or with assisted suggestions."
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={loadAll}
              leftIcon={<ArrowPathIcon className="h-4 w-4" />}
            >
              Refresh
            </Button>
          }
        />

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonStat key={index} />
              ))}
            </div>
            <Skeleton className="h-32 w-full rounded-xl" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          </div>
        ) : loadError ? (
          <EmptyState
            icon={<ArrowPathIcon className="h-6 w-6" />}
            title="Couldn't load planning"
            description={loadError}
            action={
              <Button
                variant="secondary"
                onClick={loadAll}
                leftIcon={<ArrowPathIcon className="h-4 w-4" />}
              >
                Try again
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="Sources"
                value={sources.length}
                accent="brand"
                icon={<RssIcon className="h-4 w-4" />}
              />
              <StatCard
                label="Monthly plans"
                value={plans.length}
                accent="info"
                icon={<CalendarDaysIcon className="h-4 w-4" />}
              />
              <StatCard
                label="Latest sync"
                value={
                  <span className="text-base font-semibold">
                    {latestRun ? latestRun.status : "No runs"}
                  </span>
                }
                hint={
                  latestRun
                    ? new Intl.DateTimeFormat("sl-SI", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(
                        new Date(latestRun.finishedAt || latestRun.startedAt)
                      )
                    : "Add a source to start"
                }
                icon={<ArrowPathIcon className="h-4 w-4" />}
              />
            </div>

            <ProductSourceForm
              form={sourceForm}
              onFormChange={(patch) =>
                setSourceForm((prev) => ({ ...prev, ...patch }))
              }
              showAdvanced={showAdvanced}
              onToggleAdvanced={() => setShowAdvanced((prev) => !prev)}
              creating={creatingSource}
              onSubmit={createSource}
            />

            <ProductSourceList
              sources={sources}
              syncingSourceId={syncingSourceId}
              removingSourceId={removingSourceId}
              syncingAll={syncingAll}
              onSync={syncSource}
              onSyncAll={syncAll}
              onEdit={setEditingSource}
              onRemove={removeSource}
            />

            <div className="border-t border-line pt-6">
              <SalesReportsSection clientId={clientId} />
            </div>

            <div className="border-t border-line pt-6">
              <MonthlyPlansSection
                plans={plans}
                creatingPlan={creatingPlan}
                deletingPlanId={deletingPlanId}
                onCreatePlan={createPlan}
                onDeletePlan={deletePlan}
                onOpenPlanner={openPlanner}
              />
            </div>
          </>
        )}
      </div>

      <ProductSourceEditModal
        open={editingSource !== null}
        source={editingSource}
        saving={savingEdit}
        onClose={() => setEditingSource(null)}
        onSave={saveSource}
      />
      {confirmDialog}
    </Card>
  );
}
