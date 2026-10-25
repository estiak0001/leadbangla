import { getAccessToken } from "./auth";

export interface WalletAdmin {
  org_id: string;
  org_name: string;
  balance_bdt: number;
  balance_paisa: number;
  low_balance_threshold_bdt: number;
  is_low: boolean;
  updated_at: string | null;
}

export interface WalletTransaction {
  id: string;
  type: string;
  amount_paisa: number;
  balance_after_paisa: number;
  amount_bdt: number;
  balance_after_bdt: number;
  service: string | null;
  units_consumed: number | null;
  reference_id: string | null;
  note: string | null;
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

export async function listWallets(): Promise<WalletAdmin[]> {
  const res = await fetch("/api/v1/admin/wallets", { headers: authHeaders() });
  return handle<WalletAdmin[]>(res);
}

export async function listWalletTransactions(orgId: string): Promise<WalletTransaction[]> {
  const res = await fetch(`/api/v1/admin/wallets/${orgId}/transactions`, { headers: authHeaders() });
  return handle<WalletTransaction[]>(res);
}

export async function adjustWallet(
  orgId: string,
  amount_bdt: number,
  note: string,
): Promise<{ balance_after_bdt: number }> {
  const res = await fetch(`/api/v1/admin/wallets/${orgId}/adjust`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ amount_bdt, note }),
  });
  return handle(res);
}
