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
}

export interface ProductGroup {
  key: string;
  slug: string;
  title: string;
  description: string | null;
  bestImageUrl: string | null;
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
  /** Per-product send time "HH:mm". null → inherit the shared default send time. */
  sendTime: string | null;
  /** null → inherit the shared mailing-list defaults. */
  mailingListOverrides: Record<string, string[]> | null;
  selectedImageUrl: string | null;
  priceOverride: string | null;
  status: ItemStatus;
  errorMessage?: string | null;
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

/** The send time this product actually goes out at (its own override, else the shared default). */
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

const LOCKED: ItemStatus[] = ["QUEUED", "GENERATING", "SCHEDULED"];
export function isLocked(status: ItemStatus): boolean {
  return LOCKED.includes(status);
}
