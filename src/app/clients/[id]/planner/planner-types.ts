import type { CampaignUrlRule } from "@/lib/product-links";

export interface GroupListing {
  id: string;
  productId: string;
  countryCode: string | null;
  url: string;
  campaignUrl: string;
  slug: string | null;
  priceRaw: string | null;
  regularPrice: string | null;
  salePrice: string | null;
  currency: string | null;
  availability: string;
  /** Per-country scraped title (present on groups from the grouped API). */
  title?: string | null;
  normalizedTitle?: string | null;
  /** Source's campaign-link rule — lets generation rebuild the URL with a price. */
  campaignUrlRule?: CampaignUrlRule | null;
}

export interface ProductGroup {
  key: string;
  slug: string;
  title: string;
  description: string | null;
  bestImageUrl: string | null;
  /** Shop category (lowercased), e.g. "summer" — present on groups from the grouped API. */
  category?: string | null;
  images: string[];
  productIds: string[];
  countries: string[];
  listings: GroupListing[];
}

export interface PromptOption {
  id: string;
  name: string;
  description: string | null;
  color: string;
  templateType: "SINGLE_PRODUCT" | "MULTI_PRODUCT";
}

export interface PlannerDefaults {
  templateId: string;
  subject: string;
  preheader: string;
  sendTime: string; // "HH:mm"
  senderName: string;
  /** countryCode → mailing list IDs. Empty/absent = country's configured default list. */
  mailingListOverrides: Record<string, string[]>;
}

export interface MailingList {
  id: string;
  name: string;
}

export interface CountryOption {
  code: string;
  name: string;
  defaultListId: string | null;
  defaultListName: string | null;
}

export type ItemStatus =
  | "PLANNED"
  | "QUEUED"
  | "GENERATING"
  | "SCHEDULED"
  | "FAILED";

/**
 * A past campaign re-scheduled as-is for a planned day. The original's
 * prepared per-country emails (and mailing lists) are cloned at generation
 * time via the backend resend endpoint — nothing is regenerated.
 */
export interface ResendSource {
  /** Campaign whose prepared content gets cloned. */
  sourceCampaignId: string;
  name: string;
  subject: string | null;
  productNickname: string | null;
  imageUrl: string | null;
  /** When the original went (or goes) out — sentAt, else scheduledAt. */
  lastSentAt: string | null;
  countries: string[];
}

/** Campaign row offered by the resend picker (from /campaigns/resendable). */
export interface ResendableCampaign {
  id: string;
  name: string;
  /** True when this campaign is itself a resend clone of an earlier one. */
  isResend: boolean;
  status: string;
  subject: string | null;
  productNickname: string | null;
  imageUrl: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  countries: string[];
  /** SqualoMail newsletter ids — feed the metrics endpoint. */
  newsletterIds: string[];
}

/** Per-campaign engagement aggregated from SqualoMail newsletter metrics. */
export interface ResendStats {
  sentTotal: number;
  /** 0–1 fractions, weighted by per-newsletter sends. */
  openRate: number;
  clickRate: number;
}

/** Last imported month's numbers for one product row (see /product-performance). */
export interface PerformanceEntry {
  id: string;
  /** Raw codename from the sheet, e.g. "carfit". */
  campaignName: string;
  /** Matched product group key — joins onto ProductGroup.key. Null = not in catalog. */
  groupKey: string | null;
  orders: number;
  quantity: number;
  revenue: number;
  uniqueProducts: number;
  profit: number;
  productTitle: string | null;
  imageUrl: string | null;
  /** Same product in the previously imported month, for trends. */
  prev: { orders: number; quantity: number; revenue: number; profit: number } | null;
}

export interface PerformanceReportMeta {
  id: string;
  year: number;
  month: number;
  fileName?: string | null;
  rowCount: number;
  matchedCount: number;
  createdAt: string;
}

export interface PerformanceData {
  reports: PerformanceReportMeta[];
  report: PerformanceReportMeta | null;
  previousMonth: { year: number; month: number } | null;
  entries: PerformanceEntry[];
}

export type PerformanceMetric = "quantity" | "revenue" | "profit" | "orders";

export const PERFORMANCE_METRICS: Array<{
  value: PerformanceMetric;
  label: string;
}> = [
  { value: "quantity", label: "Qty sold" },
  { value: "revenue", label: "Revenue" },
  { value: "profit", label: "Profit" },
  { value: "orders", label: "Orders" },
];

