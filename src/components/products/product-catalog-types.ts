import type { ProductSourceConfig } from "@/lib/product-source-config";

export type { ProductSourceConfig };

export interface ProductSyncRun {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  discoveredCount: number;
  createdCount: number;
  updatedCount: number;
  missingCount: number;
  failedCount: number;
  errorMessage?: string | null;
}

export interface ProductSource {
  id: string;
  name: string | null;
  url: string;
  countryCode: string | null;
  crawlDepth: number;
  isEnabled: boolean;
  config: ProductSourceConfig | null;
  lastSyncedAt: string | null;
  syncRuns: ProductSyncRun[];
}

export interface ProductListing {
  id: string;
  countryCode: string | null;
  url: string;
  priceRaw: string | null;
  regularPrice: string | null;
  salePrice: string | null;
  currency: string | null;
  availability: string;
}

export interface ProductImage {
  id: string;
  url: string;
  rank: number;
}

export interface Product {
  id: string;
  title: string;
  description: string | null;
  bestImageUrl: string | null;
  status: string;
  lastSeenAt: string | null;
  listings: ProductListing[];
  images: ProductImage[];
}

export interface CampaignPlan {
  id: string;
  name: string;
  month: number;
  year: number;
  mode: "MANUAL" | "ASSISTED";
  status: string;
  items: Array<{
    id: string;
    type: string;
    /** Denormalized product data captured at plan time (title is SI-preferred). */
    productSnapshot?: {
      title?: string | null;
      slug?: string | null;
    } | null;
    product?: {
      id: string;
      title: string;
      bestImageUrl: string | null;
    } | null;
  }>;
}

export interface SourceFormState {
  name: string;
  url: string;
  countryCode: string;
  campaignUrlTemplate: string;
  countryCampaignUrlTemplates: string;
  domainCampaignUrlTemplates: string;
  defaultPrice: string;
}

export const defaultSourceForm: SourceFormState = {
  name: "",
  url: "",
  countryCode: "",
  campaignUrlTemplate: "",
  countryCampaignUrlTemplates: "",
  domainCampaignUrlTemplates: "",
  defaultPrice: "",
};

/** Parse "KEY=value" lines into a record, transforming each key. */
export function parseTemplateOverrides(
  value: string,
  transformKey: (key: string) => string
): Record<string, string> {
  return Object.fromEntries(
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex === -1) return null;
        const key = transformKey(line.slice(0, separatorIndex).trim());
        const template = line.slice(separatorIndex + 1).trim();
        return key && template ? [key, template] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry))
  );
}

/** Render a "{ KEY: value }" map as editable "KEY=value" lines. */
export function recordToLines(record: Record<string, string> | undefined | null): string {
  if (!record) return "";
  return Object.entries(record)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

/** Split a textarea of one-value-per-line into a trimmed, non-empty array. */
export function linesToArray(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Render an array as one-value-per-line text for a textarea. */
export function arrayToLines(value: string[] | undefined | null): string {
  return Array.isArray(value) ? value.join("\n") : "";
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat("sl-SI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
