import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

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
    color: string;
    gradient: string;
    icon: string;
    comingSoon?: boolean;
  }
> = {
  SQUALOMAIL: {
    name: "SqualoMail",
    color: "blue",
    gradient: "from-blue-600 to-cyan-600",
    icon: "📧",
  },
  KLAVIYO: {
    name: "Klaviyo",
    color: "purple",
    gradient: "from-purple-600 to-pink-600",
    icon: "🎯",
    comingSoon: true,
  },
  MAILCHIMP: {
    name: "Mailchimp",
    color: "yellow",
    gradient: "from-yellow-600 to-orange-600",
    icon: "🐵",
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
    <div className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
      {/* Coming Soon Badge */}
      {config.comingSoon && (
        <div className="absolute top-3 right-3 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          Coming Soon
        </div>
      )}

      {/* Provider Header */}
      <div className="flex items-start gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${config.gradient} text-2xl shadow-lg`}
        >
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-slate-900">
            {config.name}
          </h3>
          <div className="mt-1 flex items-center gap-2">
            {isConnected ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                <CheckCircleIcon className="h-3.5 w-3.5" />
                Connected
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                Not connected
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Connection Info */}
      {isConnected && integration?.lastSyncedAt && (
        <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Last synced:{" "}
          {new Date(integration.lastSyncedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        {isConnected ? (
          <>
            <button
              onClick={onRefresh}
              disabled={config.comingSoon}
              className="cursor-pointer flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Refresh
            </button>
            {onConfigure && (
              <button
                onClick={onConfigure}
                disabled={config.comingSoon}
                className="cursor-pointer flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-slate-600 to-slate-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
              >
                Configure
              </button>
            )}
            <button
              onClick={onDisconnect}
              disabled={config.comingSoon}
              className="cursor-pointer rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={onConnect}
            disabled={config.comingSoon}
            className={`cursor-pointer w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${config.gradient} px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <PlusIcon className="h-4 w-4" />
            Connect {config.name}
          </button>
        )}
      </div>
    </div>
  );
}
