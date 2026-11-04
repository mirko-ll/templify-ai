import { DEFAULT_WEIGHTS, defaultRotation, normalizeRotation, weightsFromRotation } from "./rotation";
import { DEFAULT_SEASONS } from "./seasons";
import { localDateOf, mondayOf } from "./time";
import {
  BUCKETS,
  type AutopilotDefaults,
  type AutopilotRules,
  type AutopilotSettings,
  type Bucket,
  type IntelMapping,
  type Season,
} from "./types";

export const DEFAULT_TIMEZONE = "Europe/Ljubljana";
export const DEFAULT_SLOT_TIMES = ["08:00", "17:00"];

export const DEFAULT_RULES: AutopilotRules = {
  noRepeatDays: 10,
  bestMaxPerMonth: 2,
  prefillDays: 7,
  lockDaysBefore: 2,
  newWindowDays: 21,
  newMaxTests: 2,
  minInStockCountryShare: 0.6,
  priceRatio: null,
  minMarginPct: 30,
  priceTests: true,
  priceTestStepPct: 10,
};

export const EMPTY_DEFAULTS: AutopilotDefaults = {
  templateId: null,
  subject: "",
  preheader: "",
  senderName: "",
  mailingListOverrides: {},
};

/** The stored shape of an AutopilotConfig row (JSON columns as `unknown`). */
export interface StoredAutopilotConfig {
  timezone: string;
  slotTimes: unknown;
  rotation: unknown;
  rotationStart: Date;
  weights: unknown;
  rules: unknown;
  seasons: unknown;
  intel: unknown;
  defaults: unknown;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function normalizeSlotTimes(raw: unknown): string[] {
  const times = Array.isArray(raw)
    ? raw.filter((t): t is string => typeof t === "string" && TIME_RE.test(t))
    : [];
  return times.length ? [...new Set(times)].sort() : [...DEFAULT_SLOT_TIMES];
}

export function normalizeRules(raw: unknown): AutopilotRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    noRepeatDays: num(r.noRepeatDays, DEFAULT_RULES.noRepeatDays, 0, 60),
    bestMaxPerMonth: num(r.bestMaxPerMonth, DEFAULT_RULES.bestMaxPerMonth, 1, 31),
    prefillDays: num(r.prefillDays, DEFAULT_RULES.prefillDays, 1, 21),
    lockDaysBefore: num(r.lockDaysBefore, DEFAULT_RULES.lockDaysBefore, 1, 7),
    newWindowDays: num(r.newWindowDays, DEFAULT_RULES.newWindowDays, 1, 90),
    newMaxTests: num(r.newMaxTests, DEFAULT_RULES.newMaxTests, 1, 10),
    minInStockCountryShare: num(r.minInStockCountryShare, DEFAULT_RULES.minInStockCountryShare, 0, 1),
    priceRatio:
      r.priceRatio === null || r.priceRatio === undefined || r.priceRatio === ""
        ? null
        : num(r.priceRatio, 0.5, 0.05, 1.5),
    minMarginPct: num(r.minMarginPct, DEFAULT_RULES.minMarginPct, 0, 90),
    priceTests: typeof r.priceTests === "boolean" ? r.priceTests : DEFAULT_RULES.priceTests,
    priceTestStepPct: num(r.priceTestStepPct, DEFAULT_RULES.priceTestStepPct, 1, 50),
  };
}

