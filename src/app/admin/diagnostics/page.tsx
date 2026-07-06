"use client";

import { useState } from "react";
import {
  MagnifyingGlassIcon,
  WrenchScrewdriverIcon,
  LinkIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

interface CountryDiagnosis {
  id: string;
  countryCode: string;
  isPushed: boolean;
  externalId: string | null;
  htmlLength: number | null;
  broken: boolean;
  checks: Record<string, number>;
  excerpt: string | null;
  hrefs: string[];
}

interface CampaignDiagnosis {
  id: string;
  name: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  clientName: string | null;
  countries: CountryDiagnosis[];
}

interface PlannerItemRef {
  id: string;
  campaignId: string | null;
  status: string;
  sendDate: string | null;
  plan: string;
}

interface DiagnosticsResult {
  mode: "scan" | "diagnose";
  term?: string;
  campaigns: CampaignDiagnosis[];
  plannerItems?: PlannerItemRef[];
}

interface RepairResult {
  repaired: number;
  stillBroken: string[];
  pushedBroken: Array<{
    campaignId: string;
    campaignName: string;
    countryCode: string;
    externalId: string | null;
  }>;
}

export default function AdminDiagnosticsPage() {
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [result, setResult] = useState<DiagnosticsResult | null>(null);
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (searchTerm?: string) => {
    setLoading(true);
    setError(null);
    setRepairResult(null);
    try {
      const query = searchTerm ? `?term=${encodeURIComponent(searchTerm)}` : "";
      const response = await fetch(`/api/admin/diagnostics/broken-links${query}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${response.status})`);
      }
      setResult(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Diagnostics failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const repair = async () => {
    if (
      !confirm(
        "Repair markdown-mangled links in all stored campaign HTML? Un-pushed campaigns are fixed in place. Already-pushed ones are only reported — their SqualoMail newsletters must be deleted and regenerated manually."
      )
    ) {
      return;
    }
    setRepairing(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/diagnostics/broken-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "repair" }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Repair failed (${response.status})`);
      }
      setRepairResult(await response.json());
      // Refresh whatever view is showing
      await run(result?.mode === "diagnose" ? result.term : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Repair failed");
    } finally {
      setRepairing(false);
    }
  };

  const brokenCount = result
    ? result.campaigns.reduce(
        (sum, campaign) =>
          sum + campaign.countries.filter((country) => country.broken).length,
        0
      )
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-100 to-orange-100 shadow-sm">
            <LinkIcon className="h-6 w-6 text-rose-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Broken Link Diagnostics
            </h1>
            <p className="text-sm text-gray-500">
              Find campaign HTML whose links were mangled into markdown by
              translation — the pattern that gets campaigns stopped by
              SqualoMail.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="mb-8 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && term.trim()) run(term.trim());
                }}
                placeholder="Campaign name, subject or product URL — e.g. timeranger"
                className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <button
              onClick={() => term.trim() && run(term.trim())}
              disabled={loading || !term.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
            >
              <MagnifyingGlassIcon className="h-4 w-4" />
              Diagnose
            </button>
            <button
              onClick={() => run()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
            >
              <ArrowPathIcon
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Scan everything
            </button>
            <button
              onClick={repair}
              disabled={repairing || loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-rose-600 hover:to-orange-600 disabled:opacity-50"
            >
              <WrenchScrewdriverIcon className="h-4 w-4" />
              {repairing ? "Repairing…" : "Repair all"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
            {error}
          </div>
        )}

        {repairResult && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
            <p className="font-semibold">
              Repaired {repairResult.repaired}{" "}
              {repairResult.repaired === 1 ? "row" : "rows"} in stored HTML.
            </p>
            {repairResult.stillBroken.length > 0 && (
              <p className="mt-1 text-rose-700">
                {repairResult.stillBroken.length} rows still match a broken
                pattern after repair — they need a closer look.
              </p>
            )}
            {repairResult.pushedBroken.length > 0 && (
              <div className="mt-3">
                <p className="font-semibold text-amber-800">
                  {repairResult.pushedBroken.length} newsletters were already
                  pushed to SqualoMail with broken links — delete them there
                  and regenerate the planner day:
                </p>
                <ul className="mt-1 list-inside list-disc text-amber-800">
                  {repairResult.pushedBroken.map((entry) => (
                    <li key={`${entry.campaignId}-${entry.countryCode}`}>
                      {entry.campaignName} — {entry.countryCode}
                      {entry.externalId ? ` (newsletter ${entry.externalId})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {result && (
          <>
            <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
              {result.mode === "scan" ? (
                result.campaigns.length === 0 ? (
                  <>
                    <CheckCircleIcon className="h-5 w-5 text-emerald-500" />
                    Full scan: no stored campaign HTML matches a broken-link
                    pattern.
                  </>
                ) : (
                  <>
                    <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
                    Full scan: {brokenCount} broken country{" "}
                    {brokenCount === 1 ? "version" : "versions"} across{" "}
                    {result.campaigns.length}{" "}
                    {result.campaigns.length === 1 ? "campaign" : "campaigns"}.
                  </>
                )
              ) : (
                <>
                  Diagnosis for “{result.term}”: {result.campaigns.length}{" "}
                  matching {result.campaigns.length === 1 ? "campaign" : "campaigns"}
                  {result.campaigns.length > 0 && `, ${brokenCount} broken country versions`}
                  .
                </>
              )}
            </div>

            <div className="space-y-6">
              {result.campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-indigo-50/50 px-5 py-4">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {campaign.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {campaign.clientName ? `${campaign.clientName} · ` : ""}
                        status {campaign.status} · created{" "}
                        {new Date(campaign.createdAt).toLocaleString()}
                        {campaign.scheduledAt &&
                          ` · scheduled ${new Date(campaign.scheduledAt).toLocaleString()}`}
                      </p>
                    </div>
                    <code className="rounded-lg bg-white/70 px-2 py-1 text-xs text-gray-400">
                      {campaign.id}
                    </code>
                  </div>

                  <div className="divide-y divide-gray-50">
                    {campaign.countries.map((country) => (
                      <div key={country.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-indigo-50 px-2 py-0.5 text-sm font-semibold text-indigo-700">
                            {country.countryCode}
                          </span>
                          {country.broken ? (
                            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                              broken links
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                              clean
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              country.isPushed
                                ? "bg-amber-100 text-amber-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {country.isPushed ? "pushed to SqualoMail" : "not pushed"}
                          </span>
                          {country.externalId && (
                            <span className="text-xs text-gray-400">
                              newsletter {country.externalId}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">
                            {country.htmlLength === null
                              ? "no stored HTML (immediate publish — not detectable here)"
                              : `${country.htmlLength.toLocaleString()} chars`}
                          </span>
                        </div>

                        {country.htmlLength !== null && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {Object.entries(country.checks).map(([needle, index]) => (
                              <span
                                key={needle}
                                className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] ${
                                  index >= 0
                                    ? needle === "roundrect"
                                      ? "bg-blue-50 text-blue-600"
                                      : "bg-rose-50 text-rose-600"
                                    : "bg-gray-50 text-gray-400"
                                }`}
                              >
                                {needle} {index >= 0 ? `@${index}` : "—"}
                              </span>
                            ))}
                          </div>
                        )}

                        {country.excerpt && (
                          <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-200">
                            {country.excerpt}
                          </pre>
                        )}

                        {country.hrefs.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-medium text-indigo-600">
                              {country.hrefs.length} unique link{country.hrefs.length === 1 ? "" : "s"}
                            </summary>
                            <ul className="mt-1 space-y-0.5">
                              {country.hrefs.map((href) => (
                                <li
                                  key={href}
                                  className={`break-all font-mono text-[11px] ${
                                    href.trimStart().startsWith("[")
                                      ? "text-rose-600"
                                      : "text-gray-500"
                                  }`}
                                >
                                  {href}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {result.mode === "scan" &&
              result.plannerItems &&
              result.plannerItems.length > 0 && (
                <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <p className="mb-2 text-sm font-semibold text-gray-900">
                    Planner days referencing broken campaigns
                  </p>
                  <ul className="space-y-1 text-sm text-gray-600">
                    {result.plannerItems.map((item) => (
                      <li key={item.id}>
                        Plan {item.plan} — item status {item.status}
                        {item.sendDate &&
                          ` · send ${new Date(item.sendDate).toLocaleDateString()}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </>
        )}

        {!result && !error && (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white/60 p-10 text-center text-sm text-gray-500">
            Search for a campaign to inspect its stored per-country HTML, or
            run a full scan to find every broken link in the database.
          </div>
        )}
      </div>
    </div>
  );
}
