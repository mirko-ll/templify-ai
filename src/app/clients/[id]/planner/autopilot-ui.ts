// Shapes and formatting shared by the planner's Autopilot board, detail pane
// and swap dialog. Data comes from GET /api/clients/:id/autopilot/week.

import type { Bucket } from "@/components/autopilot/buckets";

export type SlotState = "PROPOSED" | "APPROVED" | "SKIPPED" | "EMPTY" | "LOCKED";

export interface ShopPage {
  countryCode: string;
  url: string;
  title: string | null;
  price: string | null;
  inStock: boolean;
}

export interface ProductDetail {
  title: string;
  description: string | null;
  images: string[];
  category: string | null;
  pages: ShopPage[];
}

export interface Option {
  /** Set when a stored alternative no longer passes the rules (re-checked live). */
  blocked?: string | null;
  groupKey: string;
  bucket: Bucket;
  title: string;
  imageUrl: string | null;
  countryCodes: string[];
  signals: Record<string, any>;
  reason: string;
  price: string | null;
  priceSuggested: boolean;
}

export interface Pricing {
  price: string | null;
  suggested: boolean;
  base: string | null;
  floor: number | null;
  cost: number | null;
  costMonth: string | null;
  raisedToFloor: boolean;
  test: { base: string; test: string; stepPct: number } | null;
}

export interface CountryStats {
  countryCode: string;
  sent: number;
  opens: number;
  clicks: number;
}

export interface SlotEvent {
  at: string;
  type: string;
  detail: string;
}

export interface Slot {
  id: string;
  date: string;
  slotIndex: number;
  sendAt: string;
  plannedBucket: Bucket;
  bucket: Bucket;
  state: SlotState;
  groupKey: string | null;
  pickedBy: "AUTOPILOT" | "USER";
  reason: string | null;
  signals:
    | (Record<string, any> & {
        product?: { title: string; imageUrl: string | null; category: string | null; countryCodes: string[] };
        pricing?: Pricing;
      })
    | null;
  alternatives: Option[] | null;
  priceOverride: string | null;
  priceSuggested: boolean;
  shadow: boolean;
  autoApproved: boolean;
  approvedAt: string | null;
  events: SlotEvent[] | null;
  detail: ProductDetail | null;
  item: {
    id: string;
    status: string;
    campaignId: string | null;
    errorMessage: string | null;
    priceOverride: string | null;
    stats: CountryStats[];
  } | null;
}

export interface ManualItem {
  id: string;
  groupKey: string | null;
  sendDate: string;
  status: string;
  title: string | null;
  imageUrl: string | null;
  priceOverride: string | null;
  campaignId: string | null;
}

export interface Day {
  date: string;
  lockAt: string;
  slots: Slot[];
  items: ManualItem[];
}

export interface Run {
  id: string;
  kind: string;
  status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface WeekData {
  mode: "OFF" | "SHADOW" | "ON";
  timezone: string;
  today: string;
  now: string;
  days: Day[];
  runs: Run[];
}

export const compact = (n: unknown) => {
  if (typeof n !== "number") return "–";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
};

export const euro = (n: unknown) => (typeof n === "number" ? `€${Math.round(n).toLocaleString("en-US")}` : "–");

export function dayLabel(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

export function shortDate(iso: string | null | undefined) {
  return iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "–";
}

export function monthShort(ym: string) {
  return new Date(`${ym}-01T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
}

export function timeLabel(iso: string, timeZone: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
}

export function untilLabel(iso: string, now: number) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${Math.max(hours, 1)}h`;
}

/** Events written by the slot's latest pick (they share its timestamp) — older history excluded. */
export function latestEvents(slot: Slot): SlotEvent[] {
  const events = slot.events ?? [];
  const last = events.reduce<string>((max, e) => (e.at > max ? e.at : max), "");
  return events.filter((e) => e.at === last);
}

export function boostNote(slot: Slot): string | null {
  return latestEvents(slot).find((e) => e.type === "SEASON_BOOST")?.detail ?? null;
}

export type SlotStatus = "proposed" | "approved" | "yours" | "auto" | "locked" | "generating" | "scheduled" | "failed" | "skipped" | "empty";

export function slotStatus(slot: Slot): SlotStatus {
  if (slot.item?.status === "FAILED") return "failed";
  if (slot.item?.status === "SCHEDULED") return "scheduled";
  if (slot.item && ["QUEUED", "GENERATING"].includes(slot.item.status)) return "generating";
  if (slot.state === "SKIPPED") return "skipped";
  if (slot.state === "EMPTY") return "empty";
  if (slot.state === "LOCKED") return slot.autoApproved ? "auto" : "locked";
  if (slot.state === "APPROVED") return slot.pickedBy === "USER" ? "yours" : "approved";
  return "proposed";
}

export const STATUS_LABEL: Record<SlotStatus, string> = {
  proposed: "Waiting for you",
  approved: "Approved",
  yours: "Your pick",
  auto: "Auto-approved",
  locked: "Locked",
  generating: "Generating",
  scheduled: "Scheduled",
  failed: "Failed",
  skipped: "Skipped",
  empty: "No pick",
};

/** True while the boss can still change the slot. */
export function isEditable(slot: Slot) {
  return slot.state !== "LOCKED" && !(slot.item && slot.item.status !== "PLANNED");
}

const EVENT_LABEL: Record<string, string> = {
  REPLACED: "Replaced",
  REPLACED_OOS: "Replaced — sold out",
  FALLBACK: "Fell back",
  USER_SWAP: "Swapped",
  SKIPPED: "Skipped",
  REBUCKET: "Bucket changed",
  SEASON_BOOST: "Season",
  PRICE_TEST: "Price test",
};

export function eventLabel(type: string) {
  return EVENT_LABEL[type] ?? type.toLowerCase();
}

/** A run's error text in the boss's words (the raw text stays in the tooltip). */
export function humanizeRunError(error: string | null): string | null {
  if (!error) return null;
  // Database errors are long technical dumps — summarise them (the full text stays in the tooltip).
  if (/Invalid `[^`]*` invocation|PrismaClient/.test(error)) {
    return "The last run stopped on a database error — run it again; if it repeats, the server may need a restart.";
  }
  const lines = error.split("\n").map((line) => {
    if (/OADMIN_INTEL_URL|OADMIN_INTEL_API_KEY/.test(line)) return "Competitor intel isn't connected yet — using the last stored data.";
    if (/^intel:/.test(line)) return "Competitor intel couldn't be updated — using the last stored data.";
    if (/SqualoMail is not connected/.test(line)) return "SqualoMail isn't connected, so nothing was generated.";
    if (/stock refresh failed/.test(line)) return "The stock check didn't finish — the last known stock was used.";
    if (/Autopilot is off/.test(line)) return "The Autopilot is off for this client.";
    if (/^stats:/.test(line)) return "Email results couldn't be fetched from SqualoMail — price tests wait for the next night.";
    if (/^price tests:/.test(line)) return "Price tests couldn't be checked this time — they're checked again tonight.";
    return line.replace(/^(lock|intel): /, "");
  });
  return [...new Set(lines)].join(" ");
}