const EUR = new Intl.NumberFormat("sl-SI", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const COUNT = new Intl.NumberFormat("sl-SI");

export function formatMetric(metric: PerformanceMetric, value: number): string {
  return metric === "revenue" || metric === "profit"
    ? EUR.format(value)
    : COUNT.format(value);
}

/** "May 2026" from numeric year/month. */
export function formatMonth(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

/** Percent change vs the previous month; null when there's no baseline. */
export function metricTrend(
  entry: PerformanceEntry,
  metric: PerformanceMetric
): number | null {
  if (!entry.prev) return null;
  const before = entry.prev[metric];
  if (!Number.isFinite(before) || before === 0) return null;
  return ((entry[metric] - before) / Math.abs(before)) * 100;
}

const RESEND_KEY_PREFIX = "resend:";

/** Synthetic group key for a resend item — keeps the (day, key) identity machinery working. */
export function resendGroupKey(campaignId: string): string {
  return `${RESEND_KEY_PREFIX}${campaignId}`;
}

/**
 * Wrap a resend source in a minimal ProductGroup so resend assignments flow
 * through the same calendar/day-list/persist plumbing as product assignments.
 */
export function buildResendGroup(source: ResendSource): ProductGroup {
  return {
    key: resendGroupKey(source.sourceCampaignId),
    slug: source.productNickname || source.subject || source.name,
    title: source.subject || source.name,
    description: null,
    bestImageUrl: source.imageUrl,
    images: source.imageUrl ? [source.imageUrl] : [],
    productIds: [],
    countries: source.countries,
    listings: [],
  };
}

export interface DayAssignment {
  /** Stable identity within the plan: `${dayKey}::${group.key}` (one of each product per day). */
  id: string;
  /** Local calendar day, "YYYY-MM-DD". */
  dayKey: string;
  group: ProductGroup;
  /** Countries this product is sent to. null = every available country. */
  countryCodes: string[] | null;
  /** null → inherit the shared default. */
  templateId: string | null;
  subject: string | null;
  preheader: string | null;
  /**
   * Per-product send time "HH:mm". The shared default is stamped on at save
   * time, so this is always set on saved items — changing the default later
   * only affects newly added emails. null only as a legacy fallback.
   */
  sendTime: string | null;
  /** null → inherit the shared mailing-list defaults. */
  mailingListOverrides: Record<string, string[]> | null;
  selectedImageUrl: string | null;
  priceOverride: string | null;
  status: ItemStatus;
  errorMessage?: string | null;
  /** Campaign created for this day once it's scheduled — powers the preview. */
  campaignId?: string | null;
  /** Server row id — present on items loaded from the plan (used to unschedule). */
  itemId?: string | null;
  /** Present when this day re-sends an existing campaign instead of generating one. */
  resend?: ResendSource | null;
}

export const DEFAULT_PLANNER_DEFAULTS: PlannerDefaults = {
  templateId: "",
  subject: "",
  preheader: "",
  sendTime: "09:00",
  senderName: "",
  mailingListOverrides: {},
};

/** Local "YYYY-MM-DD" for a date (planner days are local, not UTC). */
export function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local "HH:mm" for a date. */
export function localTimeKey(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Format an "HH:mm" string as a 12-hour label, e.g. "9:00 AM". */
export function formatTime12h(value: string): string {
  const [h, m] = (value || "09:00").split(":").map(Number);
  const hh = Number.isFinite(h) ? h : 9;
  const mm = Number.isFinite(m) ? m : 0;
  const period = hh < 12 ? "AM" : "PM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${period}`;
}

/** Stable per-day, per-product identity used as the React key + server match key. */
export function assignmentId(dayKey: string, groupKey: string): string {
  return `${dayKey}::${groupKey}`;
}

/** The send time this product actually goes out at (its stamped time, else the shared default). */
export function effectiveSendTime(
  item: DayAssignment,
  defaults: PlannerDefaults
): string {
  return item.sendTime ?? defaults.sendTime;
}

/** Group a flat list of assignments by day, each day sorted by effective send time. */
export function groupByDay(
  items: DayAssignment[],
  defaultSendTime: string
): Map<string, DayAssignment[]> {
  const map = new Map<string, DayAssignment[]>();
  for (const item of items) {
    const arr = map.get(item.dayKey);
    if (arr) arr.push(item);
    else map.set(item.dayKey, [item]);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) =>
      (a.sendTime ?? defaultSendTime).localeCompare(b.sendTime ?? defaultSendTime)
    );
  }
  return map;
}

/** Build a full ISO send datetime from a local day + "HH:mm" time. */
export function toSendDateISO(dayKey: string, sendTime: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const [hh, mm] = (sendTime || "09:00").split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0).toISOString();
}

/** Countries this group can actually be sent to (group listings ∩ eligible). */
export function availableCountries(
  group: ProductGroup,
  eligible: Set<string>
): string[] {
  return group.countries.filter((code) => eligible.has(code.toUpperCase()));
}

/**
 * A representative product-page URL for previewing the offer in a new tab.
 * Always prefers the Slovenian (SI) listing, then falls back to the first
 * listing that actually carries a landing-page URL.
 */
export function groupPreviewUrl(group: ProductGroup): string | null {
  const si = group.listings.find(
    (listing) => listing.url && (listing.countryCode ?? "").toUpperCase() === "SI"
  );
  if (si) return si.url;
  for (const listing of group.listings) {
    if (listing.url) return listing.url;
  }
  return null;
}

const LOCKED: ItemStatus[] = ["QUEUED", "GENERATING", "SCHEDULED"];
export function isLocked(status: ItemStatus): boolean {
  return LOCKED.includes(status);
}
