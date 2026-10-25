import { getAccessToken } from "./auth";

export interface RevenueSummary {
  mrr_bdt: number;
  credit_topup_revenue_bdt: number;
  total_float_bdt: number;
  active_subscriptions: number;
  credit_consumption_bdt: Record<string, number>;
}

export interface TransactionFeedItem {
  id: string;
  org_name: string;
  type: string;
  amount_bdt: number;
  service: string | null;
  created_at: string;
}

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("UNAUTHORIZED");
    }
    throw new Error("Request failed");
  }
  return res.json();
}

export async function fetchRevenueSummary(): Promise<RevenueSummary> {
  const res = await fetch("/api/v1/admin/revenue/summary", { headers: authHeaders() });
  return handle<RevenueSummary>(res);
}

export async function fetchRecentTransactions(limit = 50): Promise<TransactionFeedItem[]> {
  const res = await fetch(`/api/v1/admin/revenue/transactions?limit=${limit}`, { headers: authHeaders() });
  return handle<TransactionFeedItem[]>(res);
}
