"use client";

import { useState } from "react";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ArrowsRightLeftIcon,
  CheckIcon,
  EnvelopeOpenIcon,
  ForwardIcon,
} from "@heroicons/react/24/outline";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BUCKET_META } from "@/components/autopilot/buckets";
import { BucketInfo } from "@/components/autopilot/BucketInfo";
import { cn } from "@/lib/cn";
import {
  STATUS_LABEL,
  boostNote,
  compact,
  dayLabel,
  euro,
  eventLabel,
  isEditable,
  latestEvents,
  monthShort,
  shortDate,
  slotStatus,
  timeLabel,
  untilLabel,
  type CountryStats,
  type Option,
  type Slot,
  type SlotStatus,
} from "./autopilot-ui";

const STATUS_VARIANT: Record<SlotStatus, BadgeVariant> = {
  proposed: "warning",
  approved: "success",
  yours: "success",
  auto: "success",
  locked: "info",
  generating: "info",
  scheduled: "info",
  failed: "danger",
  skipped: "neutral",
  empty: "warning",
};

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{children}</h4>
      {aside}
    </div>
  );
}

/** Tiny horizontal bar for comparing figures inside one evidence block. */
function Bar({ value, max, tone }: { value: number; max: number; tone: string }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
      <span className={cn("block h-full rounded-full", tone)} style={{ width: `${max > 0 ? Math.max(4, (value / max) * 100) : 0}%` }} />
    </span>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/70 py-1.5 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium tabular-nums text-ink">{value}</span>
    </div>
  );
}

