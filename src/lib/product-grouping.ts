/**
 * Cross-country product grouping.
 *
 * The same product is scraped from several country shops and stored as separate
 * `Product` rows (their `externalKey` differs per domain). Their titles share a
 * stable brand/offer code AFTER the `|` pipe, e.g.:
 *   "Vodootporni grijaći prsluk | FLAMEVEST 1+1 GRATIS"        (HR)
 *   "Водоустойчива загряваща жилетка | FLAMEVEST 1+1 БЕЗПЛАТНО" (BG)
 * Both belong to the same offer "FLAMEVEST 1+1". The trailing localized "free"
 * word (GRATIS / БЕЗПЛАТНО / …) varies per language and must be stripped so the
 * grouping key is identical across countries.
 *
 * The pre-pipe portion is the localized name and differs per country, so the
 * existing `normalizeTitle` (which keeps the pre-pipe part) is NOT usable here.
 */

import type { CampaignUrlRule } from "./product-links";

/** Localized "free / gratis" markers that may trail an offer code (Latin scripts). */
const FREE_WORDS = new Set([
  "gratis",
  "free",
  "kostenlos",
  "gratuit",
  "gratuite",
  "gratuito",
  "gratuita",
  "grátis",
  "omaggio",
  "ingyen",
  "ingyenes",
  "zdarma",
  "zadarmo",
  "besplatno",
  "brezplacno",
  "brezplačno",
  "gratisi",
  // Baltics
  "nemokamai",
  "nemokama",
  "nemokamas",
  "dovanu",
  "dovanų",
  "tasuta",
  "bezmaksas",
  // Polish (the "za" of "za darmo" is handled by the bundle backstop)
  "darmo",
  "darmowy",
  "darmowa",
  // Romanian / Turkish / Finnish
  "gratuită",
  "cadou",
  "ücretsiz",
  "bedava",
  "ilmainen",
  "ilmaiseksi",
]);

/** Matches any Greek or Cyrillic character — used to spot non-Latin trailing markers. */
const NON_LATIN_RE = /[Ͱ-ϿЀ-ԯ]/;

/** Offer-bundle token like "1+1" or "12+12" — what localized markers trail. */
const OFFER_BUNDLE_RE = /^\d+\+\d+$/;

/** Strip surrounding punctuation/whitespace from a single token. */
function cleanToken(token: string): string {
  return token.replace(/^[^\p{L}\p{N}+]+|[^\p{L}\p{N}+]+$/gu, "");
}

function isFreeWord(token: string): boolean {
  return FREE_WORDS.has(cleanToken(token).toLowerCase());
}

/**
 * Some languages write the marker as two words ("BEZ MAKSAS", "ZA DARMO") while
 * the dictionary stores the joined form ("bezmaksas", "zadarmo") — match the
 * pair by joining it.
 */
function isFreeWordPair(first: string, second: string): boolean {
  return FREE_WORDS.has(
    cleanToken(first).toLowerCase() + cleanToken(second).toLowerCase()
  );
}

function isNonLatinWord(token: string): boolean {
  return NON_LATIN_RE.test(token);
}

/**
 * Language-agnostic backstop for words the dictionary doesn't know: a purely
 * alphabetic token directly after an offer bundle ("BULBCAM 1+1 NEMOKAMAI") is
 * a localized marketing marker, never part of the offer code itself.
 */
function isWordAfterBundle(tokens: string[], index: number): boolean {
  if (index < 1) return false;
  const word = cleanToken(tokens[index]);
  return /^\p{L}+$/u.test(word) && OFFER_BUNDLE_RE.test(cleanToken(tokens[index - 1]));
}

/** Letters-only length of a cleaned token. */
function letterCount(token: string): number {
  return cleanToken(token).match(/\p{L}/gu)?.length ?? 0;
}

/** True when the cleaned token has no lowercase letters (caps words, digits, 1+1). */
function hasNoLowercase(token: string): boolean {
  const cleaned = cleanToken(token);
  return cleaned.length > 0 && !/\p{Ll}/u.test(cleaned);
}

