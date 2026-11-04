"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { BUCKETS, BUCKET_HELP, BUCKET_META, type Bucket } from "./buckets";
import { BucketInfo, BucketLegend } from "./BucketInfo";
import { CategoryMultiSelect, type CategoryOption } from "./CategoryMultiSelect";
import { InfoTip } from "./InfoTip";

type Mode = "OFF" | "SHADOW" | "ON";

type Season =
  | { name: string; tags: string[]; from: string; to: string; boost?: number }
  | { name: string; tags: string[]; easterOffset: [number, number]; boost?: number };

interface Settings {
  timezone: string;
  slotTimes: string[];
  rotation: Bucket[][][];
  rotationStart: string;
  weights: Record<Bucket, number>;
  rules: {
    noRepeatDays: number;
    bestMaxPerMonth: number;
    prefillDays: number;
    lockDaysBefore: number;
    newWindowDays: number;
    newMaxTests: number;
    minInStockCountryShare: number;
    priceRatio: number | null;
    minMarginPct: number;
    priceTests: boolean;
    priceTestStepPct: number;
  };
  seasons: Season[];
  intel: { ownBrandId: string | null; competitorBrandIds: string[] };
  defaults: { templateId: string | null; subject: string; preheader: string; senderName: string; mailingListOverrides: Record<string, string[]> };
}