/** The numbers behind the pick, laid out per kind of signal. */
function Evidence({ slot }: { slot: Slot }) {
  const s = slot.signals ?? {};
  const blocks: React.ReactNode[] = [];

  if (Array.isArray(s.months) && Array.isArray(s.profit) && s.profit.some((p: number) => p > 0)) {
    const months = [...s.months].reverse() as string[];
    const profit = [...s.profit].reverse() as number[];
    const max = Math.max(...profit);
    blocks.push(
      <div key="profit">
        <SectionTitle aside={s.rankLatest ? <span className="text-xs text-muted">#{s.rankLatest} last month</span> : undefined}>
          Email profit
        </SectionTitle>
        <div className="flex flex-col gap-1.5">
          {months.map((m, i) => (
            <div key={m} className="grid grid-cols-[2.5rem_1fr_4.5rem] items-center gap-2 text-sm">
              <span className="text-muted">{monthShort(m)}</span>
              <Bar value={profit[i]} max={max} tone="bg-amber-400" />
              <span className="text-right font-medium tabular-nums text-ink">{euro(profit[i])}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (Array.isArray(s.brands) && s.brands.length) {
    const max = Math.max(...s.brands.map((b: any) => b.reach7d ?? 0));
    blocks.push(
      <div key="ads">
        <SectionTitle aside={<span className="text-xs text-muted">reach in 7 days</span>}>Facebook ads</SectionTitle>
        <div className="flex flex-col gap-1.5">
          {s.brands.map((b: any) => (
            <div key={b.name} className="grid grid-cols-[6.5rem_1fr_7.5rem] items-center gap-2 text-sm">
              <span className={cn("truncate", b.own ? "font-semibold text-ink" : "text-body")}>{b.own ? "Your shop" : b.name}</span>
              <Bar value={b.reach7d ?? 0} max={max} tone={b.own ? "bg-brand-500" : "bg-indigo-300"} />
              <span className="text-right tabular-nums text-ink">
                {b.activeAds} ads · {compact(b.reach7d)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (Array.isArray(s.rivals) && s.rivals.length) {
    blocks.push(
      <div key="rivals">
        <SectionTitle>Competitors launching it</SectionTitle>
        <div className="flex flex-col">
          {s.rivals.map((r: any) => (
            <Fact
              key={r.brand}
              label={r.brand}
              value={`${r.firstAdAt ? `ads since ${shortDate(r.firstAdAt)}` : `listed ${shortDate(r.listedSince)}`} · ${r.activeAds} ads`}
            />
          ))}
        </div>
      </div>
    );
  }

  const facts: Array<[string, React.ReactNode]> = [];
  if (s.neverEmailed) {
    facts.push(["Emailed so far", "never — a first try"]);
    if (s.inShopSince) facts.push(["In the shop since", shortDate(s.inShopSince)]);
    if (s.inStockCountries) facts.push(["In stock", `${s.inStockCountries} of ${s.eligibleCountries} countries`]);
    if (s.category) {
      facts.push([
        `Last ${s.category} email`,
        s.categoryGapDays === null || s.categoryGapDays === undefined ? "none yet" : `${s.categoryGapDays} days ago`,
      ]);
    }
    if (s.pastAds) facts.push(["Past FB ads", s.pastAds]);
  }
  if (s.relaunched) facts.push(["Relaunched", `first ad ${shortDate(s.ownFirstAdAt)} · in shop since ${shortDate(s.inShopSince)}`]);
  else if (s.firstSeenAt) facts.push(["New in the shop", shortDate(s.firstSeenAt)]);
  if (!s.relaunched && s.ownFirstAdAt) facts.push(["Your first ad", shortDate(s.ownFirstAdAt)]);
  if (typeof s.timesSent === "number") facts.push(["Emailed so far", s.timesSent === 0 ? "never" : `${s.timesSent}×`]);
  if (typeof s.sendsLatestMonth === "number" && s.sendsLatestMonth > 0) {
    facts.push(["Sends last month", `${s.sendsLatestMonth}×${s.profitPerSendLatest ? ` · ${euro(s.profitPerSendLatest)} per send` : ""}`]);
  }
  if (s.graduated) facts.push(["Graduated", `from new products (${monthShort(s.graduatedMonth)})`]);
  if (Array.isArray(s.seasonTags)) facts.push(["Season", s.seasonTags.join(", ")]);
  if (facts.length) {
    blocks.push(
      <div key="facts">
        <SectionTitle>Facts</SectionTitle>
        {facts.map(([label, value]) => (
          <Fact key={label} label={label} value={value} />
        ))}
      </div>
    );
  }

  if (!blocks.length) return <p className="text-sm text-muted">No figures stored for this pick.</p>;
  return <div className="flex flex-col gap-5">{blocks}</div>;
}

/** How the price was set: last price, suggested, raised to the cost floor, or a price test. */
function PriceNote({ slot }: { slot: Slot }) {
  const pricing = slot.signals?.pricing;
  const margin = (floor: number, cost: number) => Math.round((1 - cost / floor) * 100);
  if (pricing?.test) {
    return (
      <p className="text-sm text-body">
        <span className="mr-1.5 inline-flex rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
          Price test
        </span>
        €{pricing.test.test} instead of €{pricing.test.base} (+{pricing.test.stepPct}%). About a day after sending, its clicks are compared with
        earlier sends at €{pricing.test.base} — the higher price stays only if it earns at least as much.
      </p>
    );
  }
  if (pricing?.raisedToFloor && pricing.floor !== null && pricing.cost !== null) {
    return (
      <p className="text-sm text-amber-700">
        Raised from €{pricing.base} to €{pricing.floor}: each order costs about €{pricing.cost.toFixed(2)} (from the{" "}
        {pricing.costMonth ? monthShort(pricing.costMonth) : "last"} sales report), so €{pricing.base} would leave less than the minimum margin.
      </p>
    );
  }
  return (
    <p className="text-sm">
      {slot.priceSuggested ? (
        <span className="text-amber-700">
          Suggested — never emailed, so it&rsquo;s the shop price × your usual email discount. Check it before it locks.
        </span>
      ) : slot.priceOverride ? (
        <span className="text-muted">Last email price of this offer.</span>
      ) : null}
      {pricing?.floor !== null && pricing?.floor !== undefined && pricing.cost !== null && (
        <span className="text-muted">
          {" "}
          Never below €{pricing.floor} (cost about €{pricing.cost.toFixed(2)} + {margin(pricing.floor, pricing.cost)}% margin).
        </span>
      )}
    </p>
  );
}

/** Sent / opened / clicked per country once SqualoMail has the results. */
function EmailResults({ stats }: { stats: CountryStats[] }) {
  const total = stats.reduce((acc, s) => ({ sent: acc.sent + s.sent, opens: acc.opens + s.opens, clicks: acc.clicks + s.clicks }), { sent: 0, opens: 0, clicks: 0 });
  const rate = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "–");
  const perThousand = (n: number, d: number) => (d ? ((n / d) * 1000).toFixed(1) : "–");
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1 font-medium">Country</th>
            <th className="py-1 text-right font-medium">Sent</th>
            <th className="py-1 text-right font-medium">Opened</th>
            <th className="py-1 text-right font-medium">Clicks</th>
            <th className="py-1 text-right font-medium">Clicks / 1,000</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {stats.map((s) => (
            <tr key={s.countryCode} className="border-t border-line/70">
              <td className="py-1 font-mono font-semibold text-ink">{s.countryCode}</td>
              <td className="py-1 text-right">{s.sent.toLocaleString("en-US")}</td>
              <td className="py-1 text-right">{rate(s.opens, s.sent)}</td>
              <td className="py-1 text-right">{s.clicks.toLocaleString("en-US")}</td>
              <td className="py-1 text-right">{perThousand(s.clicks, s.sent)}</td>
            </tr>
          ))}
          <tr className="border-t border-line font-semibold text-ink">
            <td className="py-1">All</td>
            <td className="py-1 text-right">{total.sent.toLocaleString("en-US")}</td>
            <td className="py-1 text-right">{rate(total.opens, total.sent)}</td>
            <td className="py-1 text-right">{total.clicks.toLocaleString("en-US")}</td>
            <td className="py-1 text-right">{perThousand(total.clicks, total.sent)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function AlternativeCard({ option, onUse, disabled }: { option: Option; onUse: () => void; disabled: boolean }) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border border-line bg-surface p-3", option.blocked && "opacity-60")}>
      <div className="flex items-start gap-2.5">
        {option.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={option.imageUrl} alt="" loading="lazy" className="h-11 w-11 flex-shrink-0 rounded-md border border-line object-cover" />
        ) : (
          <div className="h-11 w-11 flex-shrink-0 rounded-md border border-line bg-surface-muted" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{option.groupKey}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span className={cn("h-1.5 w-1.5 rounded-full", BUCKET_META[option.bucket].dot)} />
            {BUCKET_META[option.bucket].label}
            <span aria-hidden>·</span>
            <span className={option.priceSuggested ? "text-amber-700" : undefined}>{option.price ? `€${option.price}` : "no price"}</span>
          </p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-body">{option.reason}</p>
      {option.blocked ? (
        <p className="text-xs font-medium text-amber-700">Not possible now: {option.blocked}</p>
      ) : (
        <Button size="sm" variant="secondary" className="self-start" disabled={disabled} onClick={onUse}>
          Use instead
        </Button>
      )}
    </div>
  );
}

interface AutopilotSlotDetailProps {
  slot: Slot;
  timezone: string;
  now: number;
  lockAt: string | null;
  busy: boolean;
  alternatives: Option[];
  onApprove: () => void;
  onSkip: () => void;
  onUnskip: () => void;
  onSwap: (alternativeIndex: number) => void;
  onBrowse: () => void;
  onPreview: () => void;
}

export function AutopilotSlotDetail({
  slot,
  timezone,
  now,
  lockAt,
  busy,
  alternatives,
  onApprove,
  onSkip,
  onUnskip,
  onSwap,
  onBrowse,
  onPreview,
}: AutopilotSlotDetailProps) {
  const [imageIndex, setImageIndex] = useState(0);
  const status = slotStatus(slot);
  const editable = isEditable(slot);
  const detail = slot.detail;
  const images = detail?.images.length ? detail.images : slot.signals?.product?.imageUrl ? [slot.signals.product.imageUrl] : [];
  const meta = BUCKET_META[slot.bucket];
  const boost = boostNote(slot);
  const fallback = latestEvents(slot).find((e) => e.type === "FALLBACK");
  const lockIn = lockAt ? untilLabel(lockAt, now) : null;
  const inStock = detail?.pages.filter((p) => p.inStock) ?? [];
  const history = [...(slot.events ?? [])].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className={cn("flex flex-col gap-6", busy && "pointer-events-none opacity-70")}>
      {/* Header: what, when, and what the boss can do about it */}
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="flex flex-shrink-0 flex-col gap-2 md:w-56">
          {images[imageIndex] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={images[imageIndex]} alt={detail?.title ?? slot.groupKey ?? ""} className="aspect-square w-full rounded-xl border border-line object-cover" />
          ) : (
            <div className="aspect-square w-full rounded-xl border border-line bg-surface-muted" />
          )}
          {images.length > 1 && (
            <div className="flex gap-1.5">
              {images.slice(0, 5).map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setImageIndex(i)}
                  aria-label={`Image ${i + 1}`}
                  className={cn(
                    "h-10 w-10 overflow-hidden rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
                    i === imageIndex ? "border-brand-500" : "border-line opacity-70 hover:opacity-100"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="font-mono font-semibold tabular-nums text-ink">
              {dayLabel(slot.date, { weekday: "long", day: "numeric", month: "short" })} · {timeLabel(slot.sendAt, timezone)}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", meta.chip)}>
                {meta.label}
              </span>
              <BucketInfo bucket={slot.bucket} side="bottom" />
            </span>
            <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
            {slot.shadow && <Badge variant="brand">Shadow — not sent</Badge>}
          </div>

          <div>
            <h3 className="text-2xl font-semibold tracking-tight text-ink">{slot.groupKey ?? "No product"}</h3>
            {detail?.title && <p className="mt-0.5 text-sm text-body">{detail.title}</p>}
          </div>

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-2xl font-semibold tabular-nums text-ink">{slot.priceOverride ? `€${slot.priceOverride}` : "No price"}</span>
            {slot.signals?.pricing?.test && (
              <span className="text-sm text-muted line-through">€{slot.signals.pricing.test.base}</span>
            )}
          </div>
          <PriceNote slot={slot} />

          {(boost || fallback) && (
            <p className="text-sm text-body">
              {boost && <span>★ {boost}. </span>}
              {fallback && (
                <span>
                  ↺ The rotation asked for {BUCKET_META[slot.plannedBucket].label.toLowerCase()} — {fallback.detail.split(": ")[1] ?? "nothing fitted"}, so
                  it fell back.
                </span>
              )}
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2">
            {editable && slot.state === "PROPOSED" && (
              <Button size="sm" leftIcon={<CheckIcon className="h-4 w-4" />} onClick={onApprove}>
                Approve
              </Button>
            )}
            {editable && slot.state !== "SKIPPED" && (
              <Button size="sm" variant="secondary" leftIcon={<ArrowsRightLeftIcon className="h-4 w-4" />} onClick={onBrowse}>
                Swap product
              </Button>
            )}
            {editable && slot.state !== "SKIPPED" && slot.state !== "EMPTY" && (
              <Button size="sm" variant="ghost" leftIcon={<ForwardIcon className="h-4 w-4" />} onClick={onSkip}>
                Skip this send
              </Button>
            )}
            {slot.state === "SKIPPED" && (
              <Button size="sm" variant="secondary" leftIcon={<ArrowPathIcon className="h-4 w-4" />} onClick={onUnskip}>
                Undo skip
              </Button>
            )}
            {slot.item?.campaignId && (
              <Button size="sm" variant="secondary" leftIcon={<EnvelopeOpenIcon className="h-4 w-4" />} onClick={onPreview}>
                Preview email
              </Button>
            )}
            <span className="text-xs text-muted">
              {editable ? (lockIn ? `Locks in ${lockIn} — then it is generated.` : "Locks tonight.") : "Locked — change it in the planner (unschedule) if needed."}
            </span>
          </div>
          {slot.item?.errorMessage && <p className="text-sm text-rose-600">{slot.item.errorMessage}</p>}
        </div>
      </div>

      {/* Why + the numbers behind it */}
      <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>
          <SectionTitle aside={<span className="text-xs text-muted">{slot.pickedBy === "USER" ? "picked by you" : "Autopilot"}</span>}>
            Why this product
          </SectionTitle>
          <p className="text-[15px] leading-relaxed text-ink">{slot.reason ?? "No reason stored."}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-muted/40 p-4">
          <Evidence slot={slot} />
        </div>
      </div>

      {/* How the email did, once it went out */}
      {slot.item && slot.item.stats.length > 0 && (
        <div>
          <SectionTitle aside={<span className="text-xs text-muted">from SqualoMail</span>}>Email results</SectionTitle>
          <EmailResults stats={slot.item.stats} />
        </div>
      )}

      {/* Shop pages per country */}
      {detail && detail.pages.length > 0 && (
        <div>
          <SectionTitle aside={<span className="text-xs text-muted">in stock in {inStock.length} of {detail.pages.length}</span>}>
            Shop pages
          </SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {detail.pages.map((page) => (
              <a
                key={page.countryCode}
                href={page.url}
                target="_blank"
                rel="noreferrer"
                title={page.title ?? page.url}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
                  page.inStock
                    ? "border-line-strong text-ink hover:border-brand-400 hover:bg-brand-50"
                    : "border-line text-muted line-through decoration-rose-400"
                )}
              >
                <span className="font-mono font-semibold">{page.countryCode}</span>
                {page.price && <span className="tabular-nums text-body">{page.price}</span>}
                {!page.inStock && <span className="no-underline">sold out</span>}
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 text-muted" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Alternatives */}
      {editable && alternatives.length > 0 && (
        <div>
          <SectionTitle aside={<button type="button" onClick={onBrowse} className="text-xs font-medium text-brand-700 hover:underline">Browse more</button>}>
            Alternatives
          </SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {alternatives.map((option, index) => (
              <AlternativeCard key={option.groupKey} option={option} disabled={busy} onUse={() => onSwap(index)} />
            ))}
          </div>
        </div>
      )}

      {/* What happened to this send */}
      {history.length > 0 && (
        <div>
          <SectionTitle>History</SectionTitle>
          <ol className="flex flex-col gap-1 text-sm">
            {history.slice(0, 8).map((event, i) => (
              <li key={`${event.at}-${i}`} className="grid grid-cols-[5.5rem_8rem_1fr] gap-2">
                <span className="tabular-nums text-muted">
                  {new Date(event.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: timezone })}
                </span>
                <span className="font-medium text-ink">{eventLabel(event.type)}</span>
                <span className="text-body">{event.detail}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