/** Brand-like: an all-caps coined word of ≥3 letters, e.g. GRITSY, BULBCAM. */
function isBrandToken(token: string): boolean {
  return hasNoLowercase(token) && letterCount(token) >= 3;
}

/**
 * Pipe-less titles are localized sentences ending with the invented offer code:
 *   "Recortadora eléctrica de hoja en T GRITSY"          (ES)
 *   "Elektrinis skustuvas su T formos peiliukais GRITSY" (LT)
 * The sentence differs per country but the trailing code run doesn't — take it
 * (plus variant suffixes like LP or 1+1) as the key. Returns null when the tail
 * isn't clearly a code, so callers keep the full-title fallback. Must only be
 * called for mixed-case titles — in an all-caps title every token looks brandy.
 */
function extractTrailingOfferCode(tokens: string[]): string | null {
  let index = tokens.length - 1;
  // Walk over trailing variant suffixes (LP, 1+1, 4K…) to the code word itself.
  while (index >= 0 && hasNoLowercase(tokens[index]) && !isBrandToken(tokens[index])) {
    index--;
  }
  if (index < 0 || !isBrandToken(tokens[index])) return null;
  // Multi-word codes ("PEN POLISH LP") — extend over adjacent all-caps words.
  let start = index;
  while (start > 0 && isBrandToken(tokens[start - 1])) {
    start--;
  }
  return tokens.slice(start).join(" ");
}

/**
 * Derive the human-readable offer slug from a product title.
 *
 * Returns the brand/offer code after the first `|`, with trailing localized
 * "free" markers removed (e.g. "FLAMEVEST 1+1"). Falls back to the trimmed full
 * title when there is no pipe so such products still group with their twins.
 */
export function extractProductGroupSlug(title: string): string {
  const raw = (title ?? "").trim();
  if (!raw) return "";

  const pipeIndex = raw.indexOf("|");
  const afterPipe =
    pipeIndex >= 0 ? raw.slice(pipeIndex + 1).trim() : raw;

  if (!afterPipe) {
    // Title ended with the pipe — fall back to the whole title.
    return raw.replace(/\s+/g, " ");
  }

  const tokens = afterPipe.split(/\s+/).filter(Boolean);

  // Drop trailing localized "free" markers — known Latin words, non-Latin
  // tokens, or any word directly after a "1+1"-style bundle (the language-
  // agnostic backstop) — always keeping at least the first token.
  while (tokens.length > 1) {
    const last = tokens.length - 1;
    if (
      isFreeWord(tokens[last]) ||
      isNonLatinWord(tokens[last]) ||
      isWordAfterBundle(tokens, last)
    ) {
      tokens.pop();
    } else if (last >= 2 && isFreeWordPair(tokens[last - 1], tokens[last])) {
      // Two-word marker ("… 1+1 BEZ MAKSAS") — drop both halves at once.
      tokens.pop();
      tokens.pop();
    } else {
      break;
    }
  }

  // Pipe-less mixed-case titles: the localized sentence differs per country but
  // the trailing offer code doesn't — group on the code when one is present.
  // (All-caps titles keep the full-title key: every token there looks brandy.)
  if (pipeIndex < 0 && tokens.some((token) => /\p{Ll}/u.test(token))) {
    const code = extractTrailingOfferCode(tokens);
    if (code) return code;
  }

  return tokens.join(" ");
}

