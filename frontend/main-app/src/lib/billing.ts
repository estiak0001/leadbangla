import { getAccessToken } from "./auth";

export interface Plan {
  id: string;
  code: string;
  name: string;
  price_bdt: number;
  billing_interval: string;
  contacts_limit?: number;
  emails_monthly_limit?: number;
  team_members_limit?: number;
  workflows_limit?: number;
  landing_pages_limit?: number;
  social_accounts_limit?: number;
  seo_credits_monthly?: number;
  custom_domain?: boolean;
  priority_support?: boolean;
  sms_enabled?: boolean;
  sms_monthly_limit?: number;
  masking_allowed?: boolean;
  whatsapp_enabled?: boolean;
  whatsapp_monthly_limit?: number;
}

export interface Subscription {
  id: string;
  status: "pending" | "active" | "failed" | "cancelled";
  plan: Plan;
}

export interface ResourceUsage {
  used: number;
  limit: number;
}

export interface PlanUsage {
  plan_name: string;
  plan_price_bdt: number;
  contacts: ResourceUsage;
  emails_monthly: ResourceUsage;
  workflows: ResourceUsage;
  landing_pages: ResourceUsage;
  team_members: ResourceUsage;
  seo_credits: ResourceUsage;
  social_accounts?: ResourceUsage | null;
  whatsapp?: ResourceUsage | null;
  period_resets_on?: string | null;
  sms?: ResourceUsage | null;
  sms_enabled?: boolean;
  masking_allowed?: boolean;
  whatsapp_enabled?: boolean;
  custom_domain: boolean;
  priority_support: boolean;
  wallet_balance_bdt: number;
  wallet_balance_paisa: number;
}

export interface WalletBalance {
  balance_paisa: number;
  balance_bdt: number;
}

export interface WalletTxn {
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

export interface CreditRate {
  id: string;
  service: string;
  rate_bdt: string;
  unit_label: string;
  description: string | null;
}

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? "Request failed");
  }
  return res.json();
}

export async function fetchPlans(): Promise<Plan[]> {
  const res = await fetch("/api/v1/billing/plans");
  if (!res.ok) {
    throw new Error("Failed to load plans");
  }
  return res.json();
}

export async function subscribeToPlan(
  planId: string,
): Promise<{ subscription_id: string; checkout_url: string }> {
  const res = await fetch("/api/v1/billing/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ plan_id: planId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : "Failed to start subscription");
  }
  return res.json();
}

export async function fetchMySubscription(): Promise<Subscription | null> {
  const res = await fetch("/api/v1/billing/me", { headers: authHeaders() });
  if (!res.ok) {
    throw new Error("Failed to load subscription");
  }
  const body = await res.json();
  return body ?? null;
}

export async function cancelMySubscription(): Promise<Subscription> {
  const res = await fetch("/api/v1/billing/cancel", { method: "POST", headers: authHeaders() });
  return handle<Subscription>(res);
}

export async function fetchPlanUsage(): Promise<PlanUsage> {
  const res = await fetch("/api/v1/billing/plan-usage", { headers: authHeaders() });
  return handle<PlanUsage>(res);
}

export async function fetchWalletBalance(): Promise<WalletBalance> {
  const res = await fetch("/api/v1/billing/wallet", { headers: authHeaders() });
  return handle<WalletBalance>(res);
}

export async function initiateTopup(amount_bdt: number): Promise<{ tran_id: string; checkout_url: string }> {
  const res = await fetch("/api/v1/billing/wallet/topup", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ amount_bdt }),
  });
  return handle(res);
}

export async function fetchTransactions(limit = 20, offset = 0): Promise<WalletTxn[]> {
  const res = await fetch(`/api/v1/billing/wallet/transactions?limit=${limit}&offset=${offset}`, {
    headers: authHeaders(),
  });
  return handle<WalletTxn[]>(res);
}

export async function fetchCreditRates(): Promise<CreditRate[]> {
  const res = await fetch("/api/v1/billing/credit-rates");
  return handle<CreditRate[]>(res);
}

export interface UsageReport {
  days: number;
  balance_bdt: number;
  totals: { added_bdt: number; spent_bdt: number; refunded_bdt: number; transactions: number };
  by_service: { service: string; label: string; spent_bdt: number; units: number }[];
  by_day: { date: string; spent_bdt: number; added_bdt: number }[];
  top_campaigns: { name: string; service: string; spent_bdt: number }[];
}

export async function fetchUsageReport(days: number): Promise<UsageReport> {
  const res = await fetch(`/api/v1/billing/wallet/usage-report?days=${days}`, { headers: authHeaders() });
  return handle<UsageReport>(res);
}

export interface ManualMethod { method: "bkash" | "nagad" | "rocket" | "bank"; label: string; details: string }
export interface ManualPayment {
  id: string; method: string; amount_bdt: number; sender_account: string; trx_id: string;
  status: "pending" | "approved" | "rejected"; admin_note: string | null; created_at: string; plan_name: string | null;
}

export interface PaymentOptions {
  online: { enabled: boolean; configured: boolean; available: boolean };
  manual: { enabled: boolean; available: boolean; methods: ManualMethod[]; note: string };
}

export async function fetchPaymentOptions(): Promise<PaymentOptions> {
  const res = await fetch("/api/v1/billing/manual/options");
  if (!res.ok) throw new Error("Failed to load payment options");
  return res.json();
}

export async function fetchMyManualPayments(): Promise<ManualPayment[]> {
  const res = await fetch("/api/v1/billing/manual/payments", { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load your payments");
  return res.json();
}

export async function submitManualPayment(form: FormData): Promise<ManualPayment> {
  const res = await fetch("/api/v1/billing/manual/payments", { method: "POST", headers: authHeaders(), body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : "Could not submit the payment");
  }
  return res.json();
}
