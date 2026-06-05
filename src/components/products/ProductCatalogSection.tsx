"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  RssIcon,
} from "@heroicons/react/24/outline";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { SectionHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonStat } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/dialog";
import {
  defaultSourceForm,
  parseTemplateOverrides,
  type CampaignPlan,
  type Product,
  type ProductSource,
  type SourceFormState,
} from "./product-catalog-types";
import { ProductSourceForm } from "./ProductSourceForm";
import { ProductSourceList } from "./ProductSourceList";
import { MonthlyPlansSection } from "./MonthlyPlansSection";
import { ProductsGrid } from "./ProductsGrid";

interface ProductCatalogSectionProps {
  clientId: string;
}

export default function ProductCatalogSection({
  clientId,
}: ProductCatalogSectionProps) {
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const [sources, setSources] = useState<ProductSource[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [plans, setPlans] = useState<CampaignPlan[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceForm, setSourceForm] = useState<SourceFormState>(defaultSourceForm);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [creatingSource, setCreatingSource] = useState(false);
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null);
  const [removingSourceId, setRemovingSourceId] = useState<string | null>(null);
  const [removingProductId, setRemovingProductId] = useState<string | null>(
    null
  );
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(
    new Set()
  );
  const [bulkRemovingProducts, setBulkRemovingProducts] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState<
    "MANUAL" | "ASSISTED" | null
  >(null);
  const [approvingPlanId, setApprovingPlanId] = useState<string | null>(null);

  const loadSources = useCallback(async () => {
    const response = await fetch(`/api/clients/${clientId}/product-sources`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(payload?.error || "Failed to load product sources");
    setSources(Array.isArray(payload.sources) ? payload.sources : []);
  }, [clientId]);

  const loadProducts = useCallback(async () => {
    const response = await fetch(`/api/clients/${clientId}/products?limit=30`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(payload?.error || "Failed to load products");
    const nextProducts = Array.isArray(payload.products) ? payload.products : [];
    setProducts(nextProducts);
    setSelectedProductIds((prev) => {
      const visibleIds = new Set(
        nextProducts.map((product: Product) => product.id)
      );
      return new Set(
        Array.from(prev).filter((productId) => visibleIds.has(productId))
      );
    });
    setCounts(payload.counts ?? {});
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
      await Promise.all([loadSources(), loadProducts(), loadPlans()]);
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "Unable to load product catalog";
      setLoadError(text);
      toast.error("Couldn't load product catalog", text);
    } finally {
      setLoading(false);
    }
  }, [loadPlans, loadProducts, loadSources, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const activeProductCount = counts.ACTIVE ?? 0;
  const unavailableCount = counts.POSSIBLY_UNAVAILABLE ?? 0;

  const latestRun = useMemo(() => {
    return sources
      .flatMap((source) => source.syncRuns ?? [])
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      )[0];
  }, [sources]);
  const visibleProductIds = useMemo(
    () => products.map((product) => product.id),
    [products]
  );
  const allVisibleProductsSelected =
    visibleProductIds.length > 0 &&
    visibleProductIds.every((productId) => selectedProductIds.has(productId));

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
        {
          method: "POST",
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Product sync failed");
      toast.success(
        "Sync started",
        payload?.message || "Refresh to follow progress."
      );
      await loadSources();
      window.setTimeout(() => {
        Promise.all([loadSources(), loadProducts()]).catch(() => null);
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

  const removeSource = async (sourceId: string) => {
    const confirmed = await confirm({
      title: "Remove product source?",
      description:
        "Existing synced products will stay in the catalog.",
      confirmLabel: "Remove source",
      confirmVariant: "danger",
    });
    if (!confirmed) return;

    setRemovingSourceId(sourceId);
    try {
      const response = await fetch(
        `/api/clients/${clientId}/product-sources/${sourceId}`,
        {
          method: "DELETE",
        }
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

  const removeProduct = async (productId: string) => {
    const confirmed = await confirm({
      title: "Remove product from catalog?",
      description:
        "Campaign history and snapshots will stay untouched.",
      confirmLabel: "Remove product",
      confirmVariant: "danger",
    });
    if (!confirmed) return;

    setRemovingProductId(productId);
    try {
      const response = await fetch(
        `/api/clients/${clientId}/products/${productId}`,
        {
          method: "DELETE",
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload?.error || "Failed to remove product");
      toast.success("Product removed from catalog");
      await loadProducts();
    } catch (error) {
      toast.error(
        "Couldn't remove product",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setRemovingProductId(null);
    }
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const toggleSelectAllVisibleProducts = () => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (allVisibleProductsSelected) {
        visibleProductIds.forEach((productId) => next.delete(productId));
      } else {
        visibleProductIds.forEach((productId) => next.add(productId));
      }
      return next;
    });
  };

  const removeSelectedProducts = async (ids: string[]) => {
    if (ids.length === 0) return;
    const confirmed = await confirm({
      title: `Remove ${ids.length} product${ids.length === 1 ? "" : "s"}?`,
      description: "Removed products are archived, not permanently deleted.",
      confirmLabel: "Remove",
      confirmVariant: "danger",
    });
    if (!confirmed) return;

    setBulkRemovingProducts(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/products`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", productIds: ids }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload?.error || "Failed to remove products");
      setSelectedProductIds(new Set());
      toast.success(
        `${payload?.count ?? ids.length} products removed from catalog`
      );
      await loadProducts();
    } catch (error) {
      toast.error(
        "Couldn't remove products",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setBulkRemovingProducts(false);
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

  const approvePlan = async (planId: string) => {
    setApprovingPlanId(planId);
    try {
      const response = await fetch(
        `/api/clients/${clientId}/campaign-plans/${planId}/approve`,
        {
          method: "POST",
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload?.error || "Failed to approve plan");
      toast.success("Campaign plan approved");
      await loadPlans();
    } catch (error) {
      toast.error(
        "Couldn't approve plan",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setApprovingPlanId(null);
    }
  };

  return (
    <Card>
      <div className="space-y-6 p-5 sm:p-6">
        <SectionHeader
          title="Products & Monthly Planning"
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
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
            title="Couldn't load product catalog"
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <StatCard
                label="Active products"
                value={activeProductCount}
                accent="success"
                icon={<CubeIcon className="h-4 w-4" />}
              />
              <StatCard
                label="Needs review"
                value={unavailableCount}
                accent="warning"
                icon={<ExclamationTriangleIcon className="h-4 w-4" />}
              />
              <StatCard
                label="Sources"
                value={sources.length}
                accent="brand"
                icon={<RssIcon className="h-4 w-4" />}
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
              onSync={syncSource}
              onRemove={removeSource}
            />

            <div className="border-t border-line pt-6">
              <MonthlyPlansSection
                plans={plans}
                creatingPlan={creatingPlan}
                approvingPlanId={approvingPlanId}
                onCreatePlan={createPlan}
                onApprovePlan={approvePlan}
              />
            </div>

            <div className="border-t border-line pt-6">
              <ProductsGrid
                products={products}
                selectedProductIds={selectedProductIds}
                allVisibleProductsSelected={allVisibleProductsSelected}
                visibleProductIds={visibleProductIds}
                bulkRemoving={bulkRemovingProducts}
                removingProductId={removingProductId}
                onToggleSelect={toggleProductSelection}
                onToggleSelectAll={toggleSelectAllVisibleProducts}
                onRemoveSelected={removeSelectedProducts}
                onRemoveProduct={removeProduct}
              />
            </div>
          </>
        )}
      </div>
      {confirmDialog}
    </Card>
  );
}
