import { addDays, daysBetween } from "./time";
import type { Season } from "./types";

export const DEFAULT_SEASONS: Season[] = [
  { name: "Christmas", tags: ["x-mas", "xmas", "google_xmas", "festive"], from: "11-01", to: "12-23", boost: 20 },
  { name: "Summer", tags: ["summer"], from: "05-20", to: "08-20" },
  { name: "Easter", tags: ["easter-sale"], easterOffset: [-21, 0] },
];

/** Western (Gregorian) Easter Sunday of `year`, as YYYY-MM-DD. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Is `season` running on local date `date` (YYYY-MM-DD)? */
export function isSeasonActive(season: Season, date: string): boolean {
  if ("easterOffset" in season) {
    const easter = easterSunday(Number(date.slice(0, 4)));
    const [from, to] = season.easterOffset;
    const offset = daysBetween(easter, date);
    return offset >= from && offset <= to;
  }
  const md = date.slice(5);
  return season.from <= season.to
    ? md >= season.from && md <= season.to
    : md >= season.from || md <= season.to; // wraps the year end, e.g. 12-01 → 01-06
}

export function activeSeasons(seasons: Season[], date: string): Season[] {
  return seasons.filter((season) => isSeasonActive(season, date));
}

/** Every tag that belongs to some configured season. */
export function seasonalTags(seasons: Season[]): Set<string> {
  return new Set(seasons.flatMap((season) => season.tags.map((tag) => tag.toLowerCase())));
}

/**
 * Seasons a product with `tags` belongs to, split into running and not running
 * on `date`. A product only in off-season seasons is excluded from every bucket.
 */
export function seasonStatus(
  tags: string[],
  seasons: Season[],
  date: string
): { inSeason: Season[]; offSeason: Season[] } {
  const own = new Set(tags.map((tag) => tag.toLowerCase()));
  const inSeason: Season[] = [];
  const offSeason: Season[] = [];
  for (const season of seasons) {
    if (!season.tags.some((tag) => own.has(tag.toLowerCase()))) continue;
    (isSeasonActive(season, date) ? inSeason : offSeason).push(season);
  }
  return { inSeason, offSeason };
}

/** True when the product belongs to a season and none of its seasons is running. */
export function isOffSeason(tags: string[], seasons: Season[], date: string): boolean {
  const { inSeason, offSeason } = seasonStatus(tags, seasons, date);
  return offSeason.length > 0 && inSeason.length === 0;
}

/** Any season running on any of the next `days` local dates from `date`? */
export function anySeasonWithin(seasons: Season[], date: string, days: number): boolean {
  for (let i = 0; i <= days; i++) {
    if (activeSeasons(seasons, addDays(date, i)).length > 0) return true;
  }
  return false;
}
