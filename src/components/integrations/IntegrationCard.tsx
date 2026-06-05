import * as React from "react";
import {
  ArrowPathIcon,
  ChartBarSquareIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  InboxStackIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

interface Integration {
  id: string;
  provider: string;
  status: string;
  metadata?: unknown;
  lastSyncedAt?: string | null;
}

interface IntegrationCardProps {
  provider: "SQUALOMAIL" | "KLAVIYO" | "MAILCHIMP";
  integration: Integration | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  onConfigure?: () => void;
}

const PROVIDER_CONFIG: Record<
  string,
  {
    name: string;
    icon: React.ReactNode;
    tint: string;
    comingSoon?: boolean;
  }
> = {
  SQUALOMAIL: {
    name: "SqualoMail",
    icon: <EnvelopeIcon className="h-6 w-6" />,
    tint: "border-brand-100 bg-brand-50 text-brand-600",
  },
  KLAVIYO: {
    name: "Klaviyo",
    icon: <ChartBarSquareIcon className="h-6 w-6" />,
    tint: "border-line bg-surface-muted text-muted",
    comingSoon: true,
  },
  MAILCHIMP: {
    name: "Mailchimp",
    icon: <InboxStackIcon className="h-6 w-6" />,
    tint: "border-line bg-surface-muted text-muted",
    comingSoon: true,
  },
};

export default function IntegrationCard({
  provider,
  integration,
  onConnect,
  onDisconnect,
  onRefresh,
  onConfigure,
}: IntegrationCardProps) {
  const config = PROVIDER_CONFIG[provider];
  const isConnected = integration?.status === "CONNECTED";

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border border-line bg-surface p-5 shadow-soft transition-shadow",
        !config.comingSoon && "hover:shadow-raised"
      )}
    >
      {config.comingSoon && (
        <span className="absolute right-4 top-4">
          <Badge variant="neutral">Coming soon</Badge>
        </span>
      )}

      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border",
            config.tint
          )}
        >
          {config.icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-ink">{config.name}</h3>
          <div className="mt-1.5">
            {isConnected ? (
              <Badge variant="success" dot>
                <CheckCircleIcon className="h-3.5 w-3.5" />
                Connected
              </Badge>
            ) : (
              <Badge variant="neutral">
                <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                Not connected
              </Badge>
            )}
          </div>
        </div>
      </div>

      {isConnected && integration?.lastSyncedAt && (
        <p className="mt-4 rounded-lg border border-line bg-surface-muted/60 px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-muted">
          Last synced ·{" "}
          {new Date(integration.lastSyncedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        {isConnected ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              disabled={config.comingSoon}
              leftIcon={<ArrowPathIcon className="h-4 w-4" />}
              className="flex-1"
            >
              Refresh
            </Button>
            {onConfigure && (
              <Button
                size="sm"
                onClick={onConfigure}
                disabled={config.comingSoon}
                className="flex-1"
              >
                Configure
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={onDisconnect}
              disabled={config.comingSoon}
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              Disconnect
            </Button>
          </>
        ) : (
          <Button
            onClick={onConnect}
            disabled={config.comingSoon}
            leftIcon={<PlusIcon className="h-4 w-4" />}
            className="w-full"
          >
            Connect {config.name}
          </Button>
        )}
      </div>
    </div>
  );
}