/** Normalize a slug into a stable matching key (uppercased, whitespace-collapsed). */
export function normalizeGroupKey(slug: string): string {
  return slug.replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * Slugify a value into a `utm_campaign` token: lowercased, spaces/dots → "-",
 * anything but [a-z0-9-] dropped. Lives here (a dependency-free leaf module) so
 * both the campaign-link builder and the report matcher share one definition.
 */
export function toUtmSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Display label for a stored (lowercased) category, e.g. "summer" → "Summer". */
export function categoryLabel(category: string): string {
  return category
    .split(/[\s-]+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** The grouping key for a product title. */
export function productGroupKey(title: string): string {
  return normalizeGroupKey(extractProductGroupSlug(title));
}

export interface GroupableListing {
  id: string;
  productId: string;
  countryCode: string | null;
  /** Per-country scraped title — used to show the offer's name in its own language. */
  title: string | null;
  /** Owning product's normalized title — for rebuilding campaign links (utm). */
  normalizedTitle: string | null;
  url: string;
  campaignUrl: string;
  /** Source's campaign-link rule, so consumers can rebuild URLs with a price. */
  campaignUrlRule?: CampaignUrlRule | null;
  slug: string | null;
  priceRaw: string | null;
  regularPrice: string | null;
  salePrice: string | null;
  currency: string | null;
  availability: string;
}

/** Trailing landing-page / duplicate-variant slug suffixes (e.g. -lp, -2, -3). */
const VARIANT_SLUG = /-(?:\d+|lp)$/i;

/**
 * From listings that belong to the same country, pick the single canonical one.
 * Offers often expose variant URLs (…-lp, …-2) that share a SKU; prefer the base
 * slug, then the shortest, so consumers target one product page per country.
 */
export function pickCanonicalListing<T extends { slug?: string | null }>(
  listings: T[]
): T {
  const base = listings.filter(
    (listing) => listing.slug && !VARIANT_SLUG.test(listing.slug)
  );
  const pool = base.length > 0 ? base : listings;
  return pool.reduce((best, current) =>
    (current.slug?.length ?? Infinity) < (best.slug?.length ?? Infinity)
      ? current
      : best
  );
}

export interface GroupableProduct {
  id: string;
  title: string;
  normalizedTitle: string;
  description: string | null;
  bestImageUrl: string | null;
  /** Shop category (lowercased), scraped or inherited from the main product. */
  category?: string | null;
  status: string;
  updatedAt?: string | null;
  lastSeenAt?: string | null;
  images: Array<{ url: string }>;
  listings: GroupableListing[];
}

export interface ProductGroup {
  /** Stable matching key (uppercased). */
  key: string;
  /** Human-readable offer slug, e.g. "FLAMEVEST 1+1". */
  slug: string;
  /** Representative localized title (from a member with the most data). */
  title: string;
  description: string | null;
  bestImageUrl: string | null;
  /** Shop category (lowercased) — first member that carries one. */
  category: string | null;
  /** Most relevant status across members (ACTIVE > POSSIBLY_UNAVAILABLE > ARCHIVED). */
  status: string;
  /** Most recent member updatedAt / lastSeenAt (ISO), for "recently synced" sorting. */
  updatedAt: string | null;
  lastSeenAt: string | null;
  /** Deduped image URLs across all member products. */
  images: string[];
  productIds: string[];
  /** Distinct country codes that have a listing in this group. */
  countries: string[];
  /** All listings across member products, deduped by URL. */
  listings: GroupableListing[];
}

/** Priority used to pick a group's representative status. */
const STATUS_RANK: Record<string, number> = {
  ACTIVE: 3,
  POSSIBLY_UNAVAILABLE: 2,
  ARCHIVED: 1,
};

/** Keep the later of two ISO timestamps (either may be null/undefined). */
function maxIso(a: string | null, b: string | null | undefined): string | null {
  if (!b) return a;
  if (!a) return b;
  return b > a ? b : a;
}

/** Does this product have a listing in the given (upper-cased) country? */
function isFromCountry(product: GroupableProduct, country: string): boolean {
  return product.listings.some(
    (listing) => (listing.countryCode ?? "").toUpperCase() === country
  );
}

/**
 * Group catalog products across countries by their offer slug.
 *
 * Each returned group aggregates the per-country listings of every member
 * product, so a planner can target one campaign at all of a product's countries.
 *
 * The displayed offer info (title, description, main image) is taken from the
 * highest-scoring member: a member in `preferredCountry` with an image wins, so
 * — when set to "SI" — Slovenian product info is shown wherever it exists, with
 * a graceful fallback to any member that has an image.
 */
export function groupProducts(
  products: GroupableProduct[],
  preferredCountry?: string
): ProductGroup[] {
  const preferred = preferredCountry?.toUpperCase();
  const groups = new Map<string, ProductGroup>();
  // Score of the member currently chosen as each group's representative.
  const repScore = new Map<string, number>();
  // Score of the member whose description is currently shown.
  const descRank = new Map<string, number>();

  const scoreOf = (product: GroupableProduct) =>
    (preferred && isFromCountry(product, preferred) ? 2 : 0) +
    (product.bestImageUrl ? 1 : 0);

  // Description is chosen independently of the representative: the text lives
  // only on the Product row (listings carry no description), and legacy merged
  // rows hold last-synced-country text. Prefer a member whose row is truly the
  // preferred country's (its listings are only there), then any member with a
  // preferred-country listing, then any non-empty description at all.
  const descScoreOf = (product: GroupableProduct): number => {
    if (!product.description?.trim()) return 0;
    if (!preferred) return 1;
    const countries = new Set(
      product.listings
        .map((listing) => (listing.countryCode ?? "").toUpperCase())
        .filter(Boolean)
    );
    if (!countries.has(preferred)) return 1;
    return countries.size === 1 ? 3 : 2;
  };

  for (const product of products) {
    const slug = extractProductGroupSlug(product.title) || product.title.trim();
    const key = normalizeGroupKey(slug) || product.id;
    const score = scoreOf(product);

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        slug,
        title: product.title,
        description: null,
        bestImageUrl: product.bestImageUrl,
        category: product.category ?? null,
        status: product.status,
        updatedAt: product.updatedAt ?? null,
        lastSeenAt: product.lastSeenAt ?? null,
        images: [],
        productIds: [],
        countries: [],
        listings: [],
      };
      groups.set(key, group);
      repScore.set(key, score);
    } else if (score > (repScore.get(key) ?? -1)) {
      // A better representative (e.g. the SI member) — take its info.
      group.title = product.title;
      if (product.bestImageUrl) group.bestImageUrl = product.bestImageUrl;
      repScore.set(key, score);
    }

    const descScore = descScoreOf(product);
    if (descScore > (descRank.get(key) ?? 0)) {
      group.description = product.description;
      descRank.set(key, descScore);
    }

    group.productIds.push(product.id);

    // Representative status = highest-priority member status.
    if ((STATUS_RANK[product.status] ?? 0) > (STATUS_RANK[group.status] ?? 0)) {
      group.status = product.status;
    }
    group.updatedAt = maxIso(group.updatedAt, product.updatedAt);
    group.lastSeenAt = maxIso(group.lastSeenAt, product.lastSeenAt);

    // Fill a missing main image from any member that has one.
    if (!group.bestImageUrl && product.bestImageUrl) {
      group.bestImageUrl = product.bestImageUrl;
    }

    // Fill a missing category from any member that has one.
    if (!group.category && product.category) {
      group.category = product.category;
    }

    const seenImages = new Set(group.images);
    if (product.bestImageUrl && !seenImages.has(product.bestImageUrl)) {
      group.images.push(product.bestImageUrl);
      seenImages.add(product.bestImageUrl);
    }
    for (const image of product.images) {
      if (image.url && !seenImages.has(image.url)) {
        group.images.push(image.url);
        seenImages.add(image.url);
      }
    }

    const seenUrls = new Set(group.listings.map((listing) => listing.url));
    for (const listing of product.listings) {
      if (!seenUrls.has(listing.url)) {
        group.listings.push(listing);
        seenUrls.add(listing.url);
      }
    }
  }

  for (const group of groups.values()) {
    // Distinct, sorted country list per group.
    group.countries = Array.from(
      new Set(
        group.listings
          .map((listing) => listing.countryCode)
          .filter((code): code is string => Boolean(code))
      )
    ).sort();
    // Prefer the preferred country's own listing title — covers offers stored as
    // a single merged product row (where Product.title is last-writer-wins but
    // each listing keeps its localized title).
    if (preferred) {
      const preferredListing = group.listings.find(
        (listing) =>
          (listing.countryCode ?? "").toUpperCase() === preferred &&
          listing.title &&
          listing.title.trim()
      );
      if (preferredListing?.title) group.title = preferredListing.title.trim();
    }
    // Keep the chosen (preferred) main image first in the gallery.
    if (group.bestImageUrl) {
      group.images = [
        group.bestImageUrl,
        ...group.images.filter((url) => url !== group.bestImageUrl),
      ];
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.slug.localeCompare(b.slug));
}
