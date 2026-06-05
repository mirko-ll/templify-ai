"use client";

import { useState } from "react";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/cn";
import {
  BoltIcon,
  GlobeAltIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { SqualoMailConfig } from "./SqualoMailConfig";

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

interface Integration {
  id: string;
  provider: string;
  status: string;
  metadata?: {
    lists?: Array<{ id: string; name: string }> | null;
    [key: string]: unknown;
  } | null;
  lastSyncedAt?: string | null;
}

interface IntegrationTabsProps {
  clientId: string;
  integration: Integration | null;
  countries: CountryConfig[];
  onUpdateCountry: (
    countryCode: string,
    payload: Record<string, unknown>,
    success?: string
  ) => Promise<void>;
  onRefresh: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  renderAlert: (
    alert: { type: "success" | "error"; message: string } | null
  ) => React.ReactNode;
  alert: { type: "success" | "error"; message: string } | null;
}

export default function IntegrationTabs({
  clientId,
  integration,
  countries,
  onUpdateCountry,
  onRefresh,
  onDisconnect,
  renderAlert,
  alert,
}: IntegrationTabsProps) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "squalomail" | "klaviyo"
  >("overview");

  const mailingLists =
    integration?.metadata && Array.isArray(integration.metadata.lists)
      ? (integration.metadata.lists as Array<{ id: string; name: string }>)
      : [];

  const connectedIntegrations = integration ? 1 : 0;
  const activeCountriesCount = countries.filter((c) => c.isActive).length;

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: Squares2X2Icon },
    {
      id: "squalomail" as const,
      label: "SqualoMail",
      icon: GlobeAltIcon,
      disabled: !integration,
    },
    {
      id: "klaviyo" as const,
      label: "Klaviyo",
      icon: BoltIcon,
      disabled: true,
      comingSoon: true,
    },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-soft">
      <div className="border-b border-line px-6">
        <nav className="flex gap-1" aria-label="Integration tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                disabled={tab.disabled}
                className={cn(
                  "relative inline-flex cursor-pointer items-center gap-2 border-b-2 px-1 py-4 text-sm font-medium transition-colors disabled:cursor-not-allowed",
                  isActive
                    ? "border-brand-600 text-brand-700"
                    : tab.disabled
                      ? "border-transparent text-muted/60"
                      : "border-transparent text-muted hover:text-ink"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.comingSoon && (
                  <span className="ml-1 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-muted">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-6">
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-ink">
                Integration overview
              </h3>
              <p className="mt-1 text-sm text-muted">
                Manage your email marketing integrations and country
                configurations.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="Connected"
                value={connectedIntegrations}
                hint={`Email service${connectedIntegrations !== 1 ? "s" : ""}`}
                accent="brand"
              />
              <StatCard
                label="Active countries"
                value={activeCountriesCount}
                hint={`of ${countries.length} total`}
                accent="success"
              />
              <StatCard
                label="Mailing lists"
                value={mailingLists.length}
                hint="Available lists"
                accent="info"
              />
            </div>

            {!integration && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">No integrations connected</p>
                <p className="mt-1 text-amber-700">
                  Connect an email service provider to start managing campaigns.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "squalomail" && integration && (
          <SqualoMailConfig
            clientId={clientId}
            integration={integration}
            countries={countries}
            mailingLists={mailingLists}
            onUpdateCountry={onUpdateCountry}
            onRefresh={onRefresh}
            onDisconnect={onDisconnect}
            renderAlert={renderAlert}
            alert={alert}
          />
        )}
      </div>
    </div>
  );
}