interface ConfigResponse {
  mode: Mode;
  settings: Settings;
  status: {
    activeProducts: number;
    sendCountries: number;
    squalomailConnected: boolean;
    latestReport: { year: number; month: number; createdAt: string } | null;
    intel: { fetchedAt: string | null; brands: Array<{ brandId: string; brandName: string; active: number; matched: number }> };
  };
  categories: CategoryOption[];
  plannerDefaults: { defaults: Settings["defaults"]; month: string | null };
  factoryDefaults: { weights: Record<Bucket, number>; rotation: Bucket[][][] };
  priceTests: Array<{
    id: string;
    groupKey: string;
    basePrice: string;
    testPrice: string;
    status: "RUNNING" | "KEPT" | "REVERTED" | "CANCELLED";
    sendAt: string;
    decision: string | null;
    decidedAt: string | null;
  }>;
  runs: Array<{ id: string; kind: string; status: string; startedAt: string; finishedAt: string | null; error: string | null; stats: any }>;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const RULE_FIELDS: Array<{ key: Exclude<keyof Settings["rules"], "priceTests">; label: string; hint: string; step?: number }> = [
  { key: "noRepeatDays", label: "No repeat within (days)", hint: "A product never goes out twice in this many days." },
  { key: "bestMaxPerMonth", label: "Max sends per product / month", hint: "Best sellers are resent at most this often." },
  { key: "newWindowDays", label: "New product window (days)", hint: "How long after first appearing a product counts as new." },
  { key: "newMaxTests", label: "New product tests", hint: "Sends before a new product must sell well or drop out." },
  { key: "minInStockCountryShare", label: "Min. in-stock countries (share)", hint: "0.6 = in stock in 60% of your countries.", step: 0.05 },
  { key: "prefillDays", label: "Days kept filled", hint: "The rolling window of picks." },
  { key: "lockDaysBefore", label: "Lock & generate (days before)", hint: "When a day is frozen and generated." },
  { key: "minMarginPct", label: "Minimum margin (%)", hint: "Never price an email below cost + this margin (cost from the sales report). 0 = off." },
  { key: "priceTestStepPct", label: "Price test step (%)", hint: "How much higher a test price is (at least €1)." },
];

/** Pricing settings explained in the boss's terms (ⓘ tooltips). */
const PRICE_TIPS = {
  overview: (
    <>
      <span className="mb-1 block">Every Autopilot email price is worked out in this order:</span>
      <span className="block">
        <b className="text-ink">1. Start:</b> a product emailed before keeps its last email price (a 1+1 has its own). A never-emailed product gets
        shop price × &ldquo;Email price ÷ shop price&rdquo;, marked <i>suggested</i>.
      </span>
      <span className="block">
        <b className="text-ink">2. Floor:</b> never below cost + the minimum margin — lower prices are raised.
      </span>
      <span className="block">
        <b className="text-ink">3. Test:</b> now and then a best seller goes out one step higher to see if it still earns as much.
      </span>
      <span className="mt-1 block text-muted">The planner shows the reason next to every price.</span>
    </>
  ),
  ratio: (
    <>
      <span className="block">
        Only for products <b className="text-ink">never emailed before</b> — the others keep their last email price.
      </span>
      <span className="mt-1 block">
        <b className="text-ink">Empty</b> = learned from your own emails (median of the last 90 days). If your emails usually ask half the shop
        price, that&rsquo;s 0.5.
      </span>
      <span className="mt-1 block">
        Example: shop price €19.99 × 0.5 = <b className="text-ink">€10</b>, marked <i>suggested</i> for you to check. Enter 0.6 to ask 60% instead
        (→ €12).
      </span>
    </>
  ),
  minMarginPct: (
    <>
      <span className="block">A safety floor: an email price is never so low that less than this share of it is left after costs.</span>
      <span className="mt-1 block">
        <b className="text-ink">Cost</b> comes from the sales report. Example: a product went out at €12 and 46.5% of its revenue was profit →
        each order costs about €12 × 53.5% = €6.41.
      </span>
      <span className="mt-1 block">
        <b className="text-ink">Floor</b> at 30%: €6.41 ÷ 0.70 = €9.16 → never below <b className="text-ink">€10</b>. A lower price is raised and
        the planner says why. Products not in a sales report yet have no floor. 0 = off.
      </span>
    </>
  ),
  priceTestStepPct: (
    <>
      <span className="block">How much higher a test price is. 10% of €12 → €13.</span>
      <span className="mt-1 block">Always at least €1 more, and never below the minimum-margin floor.</span>
    </>
  ),
  priceTests: (
    <>
      <span className="block">
        A best seller with at least 2 earlier emails that have click results goes out one step higher once (e.g. €13 instead of €12).
      </span>
      <span className="mt-1 block">
        About a day after sending, <b className="text-ink">clicks per email × (price − cost)</b> is compared with its earlier emails — so fewer clicks
        at a higher price can still win. Within 10% → the higher price stays. Worse → the next email goes back.
      </span>
      <span className="mt-1 block">
        A month later the sales report can still send it back if profit per email fell more than 20%. One test per product at a time, then a
        30-day pause; changing the price yourself cancels the test.
      </span>
    </>
  ),
} as const;

type RuleFieldKey = (typeof RULE_FIELDS)[number]["key"];

/** Every rule explained with an example (ⓘ tooltips). */
const RULE_TIPS: Record<RuleFieldKey, React.ReactNode> = {
  noRepeatDays: (
    <>
      <span className="block">
        A product is never emailed twice within this many days — including its 1+1 / 2+2 offers, your own planner emails and resends.
      </span>
      <span className="mt-1 block">
        Example: 10 → sent on Mon 1 Nov, the earliest it can go again is Thu 11 Nov. Lower lets best sellers come back sooner; higher gives more
        variety.
      </span>
    </>
  ),
  bestMaxPerMonth: (
    <>
      <span className="block">
        The most times one product goes out in a calendar month — all buckets and your own emails together.
      </span>
      <span className="mt-1 block">
        Best sellers are meant to be resent; this keeps them from wearing out. Example: 2 → at most twice in November.
      </span>
    </>
  ),
  newWindowDays: (
    <>
      <span className="block">How long a product counts as new after it first appears in your shop.</span>
      <span className="mt-1 block">
        Example: 21 → a product added on 1 Nov is a new-product candidate until 22 Nov. Products a competitor launched in the last 30 days, and
        relaunches (your first ad in the last 30 days), count as new too.
      </span>
    </>
  ),
  newMaxTests: (
    <>
      <span className="block">How many emails a new product gets to prove itself.</span>
      <span className="mt-1 block">
        If it sells well enough to reach your top 20 best sellers in the sales report, it moves to best sellers. If not, it leaves the
        new-product pool after this many emails. Example: 2 → two chances.
      </span>
    </>
  ),
  minInStockCountryShare: (
    <>
      <span className="block">
        A product is only picked if it&rsquo;s in stock in at least this share of the countries you send to. The email then goes only to the
        countries where it is in stock.
      </span>
      <span className="mt-1 block">
        Example: 0.6 with 15 countries → in stock in at least 9. Stock is checked again on the morning a day locks; a pick that sold out is
        replaced.
      </span>
    </>
  ),
  prefillDays: (
    <>
      <span className="block">How many days ahead the Autopilot keeps filled with picks.</span>
      <span className="mt-1 block">7 → the planner always shows a week; every night one new day is added at the end.</span>
    </>
  ),
  lockDaysBefore: (
    <>
      <span className="block">
        How many days before sending a day locks: stock is re-checked, sold-out picks are replaced, picks nobody approved are auto-approved, and
        the emails are generated.
      </span>
      <span className="mt-1 block">
        Example: 2 → Friday&rsquo;s emails lock on Wednesday at 06:00. You can still unschedule them in the planner until about 2 hours before
        sending.
      </span>
    </>
  ),
  minMarginPct: PRICE_TIPS.minMarginPct,
  priceTestStepPct: PRICE_TIPS.priceTestStepPct,
  priceRatio: PRICE_TIPS.ratio,
};

const TEST_STATUS: Record<string, { label: string; tone: string }> = {
  RUNNING: { label: "Waiting for results", tone: "text-sky-700" },
  KEPT: { label: "Kept", tone: "text-emerald-700" },
  REVERTED: { label: "Went back", tone: "text-amber-700" },
  CANCELLED: { label: "Cancelled", tone: "text-muted" },
};

const EMAIL_FIELDS = ["templateId", "subject", "preheader", "senderName"] as const;

function emailEmpty(defaults: Settings["defaults"]) {
  return EMAIL_FIELDS.every((field) => !defaults[field]);
}

/** Empty Autopilot email settings start from the planner's (shown as unsaved until saved). */
function prefillEmail(settings: Settings, planner: ConfigResponse["plannerDefaults"] | undefined): Settings {
  if (!planner || !emailEmpty(settings.defaults) || emailEmpty(planner.defaults)) return settings;
  return { ...settings, defaults: { ...settings.defaults, ...pickEmail(planner.defaults) } };
}

function pickEmail(defaults: Settings["defaults"]) {
  return {
    templateId: defaults.templateId,
    subject: defaults.subject,
    preheader: defaults.preheader,
    senderName: defaults.senderName,
  };
}

function Section({ title, description, children, actions }: { title: string; description?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-ink">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
      ) : (
        <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
      )}
      <span className={ok ? "text-body" : "text-ink"}>{children}</span>
    </li>
  );
}

