import { getAccessToken } from "./auth";

export interface PlanFull {
  id: string;
  code: string;
  name: string;
  price_bdt: number;
  billing_interval: string;
  contacts_limit: number;
  emails_monthly_limit: number;
  team_members_limit: number;
  workflows_limit: number;
  landing_pages_limit: number;
  social_accounts_limit: number;
  seo_credits_monthly: number;
  custom_domain: boolean;
  priority_support: boolean;
  sms_enabled: boolean;
  sms_monthly_limit: number;
  whatsapp_monthly_limit: number;
  masking_allowed: boolean;
  whatsapp_enabled: boolean;
  is_active: boolean;
  tenant_count: number;
}

export interface CreditRate {
  id: string;
  service: string;
  rate_bdt: string;
  unit_label: string;
  description: string | null;
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
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
    const body = await res.json().catch(() => ({}));
    const detail = typeof body.detail === "string" ? body.detail : Array.isArray(body.detail) ? body.detail.map((d: { msg: string }) => d.msg).join(", ") : null;
    throw new Error(detail ?? "Request failed");
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export async function listAdminPlans(): Promise<PlanFull[]> {
  const res = await fetch("/api/v1/admin/plans", { headers: authHeaders() });
  return handle<PlanFull[]>(res);
}

export async function updatePlan(id: string, patch: Partial<PlanFull>): Promise<PlanFull> {
  const res = await fetch(`/api/v1/admin/plans/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  return handle<PlanFull>(res);
}

export type PlanCreateInput = Omit<PlanFull, "id" | "tenant_count" | "billing_interval"> & { billing_interval?: string };

export async function createPlan(input: PlanCreateInput): Promise<PlanFull> {
  const res = await fetch("/api/v1/admin/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  return handle<PlanFull>(res);
}

export async function deletePlan(id: string): Promise<void> {
  const res = await fetch(`/api/v1/admin/plans/${id}`, { method: "DELETE", headers: authHeaders() });
  return handle<void>(res);
}

export async function listCreditRates(): Promise<CreditRate[]> {
  const res = await fetch("/api/v1/admin/credit-rates", { headers: authHeaders() });
  return handle<CreditRate[]>(res);
}

export async function updateCreditRate(id: string, rate_bdt: number): Promise<CreditRate> {
  const res = await fetch(`/api/v1/admin/credit-rates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ rate_bdt }),
  });
  return handle<CreditRate>(res);
}
