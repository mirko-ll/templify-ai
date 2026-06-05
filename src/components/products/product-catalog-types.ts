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
  isEnabled: boolean;
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