export function normalizeSeasons(raw: unknown): Season[] {
  if (!Array.isArray(raw)) return DEFAULT_SEASONS;
  const out: Season[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const name = typeof s.name === "string" && s.name.trim() ? s.name.trim() : null;
    const tags = Array.isArray(s.tags)
      ? s.tags.filter((t): t is string => typeof t === "string" && !!t.trim()).map((t) => t.trim().toLowerCase())
      : [];
    if (!name || !tags.length) continue;
    const boost =
      s.boost === null || s.boost === undefined || s.boost === "" ? {} : { boost: num(s.boost, 0, 0, 100) };
    if (Array.isArray(s.easterOffset) && s.easterOffset.length === 2) {
      out.push({ name, tags, easterOffset: [num(s.easterOffset[0], -21, -90, 90), num(s.easterOffset[1], 0, -90, 90)], ...boost });
    } else if (typeof s.from === "string" && typeof s.to === "string" && /^\d{2}-\d{2}$/.test(s.from) && /^\d{2}-\d{2}$/.test(s.to)) {
      out.push({ name, tags, from: s.from, to: s.to, ...boost });
    }
  }
  return out;
}

export function normalizeIntel(raw: unknown): IntelMapping {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    ownBrandId: typeof r.ownBrandId === "string" && r.ownBrandId ? r.ownBrandId : null,
    competitorBrandIds: Array.isArray(r.competitorBrandIds)
      ? [...new Set(r.competitorBrandIds.filter((id): id is string => typeof id === "string" && !!id))]
      : [],
  };
}

export function normalizeDefaults(raw: unknown): AutopilotDefaults {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const lists: Record<string, string[]> = {};
  if (r.mailingListOverrides && typeof r.mailingListOverrides === "object") {
    for (const [code, ids] of Object.entries(r.mailingListOverrides as Record<string, unknown>)) {
      if (Array.isArray(ids)) {
        const clean = ids.filter((id): id is string => typeof id === "string" && !!id.trim());
        if (clean.length) lists[code.toUpperCase()] = clean;
      }
    }
  }
  return {
    templateId: typeof r.templateId === "string" && r.templateId ? r.templateId : null,
    subject: typeof r.subject === "string" ? r.subject : "",
    preheader: typeof r.preheader === "string" ? r.preheader : "",
    senderName: typeof r.senderName === "string" ? r.senderName : "",
    mailingListOverrides: lists,
  };
}

export function normalizeWeights(raw: unknown, rotation: Bucket[][][]): Record<Bucket, number> {
  const implied = weightsFromRotation(rotation);
  if (!raw || typeof raw !== "object") return implied;
  const r = raw as Record<string, unknown>;
  const out = {} as Record<Bucket, number>;
  for (const bucket of BUCKETS) out[bucket] = Math.round(num(r[bucket], implied[bucket], 0, 100));
  return out;
}

/** Turn a stored config row into engine settings, filling every gap with a default. */
export function settingsFromStored(row: StoredAutopilotConfig): AutopilotSettings {
  const timezone = row.timezone || DEFAULT_TIMEZONE;
  const slotTimes = normalizeSlotTimes(row.slotTimes);
  const rotation = normalizeRotation(row.rotation, slotTimes.length);
  return {
    timezone,
    slotTimes,
    rotation,
    rotationStart: row.rotationStart.toISOString().slice(0, 10),
    weights: normalizeWeights(row.weights, rotation),
    rules: normalizeRules(row.rules),
    seasons: normalizeSeasons(row.seasons),
    intel: normalizeIntel(row.intel),
    defaults: normalizeDefaults(row.defaults),
  };
}

/** Settings for a client that has no config yet: the boss's formula, rotation starting this week. */
export function defaultSettings(
  now: Date,
  defaults: AutopilotDefaults = EMPTY_DEFAULTS,
  intel: IntelMapping = { ownBrandId: null, competitorBrandIds: [] }
): AutopilotSettings {
  const rotation = defaultRotation(DEFAULT_SLOT_TIMES.length);
  return {
    timezone: DEFAULT_TIMEZONE,
    slotTimes: [...DEFAULT_SLOT_TIMES],
    rotation,
    rotationStart: mondayOf(localDateOf(now, DEFAULT_TIMEZONE)),
    weights: { ...DEFAULT_WEIGHTS },
    rules: { ...DEFAULT_RULES },
    seasons: DEFAULT_SEASONS,
    intel,
    defaults,
  };
}
