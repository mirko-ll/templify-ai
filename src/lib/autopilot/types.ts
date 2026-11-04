// Shared types for the email Autopilot: the per-client settings, the data the
// picking engine reads, and what it produces. Everything here is plain data so
// the engine can run against Prisma (the app) or a raw read-only connection
// (scripts/autopilot-dry-run.ts) alike.

export const BUCKETS = ["BEST_SELLER", "NEW_PRODUCT", "FB_WINNER", "SEASONAL", "DISCOVERY"] as const;
export type Bucket = (typeof BUCKETS)[number];

export const BUCKET_LABELS: Record<Bucket, string> = {
  BEST_SELLER: "Best seller",
  NEW_PRODUCT: "New product",
  FB_WINNER: "FB winner",
  SEASONAL: "Seasonal",
  DISCOVERY: "Discovery",
};

export interface AutopilotRules {
  /** No product (baseKey) within this many days of another send of it. */
  noRepeatDays: number;
  /** A product goes out at most this often per calendar month. */
  bestMaxPerMonth: number;
  /** Days ahead that are kept filled. */
  prefillDays: number;
  /** A day is locked and generated this many days before sending. */
  lockDaysBefore: number;
  /** A shop product counts as new for this many days after it first appears. */
  newWindowDays: number;
  /** A "new" product that has gone out this often without becoming a best seller leaves the pool. */
  newMaxTests: number;
  /** Share of the client's countries that must have the product in stock. */
  minInStockCountryShare: number;
  /** Email price ÷ shop price for never-emailed products; null = learn it from past items. */
  priceRatio: number | null;
  /** Never price an email below cost + this margin (percent of the price); 0 = no floor. */
  minMarginPct: number;
  /** Try slightly higher prices on best sellers and keep them when clicks hold up. */
  priceTests: boolean;
  /** How much higher a test price is (percent, at least €1). */
  priceTestStepPct: number;
}

/**
 * `boost`: share of ALL sends (percent) that go to seasonal products while the
 * season runs — e.g. Christmas 20 raises seasonal from the grid's ~5% to ~20%.
 */
export type Season =
  | { name: string; tags: string[]; from: string; to: string; boost?: number } // "MM-DD", may wrap the year end
  | { name: string; tags: string[]; easterOffset: [number, number]; boost?: number }; // days relative to Easter Sunday

export interface IntelMapping {
  ownBrandId: string | null;
  competitorBrandIds: string[];
}

export interface AutopilotDefaults {
  templateId: string | null;
  subject: string;
  preheader: string;
  senderName: string;
  mailingListOverrides: Record<string, string[]>;
}

export interface AutopilotSettings {
  timezone: string;
  /** Local "HH:mm" send times, one per daily slot. */
  slotTimes: string[];
  /** rotation[week 0-3][day 0-6, Monday first][slot] */
  rotation: Bucket[][][];
  /** Local YYYY-MM-DD of the Monday that starts rotation week 1. */
  rotationStart: string;
  weights: Record<Bucket, number>;
  rules: AutopilotRules;
  seasons: Season[];
  intel: IntelMapping;
  defaults: AutopilotDefaults;
}

/** One sellable product group of the client, with what the engine needs to judge it. */
export interface CatalogGroup {
  groupKey: string;
  baseKey: string;
  title: string;
  imageUrl: string | null;
  /** Best member status: ACTIVE > POSSIBLY_UNAVAILABLE > ARCHIVED. */
  status: string;
  /** Lowercased categories across members (category + scraped category list). */
  tags: string[];
  /** Main category, for "don't send two kitchen products on one day". */
  category: string | null;
  firstSeenAt: Date;
  /** Countries with at least one IN_STOCK listing. */
  inStockCountries: string[];
  /** Median EUR shop price across in-stock EUR listings (for suggested prices). */
  refPriceEur: number | null;
  /** Listing slugs (lowercased, decoded), for matching competitor-intel slugs. */
  slugs: string[];
}

