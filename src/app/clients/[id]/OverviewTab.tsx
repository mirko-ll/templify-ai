"use client";

import {
  CalendarDaysIcon,
  GlobeAltIcon,
  MegaphoneIcon,
  PuzzlePieceIcon,
} from "@heroicons/react/24/outline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { ClientDetail, CountryConfig, SqualoIntegration } from "./types";

interface OverviewTabProps {
  client: ClientDetail;
  countries: CountryConfig[];
  integration: SqualoIntegration | null;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function OverviewTab({ client, countries, integration }: OverviewTabProps) {
  const connectedIntegrations = integration ? 1 : 0;
  const activeCountriesCount = countries.filter((c) => c.isActive).length;
  const totalCampaigns = client.campaigns?.length || 0;
  const recentCampaigns = [...(client.campaigns || [])]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Integrations"
          value={connectedIntegrations}
          hint={`Email service${connectedIntegrations !== 1 ? "s" : ""} connected`}
          accent="brand"
          icon={<PuzzlePieceIcon className="h-4 w-4" />}
        />
        <StatCard
          label="Active countries"
          value={activeCountriesCount}
          hint={`of ${countries.length} configured`}
          accent="success"
          icon={<GlobeAltIcon className="h-4 w-4" />}
        />
        <StatCard
          label="Campaigns"
          value={totalCampaigns}
          hint="Total campaigns"
          accent="info"
          icon={<MegaphoneIcon className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <DetailRow label="Description">
              {client.description || (
                <span className="text-muted">No description</span>
              )}
            </DetailRow>
            <DetailRow label="Notes">
              {client.notes || <span className="text-muted">No notes</span>}
            </DetailRow>
            <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
                  Created
                </p>
                <p className="mt-1 font-medium text-ink">
                  {formatDate(client.createdAt)}
                </p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
                  Updated
                </p>
                <p className="mt-1 font-medium text-ink">
                  {formatDate(client.updatedAt)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            {recentCampaigns.length === 0 ? (
              <EmptyState
                compact
                icon={<CalendarDaysIcon className="h-6 w-6" />}
                title="No campaigns yet"
                description="Campaigns created for this client will appear here."
              />
            ) : (
              <ul className="divide-y divide-line">
                {recentCampaigns.map((campaign) => (
                  <li
                    key={campaign.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">
                        {campaign.name}
                      </p>
                      <p className="text-xs text-muted">
                        {formatDate(
                          campaign.sentAt ||
                            campaign.scheduledAt ||
                            campaign.updatedAt
                        )}
                      </p>
                    </div>
                    <StatusBadge status={campaign.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-body">{children}</p>
    </div>
  );
}
