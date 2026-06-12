import type { ProductGroup } from "@/lib/product-grouping";

export type { ProductGroup };
export { categoryLabel } from "@/lib/product-grouping";

export interface GroupedResponse {
  groups: ProductGroup[];
  total: number;
  page: number;
  pageSize: number;
  facets: {
    countries: string[];
    categories: string[];
    counts: Record<string, number>;
  };
}

/** Status filter chips (values map to the grouped API's `status` param). */
export const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "POSSIBLY_UNAVAILABLE", label: "Needs review" },
  { value: "ARCHIVED", label: "Archived" },
] as const;

export const SORT_OPTIONS = [
  { value: "recent", label: "Recently synced" },
  { value: "title", label: "Name (A–Z)" },
  { value: "countries", label: "Most countries" },
];

/** Short, human label for a product status. */
export function statusLabel(status: string): string {
  if (status === "ACTIVE") return "Active";
  if (status === "POSSIBLY_UNAVAILABLE") return "Needs review";
  if (status === "ARCHIVED") return "Archived";
  return status;
}

/** Regional-indicator flag for an ISO-3166 alpha-2 code (best effort). */
export function flagEmoji(code: string | null | undefined): string {
  if (!code || code.length !== 2 || !/^[a-zA-Z]{2}$/.test(code)) return "🌐";
  const base = 127397; // 'A' (65) → 🇦 (127462)
  return code
    .toUpperCase()
    .replace(/[A-Z]/g, (char) => String.fromCodePoint(base + char.charCodeAt(0)));
}

/** Best displayable price for a listing — sale first, then regular, then raw. */
export function listingPrice(listing: {
  salePrice: string | null;
  regularPrice: string | null;
  priceRaw: string | null;
  currency: string | null;
}): string | null {
  const amount = listing.salePrice || listing.regularPrice;
  if (amount) {
    return listing.currency ? `${amount} ${listing.currency}` : amount;
  }
  return listing.priceRaw || null;
}
