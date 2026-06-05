"use client";

import IntegrationCard from "@/components/integrations/IntegrationCard";
import IntegrationTabs from "@/components/integrations/IntegrationTabs";
import { SectionHeader } from "@/components/ui/page-header";
import type { Alert, CountryConfig, SqualoIntegration, UpdateCountryFn } from "./types";

interface IntegrationsTabProps {
  clientId: string;
  integration: SqualoIntegration | null;
  countries: CountryConfig[];
  integrationAlert: Alert | null;
  renderAlert: (alert: Alert | null) => React.ReactNode;
  onConnect: () => void;
  onDisconnect: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onUpdateCountry: UpdateCountryFn;
}

export function IntegrationsTab({
  clientId,
  integration,
  countries,
  integrationAlert,
  renderAlert,
  onConnect,
  onDisconnect,
  onRefresh,
  onUpdateCountry,
}: IntegrationsTabProps) {
  return (
    <section className="space-y-5">
      <SectionHeader
        title="Integrations"
        description="Connect email service providers to manage campaigns."
      />

      {renderAlert(integrationAlert)}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <IntegrationCard
          provider="SQUALOMAIL"
          integration={integration}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onRefresh={onRefresh}
        />
        <IntegrationCard
          provider="KLAVIYO"
          integration={null}
          onConnect={() => {}}
          onDisconnect={() => {}}
          onRefresh={() => {}}
        />
        <IntegrationCard
          provider="MAILCHIMP"
          integration={null}
          onConnect={() => {}}
          onDisconnect={() => {}}
          onRefresh={() => {}}
        />
      </div>

      {integration && (
        <IntegrationTabs
          clientId={clientId}
          integration={integration}
          countries={countries}
          onUpdateCountry={onUpdateCountry}
          onRefresh={onRefresh}
          onDisconnect={onDisconnect}
          renderAlert={renderAlert}
          alert={integrationAlert}
        />
      )}
    </section>
  );
}
