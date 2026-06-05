export interface ClientDetail {
  id: string;
  name: string;
  description?: string | null;
  industry?: string | null;
  website?: string | null;
  notes?: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  integrations: Array<{
    id: string;
    provider: string;
    status: string;
    metadata?: unknown;
    lastSyncedAt?: string | null;
  }>;
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    scheduledAt?: string | null;
    sentAt?: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface CountryConfig {
  id: string;
  countryCode: string;
  isActive: boolean;
  mailingListId?: string | null;
  mailingListName?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  lastSyncedAt?: string | null;
  country?: {
    code: string;
    name: string;
    isActive: boolean;
  } | null;
}

export interface SqualoIntegration {
  id: string;
  provider: string;
  status: string;
  metadata?: {
    lists?: Array<{ id: string; name: string }> | null;
    [key: string]: unknown;
  } | null;
  lastSyncedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type Alert = { type: "success" | "error"; message: string };

export type UpdateCountryFn = (
  countryCode: string,
  payload: Record<string, unknown>,
  success?: string
) => Promise<void>;