export function AutopilotSettings({ clientId }: { clientId: string }) {
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }> | null>(null);
  const [brandsError, setBrandsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);

  /** `resetDraft: false` (polling) refreshes status without discarding unsaved edits. */
  const load = useCallback(async (resetDraft = true) => {
    const response = await fetch(`/api/clients/${clientId}/autopilot/config`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Couldn't load the Autopilot", payload?.error);
      return;
    }
    setConfig(payload);
    if (resetDraft) setDraft(prefillEmail(payload.settings, payload.plannerDefaults));
  }, [clientId, toast]);

  useEffect(() => {
    void load();
    fetch(`/api/clients/${clientId}/autopilot/intel/brands`)
      .then((r) => r.json().then((p) => ({ ok: r.ok, p })))
      .then(({ ok, p }) => {
        setBrands(Array.isArray(p?.brands) ? p.brands : []);
        if (!ok) setBrandsError(p?.error ?? "Couldn't reach oadmin");
      })
      .catch(() => setBrandsError("Couldn't reach oadmin"));
    fetch(`/api/prompts/active`)
      .then((r) => (r.ok ? r.json() : { prompts: [] }))
      .then((p) =>
        setTemplates(
          (Array.isArray(p?.prompts) ? p.prompts : []).filter(
            (t: { templateType?: string }) => t.templateType === "SINGLE_PRODUCT"
          )
        )
      )
      .catch(() => setTemplates([]));
  }, [clientId, load]);

  const running = config?.runs?.[0]?.status === "RUNNING";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(false), 5000);
    return () => clearInterval(timer);
  }, [running, load]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(config?.settings), [draft, config]);
  const weightTotal = draft ? Math.round(BUCKETS.reduce((s, b) => s + (Number(draft.weights[b]) || 0), 0)) : 0;

  const save = async (body: Record<string, unknown>, message = "Autopilot settings saved") => {
    setSaving(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/autopilot/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Save failed");
      toast.success(message, payload?.replanning ? "Re-planning the open days — the planner updates in about a minute." : undefined);
      await load();
    } catch (err) {
      toast.error("Couldn't save", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const setMode = async (mode: Mode) => {
    if (mode === "ON") {
      const ok = await confirm({
        title: "Turn the Autopilot on?",
        description:
          "Picks are written into this client's monthly plan, and each day is generated and scheduled automatically 2 days before sending — approved or not. You can still swap, skip or unschedule until about 2 hours before a send.",
        confirmLabel: "Turn on",
        confirmVariant: "primary",
      });
      if (!ok) return;
    }
    await save({ mode }, mode === "OFF" ? "Autopilot turned off" : mode === "SHADOW" ? "Shadow mode on — nothing is sent" : "Autopilot is on");
  };

  const runNow = async () => {
    const response = await fetch(`/api/clients/${clientId}/autopilot/run`, { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) toast.error("Couldn't start", payload?.error);
    else toast.success("Autopilot is picking…");
    await load(false);
  };

  if (!config || !draft) {
    return <p className="p-6 text-sm text-muted">Loading Autopilot…</p>;
  }

  const update = (patch: Partial<Settings>) => setDraft({ ...draft, ...patch });
  const brandOptions: Array<{ id: string; name: string }> =
    brands && brands.length
      ? brands
      : config.status.intel.brands.map((b) => ({ id: b.brandId, name: b.brandName }));
  const setCell = (w: number, d: number, s: number, bucket: Bucket) => {
    const rotation = draft.rotation.map((week) => week.map((day) => [...day]));
    rotation[w][d][s] = bucket;
    update({ rotation });
  };
  const status = config.status;
  const reportAgeDays = status.latestReport ? (Date.now() - new Date(status.latestReport.createdAt).getTime()) / 86_400_000 : null;
  const intelMapped = !!draft.intel.ownBrandId || draft.intel.competitorBrandIds.length > 0;
  const lastRun = config.runs[0];

  return (
    <div className="flex flex-col gap-6">
      {confirmDialog}

      <Section
        title="Autopilot"
        description="Picks 2 emails a day from your formula. You check them and approve; every new client works the same way."
        actions={
          <Button variant="secondary" size="sm" leftIcon={<ArrowPathIcon className="h-4 w-4" />} isLoading={running} disabled={config.mode === "OFF"} onClick={runNow}>
            Run now
          </Button>
        }
      >
        <div className="flex flex-wrap gap-2">
          {(["OFF", "SHADOW", "ON"] as Mode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={saving}
              onClick={() => mode !== config.mode && setMode(mode)}
              className={cn(
                "rounded-lg border px-4 py-2 text-left text-sm transition-colors",
                config.mode === mode ? "border-brand-400 bg-brand-50 text-brand-800 ring-2 ring-brand-500/20" : "border-line-strong text-body hover:bg-surface-muted"
              )}
            >
              <span className="block font-semibold">{mode === "OFF" ? "Off" : mode === "SHADOW" ? "Shadow" : "On"}</span>
              <span className="block text-xs text-muted">
                {mode === "OFF" ? "Nothing is picked" : mode === "SHADOW" ? "Picks shown in the planner only — compare with yours" : "Picks go into the plan and are sent"}
              </span>
            </button>
          ))}
        </div>

        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          <Check ok={status.activeProducts > 0}>{status.activeProducts.toLocaleString("en-US")} active products synced</Check>
          <Check ok={status.sendCountries > 0}>{status.sendCountries} countries with a mailing list</Check>
          <Check ok={status.squalomailConnected}>SqualoMail {status.squalomailConnected ? "connected" : "not connected — nothing can be generated"}</Check>
          <Check ok={reportAgeDays !== null && reportAgeDays <= 45}>
            {status.latestReport
              ? `Sales report: ${status.latestReport.year}-${String(status.latestReport.month).padStart(2, "0")} (uploaded ${Math.round(reportAgeDays!)} days ago)`
              : "No sales report yet — best sellers can't be picked"}{" "}
            <Link href={`/clients/${clientId}?tab=planning`} className="text-brand-700 hover:underline">
              Import
            </Link>
          </Check>
          <Check ok={intelMapped && status.intel.brands.length > 0}>
            {intelMapped
              ? status.intel.fetchedAt
                ? `Competitor intel pulled ${new Date(status.intel.fetchedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                : "Competitor brands mapped — pulled on the next run"
              : "No competitor brands mapped — FB winners and rival launches are skipped"}
          </Check>
        </ul>


        {lastRun && (
          <p className="mt-4 text-xs text-muted">
            Last run: {lastRun.kind.toLowerCase()} · {lastRun.status.toLowerCase()} ·{" "}
            {new Date(lastRun.finishedAt ?? lastRun.startedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {lastRun.stats?.fill && ` · ${lastRun.stats.fill.filled} picked, ${lastRun.stats.fill.empty} empty, ${lastRun.stats.fill.replaced} replaced`}
            {lastRun.stats?.lock?.queued ? ` · ${lastRun.stats.lock.queued} generated` : ""}
            {lastRun.error && <span className="block whitespace-pre-line text-amber-700">{lastRun.error}</span>}
          </p>
        )}
      </Section>

      <Section
        title="Mix"
        description="Share of emails per bucket. The rotation grid below decides which slot gets which bucket. Discovery tries good products that were never emailed, a different set each week."
      >
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {BUCKETS.map((bucket) => (
            <div key={bucket} className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <span className={cn("h-2.5 w-2.5 rounded-full", BUCKET_META[bucket].dot)} /> {BUCKET_META[bucket].label}
                <BucketInfo bucket={bucket} />
              </span>
              <span className="-mt-1 text-xs text-muted">{BUCKET_HELP[bucket].short}</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  aria-label={`${BUCKET_META[bucket].label} share`}
                  value={draft.weights[bucket]}
                  onChange={(e) => update({ weights: { ...draft.weights, [bucket]: Number(e.target.value) } })}
                  className="flex-1 accent-brand-600"
                />
                <span className="w-12 text-right text-sm tabular-nums text-ink">{draft.weights[bucket]}%</span>
              </div>
              <span className="text-xs text-muted">≈ {Math.round(((draft.weights[bucket] || 0) / Math.max(weightTotal, 1)) * 28 * draft.slotTimes.length)} emails / 4 weeks</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            disabled={saving || weightTotal <= 0}
            onClick={() => save({ weights: draft.weights, rebuildRotation: true }, "Rotation rebuilt from the mix")}
          >
            Apply mix to the rotation
          </Button>
          <span className={cn("text-xs", weightTotal === 100 ? "text-muted" : "text-amber-700")}>
            Total {weightTotal}%{weightTotal !== 100 && " — shares are scaled to 100%"}
          </span>
        </div>
      </Section>

      <Section
        title="4-week rotation"
        description="Which bucket fills each send. Click a cell to change it. If a bucket has nothing that passes the rules, the slot falls back to the next bucket by share."
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => update({ rotation: config.factoryDefaults.rotation, weights: config.factoryDefaults.weights })}
          >
            Reset to default
          </Button>
        }
      >
        <BucketLegend side="top" className="mb-3" />
        <p className="mb-3 text-xs text-muted">
          Default: every morning a best seller (resend); evenings test — W1 new products, W2 &amp; W4 FB winners and new
          products, W3 seasonal and new products, plus one discovery evening in W1, W3 and W4. That is the 50% / 25% /
          15% / 5% / 5% mix.
        </p>
        <div className="mb-3 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <Label>Week 1 starts (Monday)</Label>
            <Input type="date" className="h-9 w-44" value={draft.rotationStart} onChange={(e) => update({ rotationStart: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <Label>Send times ({draft.timezone})</Label>
            <div className="flex items-center gap-2">
              {draft.slotTimes.map((time, i) => (
                <Input
                  key={i}
                  type="time"
                  className="h-9 w-28"
                  value={time}
                  onChange={(e) => {
                    const slotTimes = [...draft.slotTimes];
                    slotTimes[i] = e.target.value;
                    update({ slotTimes });
                  }}
                />
              ))}
            </div>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th />
                {DAYS.map((d) => (
                  <th key={d} className="font-medium text-muted">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draft.rotation.map((week, w) => (
                <tr key={w}>
                  <th className="pr-2 text-left font-medium text-muted">W{w + 1}</th>
                  {week.map((day, d) => (
                    <td key={d}>
                      <div className="flex flex-col gap-1">
                        {day.map((bucket, s) => (
                          <select
                            key={s}
                            value={bucket}
                            onChange={(e) => setCell(w, d, s, e.target.value as Bucket)}
                            title={draft.slotTimes[s]}
                            className={cn("w-full cursor-pointer rounded-md border-0 px-1.5 py-1 text-[11px] font-medium", BUCKET_META[bucket].cell)}
                          >
                            {BUCKETS.map((b) => (
                              <option key={b} value={b}>
                                {draft.slotTimes[s]} {BUCKET_META[b].label}
                              </option>
                            ))}
                          </select>
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Email for Autopilot picks"
        description="The template and texts every Autopilot email uses. Leave a field empty to use that month's planner default instead."
        actions={
          config.plannerDefaults.month && !emailEmpty(config.plannerDefaults.defaults) ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => update({ defaults: { ...draft.defaults, ...pickEmail(config.plannerDefaults.defaults) } })}
            >
              Copy from planner ({config.plannerDefaults.month})
            </Button>
          ) : undefined
        }
      >
        {emailEmpty(config.settings.defaults) && !emailEmpty(draft.defaults) && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Prefilled from the {config.plannerDefaults.month} planner defaults — save to keep them for the Autopilot.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <Label>Template</Label>
            <select
              className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm"
              value={draft.defaults.templateId ?? ""}
              onChange={(e) => update({ defaults: { ...draft.defaults, templateId: e.target.value || null } })}
            >
              <option value="">Use the month&rsquo;s planner template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              {draft.defaults.templateId && !templates.some((t) => t.id === draft.defaults.templateId) && (
                <option value={draft.defaults.templateId}>Saved template (no longer active)</option>
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <Label>Sender name</Label>
            <Input
              className="h-9"
              placeholder="planner default"
              value={draft.defaults.senderName}
              onChange={(e) => update({ defaults: { ...draft.defaults, senderName: e.target.value } })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <Label>Subject</Label>
            <Input
              className="h-9"
              placeholder="planner default — e.g. LIMITED OFFER only today for {price}!"
              value={draft.defaults.subject}
              onChange={(e) => update({ defaults: { ...draft.defaults, subject: e.target.value } })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <Label>Preheader</Label>
            <Input
              className="h-9"
              placeholder="planner default"
              value={draft.defaults.preheader}
              onChange={(e) => update({ defaults: { ...draft.defaults, preheader: e.target.value } })}
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-muted">
          Applies to picks made after you save. Already planned emails keep their settings — change those in the planner.
        </p>
      </Section>

      <Section title="Rules">
        <p className="-mt-2 mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          Email price: last price, or shop price × ratio → never below cost + minimum margin → sometimes one test step higher.
          <InfoTip title="How the email price is set" label="How the email price is set" side="bottom" align="start">
            {PRICE_TIPS.overview}
          </InfoTip>
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RULE_FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5">
                <Label htmlFor={`rule-${field.key}`}>{field.label}</Label>
                <InfoTip title={field.label} label={`About ${field.label.toLowerCase()}`}>
                  {RULE_TIPS[field.key]}
                </InfoTip>
              </span>
              <Input
                id={`rule-${field.key}`}
                type="number"
                className="h-9"
                step={field.step ?? 1}
                value={draft.rules[field.key] ?? ""}
                onChange={(e) => update({ rules: { ...draft.rules, [field.key]: e.target.value === "" ? null : Number(e.target.value) } })}
              />
              <span className="text-xs text-muted">{field.hint}</span>
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5">
              <Label htmlFor="rule-priceRatio">Email price ÷ shop price</Label>
              <InfoTip title="Email price ÷ shop price" label="About email price ÷ shop price">
                {PRICE_TIPS.ratio}
              </InfoTip>
            </span>
            <Input
              id="rule-priceRatio"
              type="number"
              className="h-9"
              step={0.05}
              placeholder="learned from your past emails"
              value={draft.rules.priceRatio ?? ""}
              onChange={(e) => update({ rules: { ...draft.rules, priceRatio: e.target.value === "" ? null : Number(e.target.value) } })}
            />
            <span className="text-xs text-muted">For never-emailed products. Empty = learn it (median of the last 90 days).</span>
          </div>
          <div className="flex items-start gap-2 sm:col-span-2">
            <input
              id="rule-priceTests"
              type="checkbox"
              className="mt-1 h-4 w-4 accent-brand-600"
              checked={draft.rules.priceTests}
              onChange={(e) => update({ rules: { ...draft.rules, priceTests: e.target.checked } })}
            />
            <span>
              <span className="flex items-center gap-1.5">
                <label htmlFor="rule-priceTests" className="cursor-pointer text-sm font-medium text-ink">
                  Price tests on best sellers
                </label>
                <InfoTip title="Price tests on best sellers" label="About price tests">
                  {PRICE_TIPS.priceTests}
                </InfoTip>
              </span>
              <span className="block text-xs text-muted">
                Best sellers sometimes go out a step higher — the higher price stays only if it earns at least as much.
              </span>
            </span>
          </div>
        </div>
      </Section>

      <Section
        title="Price tests"
        description="Every test the Autopilot ran, with the result. A kept price becomes the product's email price from then on."
      >
        {config.priceTests.length === 0 ? (
          <p className="text-sm text-muted">
            No price tests yet. They start once best sellers have at least 2 sent emails with click results (collected each night after sending).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1.5 font-medium">Sent</th>
                  <th className="py-1.5 font-medium">Product</th>
                  <th className="py-1.5 font-medium">Price</th>
                  <th className="py-1.5 font-medium">Result</th>
                  <th className="py-1.5 font-medium">Why</th>
                </tr>
              </thead>
              <tbody>
                {config.priceTests.map((t) => (
                  <tr key={t.id} className="border-t border-line/70 align-top">
                    <td className="py-1.5 tabular-nums text-muted">
                      {new Date(t.sendAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </td>
                    <td className="py-1.5 font-semibold text-ink">{t.groupKey}</td>
                    <td className="py-1.5 tabular-nums">
                      €{t.basePrice} → €{t.testPrice}
                    </td>
                    <td className={cn("py-1.5 font-medium", TEST_STATUS[t.status]?.tone)}>{TEST_STATUS[t.status]?.label ?? t.status}</td>
                    <td className="py-1.5 text-xs text-body">{t.decision ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Seasons"
        description="Products tagged with a season's categories are pushed while it runs and never sent outside it. A share (e.g. Christmas 20%) turns some evening new-product / FB sends seasonal while the season runs — best-seller mornings stay."
        actions={
          <Button size="sm" variant="secondary" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => update({ seasons: [...draft.seasons, { name: "New season", tags: [], from: "01-01", to: "01-31" }] })}>
            Add season
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {draft.seasons.map((season, i) => {
            const setSeason = (next: Season) => update({ seasons: draft.seasons.map((s, j) => (j === i ? next : s)) });
            return (
              <div
                key={i}
                className="grid items-start gap-x-3 gap-y-3 rounded-lg border border-line p-3 md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_6.5rem_6.5rem_7.5rem_2.25rem]"
              >
                <label className="flex flex-col gap-1">
                  <Label>Name</Label>
                  <Input className="h-9" value={season.name} onChange={(e) => setSeason({ ...season, name: e.target.value })} />
                </label>
                <div className="flex min-w-0 flex-col gap-1">
                  <Label>Shop categories</Label>
                  <CategoryMultiSelect
                    options={config.categories}
                    value={season.tags}
                    onChange={(tags) => setSeason({ ...season, tags })}
                  />
                  <span className="text-[11px] text-muted">
                    Never emailed outside the season — skip broad sale tags.
                  </span>
                </div>
                {"easterOffset" in season ? (
                  <>
                    <label className="flex flex-col gap-1" title="Days relative to Easter Sunday (−21 = three weeks before)">
                      <Label>From (days)</Label>
                      <Input
                        type="number"
                        className="h-9"
                        value={season.easterOffset[0]}
                        onChange={(e) => setSeason({ ...season, easterOffset: [Number(e.target.value), season.easterOffset[1]] })}
                      />
                    </label>
                    <label className="flex flex-col gap-1" title="Days relative to Easter Sunday (0 = Easter Sunday)">
                      <Label>To (days)</Label>
                      <Input
                        type="number"
                        className="h-9"
                        value={season.easterOffset[1]}
                        onChange={(e) => setSeason({ ...season, easterOffset: [season.easterOffset[0], Number(e.target.value)] })}
                      />
                      <span className="text-[11px] text-muted">from Easter Sunday</span>
                    </label>
                  </>
                ) : (
                  <>
                    <label className="flex flex-col gap-1">
                      <Label>From</Label>
                      <Input className="h-9" placeholder="MM-DD" value={season.from} onChange={(e) => setSeason({ ...season, from: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <Label>To</Label>
                      <Input className="h-9" placeholder="MM-DD" value={season.to} onChange={(e) => setSeason({ ...season, to: e.target.value })} />
                      <span className="text-[11px] text-muted">month-day</span>
                    </label>
                  </>
                )}
                <label className="flex flex-col gap-1">
                  <Label>Share while on</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="h-9 pr-7"
                      placeholder="grid"
                      value={season.boost ?? ""}
                      onChange={(e) => setSeason({ ...season, boost: e.target.value === "" ? undefined : Number(e.target.value) })}
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
                  </div>
                </label>
                <div className="flex flex-col gap-1">
                  {/* Spacer the height of a label so the button lines up with the inputs. */}
                  <span aria-hidden className="hidden h-5 md:block" />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9"
                    aria-label={`Remove ${season.name}`}
                    onClick={() => update({ seasons: draft.seasons.filter((_, j) => j !== i) })}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Competitor intel" description="From oadmin's Ad Library tracking: your own brand's ads and your rivals' (FB winners, new launches).">
        {brandsError && (
          <p className="mb-3 text-sm text-amber-700" title={brandsError}>
            {/OADMIN_INTEL/.test(brandsError)
              ? "Competitor intel isn't connected yet, so the brand list can't be loaded — showing the brands saved for this shop."
              : "Couldn't load the brand list from oadmin — showing the brands saved for this shop."}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-[16rem_1fr]">
          <label className="flex flex-col gap-1">
            <Label>This shop&rsquo;s brand</Label>
            <select
              className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm"
              value={draft.intel.ownBrandId ?? ""}
              onChange={(e) =>
                update({
                  intel: {
                    ownBrandId: e.target.value || null,
                    competitorBrandIds: draft.intel.competitorBrandIds.filter((id) => id !== e.target.value),
                  },
                })
              }
            >
              <option value="">— none —</option>
              {brandOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <Label>Competitors</Label>
            <div className="flex flex-wrap gap-2">
              {brandOptions
                .filter((b) => b.id !== draft.intel.ownBrandId)
                .map((b) => {
                  const on = draft.intel.competitorBrandIds.includes(b.id);
                  const stat = status.intel.brands.find((s) => s.brandId === b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() =>
                        update({
                          intel: {
                            ...draft.intel,
                            competitorBrandIds: on ? draft.intel.competitorBrandIds.filter((id) => id !== b.id) : [...draft.intel.competitorBrandIds, b.id],
                          },
                        })
                      }
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium",
                        on ? "border-brand-300 bg-brand-50 text-brand-800" : "border-line-strong text-body hover:bg-surface-muted"
                      )}
                    >
                      {b.name}
                      {on && stat && <span className="ml-1 text-[10px] text-muted">{stat.matched}/{stat.active} matched</span>}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
        {status.intel.brands.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            Products with live ads matched to this catalog:{" "}
            {status.intel.brands.map((b) => `${b.brandName} ${b.matched}/${b.active}`).join(" · ")}
          </p>
        )}
      </Section>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <div className={cn("flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-raised transition-opacity", dirty ? "opacity-100" : "pointer-events-none opacity-0")}>
          <Badge variant="warning">Unsaved changes</Badge>
          <Button size="sm" variant="ghost" onClick={() => setDraft(config.settings)}>
            Discard
          </Button>
          <Button
            size="sm"
            isLoading={saving}
            onClick={() => {
              // The grid is the source of truth: an edited grid recomputes the mix; a mix-only
              // change is applied to the grid (otherwise it would be dropped on save).
              const gridChanged = JSON.stringify(draft.rotation) !== JSON.stringify(config.settings.rotation);
              const mixChanged = JSON.stringify(draft.weights) !== JSON.stringify(config.settings.weights);
              void save({
                timezone: draft.timezone,
                slotTimes: draft.slotTimes,
                rotationStart: draft.rotationStart,
                rules: draft.rules,
                seasons: draft.seasons,
                intel: draft.intel,
                defaults: draft.defaults,
                ...(gridChanged ? { rotation: draft.rotation, weights: draft.weights } : mixChanged ? { weights: draft.weights, rebuildRotation: true } : {}),
              });
            }}
          >
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
