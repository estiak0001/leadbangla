import { getAccessToken } from "./auth";

export interface PaidAdsAccount {
  id: string;
  platform: "google" | "meta";
  label: string;
  is_connected: boolean;
  last_synced_at: string | null;
  created_at: string;
}

export interface AdCampaign {
  id: string;
  account_id: string;
  platform: "google" | "meta";
  external_id: string;
  name: string;
  objective: string | null;
  daily_budget: number;
  currency: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  synced_at: string | null;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
}

export interface SpendRecord {
  id: string;
  campaign_id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  synced_at: string;
}

export interface SyncResult {
  campaign_id: string;
  records_upserted: number;
  error: string | null;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/paid-ads${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Accounts
export const listAccounts = () => apiFetch<PaidAdsAccount[]>("/accounts");
export const connectAccount = (data: {
  platform: string;
  label: string;
  credentials: Record<string, string>;
}) => apiFetch<PaidAdsAccount>("/accounts", { method: "POST", body: JSON.stringify(data) });
export const deleteAccount = (id: string) =>
  apiFetch<void>(`/accounts/${id}`, { method: "DELETE" });

// Campaigns
export const listCampaigns = () => apiFetch<AdCampaign[]>("/campaigns");
export const createCampaign = (data: {
  account_id: string;
  name: string;
  objective?: string;
  daily_budget: number;
  currency?: string;
  start_date?: string;
  end_date?: string;
}) => apiFetch<AdCampaign>("/campaigns", { method: "POST", body: JSON.stringify(data) });
export const syncCampaign = (id: string) =>
  apiFetch<SyncResult>(`/campaigns/${id}/sync`, { method: "POST", body: "{}" });
export const listSpend = (id: string) =>
  apiFetch<SpendRecord[]>(`/campaigns/${id}/spend`);
