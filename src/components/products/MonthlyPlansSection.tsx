"use client";

import {
  CalendarDaysIcon,
  CheckCircleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/page-header";
import type { CampaignPlan } from "./product-catalog-types";

interface MonthlyPlansSectionProps {
  plans: CampaignPlan[];
  creatingPlan: "MANUAL" | "ASSISTED" | null;
  approvingPlanId: string | null;
  onCreatePlan: (mode: "MANUAL" | "ASSISTED") => void;
  onApprovePlan: (id: string) => void;
}

export function MonthlyPlansSection({
  plans,
  creatingPlan,
  approvingPlanId,
  onCreatePlan,
  onApprovePlan,
}: MonthlyPlansSectionProps) {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Monthly plans"
        description="Create a manual month or let Templaito suggest products for review."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onCreatePlan("MANUAL")}
              disabled={creatingPlan !== null}
              isLoading={creatingPlan === "MANUAL"}
              leftIcon={<CalendarDaysIcon className="h-4 w-4" />}
            >
              Manual month
            </Button>
            <Button
              size="sm"
              onClick={() => onCreatePlan("ASSISTED")}
              disabled={creatingPlan !== null}
              isLoading={creatingPlan === "ASSISTED"}
              leftIcon={<SparklesIcon className="h-4 w-4" />}
            >
              Assisted suggestion
            </Button>
          </>
        }
      />

      {plans.length === 0 ? (
        <EmptyState
          compact
          icon={<CalendarDaysIcon className="h-6 w-6" />}
          title="No monthly campaign plans yet"
          description="Create a manual month or generate an assisted suggestion to get started."
        />
      ) : (
        <div className="space-y-3">
          {plans.slice(0, 4).map((plan) => (
            <div
              key={plan.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 shadow-soft"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-ink">{plan.name}</p>
                  <StatusBadge status={plan.status} />
                  <Badge variant="brand">{plan.mode}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {plan.items.length > 0
                    ? plan.items
                        .map((item) => item.product?.title || item.type)
                        .join(" + ")
                    : "Ready for manual product selection"}
                </p>
              </div>
              {plan.status === "DRAFT" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onApprovePlan(plan.id)}
                  disabled={approvingPlanId === plan.id}
                  isLoading={approvingPlanId === plan.id}
                  leftIcon={<CheckCircleIcon className="h-4 w-4" />}
                  className="text-emerald-700 hover:bg-emerald-50"
                >
                  Approve
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