/** A send that already exists or is planned — used by the no-repeat and monthly-cap rules. */
export interface SendRecord {
  baseKey: string;
  groupKey: string;
  sendAt: Date;
  /** ITEM = a CampaignPlanItem; SLOT = an Autopilot pick without an item (shadow mode). */
  source: "ITEM" | "SLOT";
}

export interface ReportEntry {
  year: number;
  month: number;
  groupKey: string;
  profit: number;
  orders: number;
  revenue?: number;
}

/** One sent email of a product with its SqualoMail results (all countries summed). */
export interface ClickRecord {
  sendAt: Date;
  price: number | null;
  sent: number;
  clicks: number;
}

export interface PriceTestState {
  /** baseKeys with a test running (sent, not judged yet). */
  active: Set<string>;
  /** baseKeys judged in the last 30 days — no new test yet. */
  recent: Set<string>;
  /** groupKey → price to go back to after a failed test. */
  revertedTo: Map<string, string>;
}

/** A competitor-intel product (oadmin export row), after matching to the client catalog. */
export interface IntelProduct {
  brandId: string;
  brandName: string;
  isOwnBrand: boolean;
  productKey: string;
  token: string | null;
  name: string | null;
  baseKey: string | null;
  groupKey: string | null;
  activeAds: number;
  totalAds: number;
  newAds7d: number;
  newAds30d: number;
  reach: number;
  reach7d: number;
  score: number;
  listedSince: Date | null;
  listedSinceSource: string | null;
  firstAdAt: Date | null;
  lastAdAt: Date | null;
  imageUrl: string | null;
}

export interface EngineInput {
  now: Date;
  settings: AutopilotSettings;
  /** Countries the client actually sends to (active + mailing list). */
  eligibleCountries: string[];
  groups: CatalogGroup[];
  sends: SendRecord[];
  reports: ReportEntry[];
  intel: IntelProduct[];
  /** Client's first product sync — products first seen right after it aren't "new". */
  firstSyncAt: Date | null;
  /** Last email price per groupKey (a 1+1 offer has its own price). */
  lastPrices: Map<string, { price: string; groupKey: string; at: Date }>;
  /** Past email prices with the group's shop price, for learning the price ratio. */
  priceSamples: Array<{ price: number; refPriceEur: number }>;
  /** groupKey → cost per order in email-price euros, from the latest usable sales report month. */
  costs: Map<string, { cost: number; month: string }>;
  /** baseKey → its sent emails with click results (from stored SqualoMail stats). */
  clickHistory: Map<string, ClickRecord[]>;
  priceTests: PriceTestState;
}

export type Signals = Record<string, unknown>;

export interface Candidate {
  bucket: Bucket;
  groupKey: string;
  baseKey: string;
  score: number;
  signals: Signals;
}

export interface SlotRequest {
  date: string; // local YYYY-MM-DD
  slotIndex: number;
  sendAt: Date;
  /** Use this bucket instead of the rotation's (a user "change bucket"). */
  forceBucket?: Bucket;
}

export interface ShortlistEntry extends Candidate {
  title: string;
  imageUrl: string | null;
  category: string | null;
  countryCodes: string[];
}

export interface SlotPick {
  slot: SlotRequest;
  plannedBucket: Bucket;
  bucket: Bucket;
  /** Ranked, constraint-checked options; [0] is the deterministic choice. */
  shortlist: ShortlistEntry[];
  events: Array<{ type: string; detail: string }>;
}

/** How an email price came about — shown to the boss next to the price. */
export interface Pricing {
  price: string | null;
  suggested: boolean;
  /** The price before floor / test adjustments. */
  base: string | null;
  floor: number | null;
  cost: number | null;
  costMonth: string | null;
  raisedToFloor: boolean;
  test: { base: string; test: string; stepPct: number } | null;
}

export interface Alternative extends ShortlistEntry {
  reason: string;
  price: string | null;
  priceSuggested: boolean;
}

export interface FinalPick extends SlotPick {
  choice: ShortlistEntry | null;
  reason: string | null;
  alternatives: Alternative[];
  price: string | null;
  priceSuggested: boolean;
  pricing: Pricing | null;
}
