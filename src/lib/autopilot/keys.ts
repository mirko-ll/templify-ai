/**
 * The product a group key is about, without its offer suffix: "BUGBUSTER 1+1",
 * "REUSEFO 30+30" and "BUGBUSTER" are all `BUGBUSTER`. Repeat and monthly-cap
 * rules count on this key so a 1+1 offer is the same product as the single.
 * Competitor-intel tokens ("bugbuster") normalize to the same value.
 */
export function baseKeyOf(groupKeyOrToken: string): string {
  return groupKeyOrToken
    .toUpperCase()
    .replace(/\s*\d+\s*\+\s*\d+\s*$/u, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Normalize a listing or intel slug for matching (decoded, lowercased, no trailing slash). */
export function normalizeSlug(slug: string): string {
  let value = slug.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // keep the raw slug
  }
  return value.toLowerCase().replace(/\/+$/, "");
}
