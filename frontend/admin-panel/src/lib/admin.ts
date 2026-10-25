import { getAccessToken } from "./auth";

// The main app lives on its own origin (served by Nginx at the docker-compose
// default), separate from this admin panel's own port — see prompt.md Step 5.
const MAIN_APP_URL = import.meta.env.VITE_MAIN_APP_URL ?? "http://localhost";

export interface Tenant {
  id: string;
  name: string;
  language: string;
  created_at: string;
  owner_email: string | null;
  plan_name: string | null;
  subscription_status: string | null;
  member_count: number;
  phone: string | null;
  website: string | null;
  industry: string | null;
  company_size: string | null;
  is_suspended?: boolean;
}

export interface CreateTenantInput {
  org_name: string;
  language: "en" | "bn";
  phone: string;
  industry: string;
  company_size: string;
  website?: string;
  owner_email: string;
  plan_id?: string;
  display_name?: string; contact_email?: string; address?: string; city?: string; country?: string;
  trade_license_no?: string; tin?: string; internal_notes?: string;
  starting_credit_bdt?: number; send_invite?: boolean;
}

export interface TenantMember {
  user_id: string;
  email: string;
  role: string;
  joined_at: string;
}

export interface TenantDetail extends Tenant {
  members: TenantMember[];
  sms_sender_id: string | null;
  sms_sender_id_suggested: string;
  sms_sender_id_approved: boolean;
  display_name: string | null; contact_email: string | null; address: string | null; city: string | null; country: string | null;
  trade_license_no: string | null; tin: string | null; internal_notes: string | null; suspended_reason: string | null;
  wallet_balance_bdt: number;
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

export async function fetchTenants(): Promise<Tenant[]> {
  const res = await fetch("/api/v1/admin/tenants", { headers: authHeaders() });
  return handle<Tenant[]>(res);
}

export async function fetchTenantDetail(orgId: string): Promise<TenantDetail> {
  const res = await fetch(`/api/v1/admin/tenants/${orgId}`, { headers: authHeaders() });
  return handle<TenantDetail>(res);
}

export async function updateTenantSmsSender(
  orgId: string,
  payload: { sender_id: string | null; approved: boolean }
): Promise<TenantDetail> {
  const res = await fetch(`/api/v1/admin/tenants/${orgId}/sms-sender`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  return handle<TenantDetail>(res);
}

export async function createTenant(payload: CreateTenantInput): Promise<TenantDetail> {
  const res = await fetch("/api/v1/admin/tenants", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("UNAUTHORIZED");
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? "Failed to create tenant");
  }
  return res.json();
}

export async function impersonate(
  orgId: string,
  userId: string,
): Promise<{ access_token: string; user_email: string }> {
  const res = await fetch(`/api/v1/admin/tenants/${orgId}/impersonate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ user_id: userId }),
  });
  return handle(res);
}

export function buildImpersonationUrl(accessToken: string): string {
  return `${MAIN_APP_URL}/impersonate-landing?access_token=${encodeURIComponent(accessToken)}`;
}

// ── Tenant plan management ───────────────────────────────────────────────────
export interface TenantPlan {
  id: string; code: string; name: string; price_bdt: number; billing_interval: string;
  contacts_limit: number; emails_monthly_limit: number; team_members_limit: number; workflows_limit: number;
  landing_pages_limit: number; social_accounts_limit: number; seo_credits_monthly: number;
  custom_domain: boolean; priority_support: boolean; sms_enabled: boolean; sms_monthly_limit: number;
  masking_allowed: boolean; whatsapp_enabled: boolean; whatsapp_monthly_limit: number;
}
export interface TenantUsage {
  contacts: number; workflows: number; landing_pages: number; team_members: number;
  social_accounts: number; emails_monthly: number; sms_monthly: number; whatsapp_monthly: number;
}
export interface SubscriptionHistoryRow {
  id: string; plan_name: string; price_bdt: number; status: string; source: string;
  note: string | null; changed_by: string | null; created_at: string;
}
export interface TenantSubscription {
  plan: TenantPlan | null; since: string | null; source: string | null; note: string | null;
  usage: TenantUsage; history: SubscriptionHistoryRow[];
}

async function subCall<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/admin/tenants${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : "Request failed");
  }
  return res.json();
}
export const fetchTenantSubscription = (orgId: string) => subCall<TenantSubscription>(`/${orgId}/subscription`);
export const changeTenantPlan = (orgId: string, planId: string, note: string) =>
  subCall<TenantSubscription>(`/${orgId}/plan`, { method: "POST", body: JSON.stringify({ plan_id: planId, note: note || null }) });
export const cancelTenantSubscription = (orgId: string, note: string) =>
  subCall<TenantSubscription>(`/${orgId}/subscription/cancel`, { method: "POST", body: JSON.stringify({ note: note || null }) });

// ── Company management ───────────────────────────────────────────────────────
export interface TenantProfileEdit {
  name?: string; display_name?: string; language?: string; phone?: string; website?: string; industry?: string; company_size?: string;
  contact_email?: string; address?: string; city?: string; country?: string; trade_license_no?: string; tin?: string; internal_notes?: string;
}
export const updateTenant = (orgId: string, data: TenantProfileEdit) => subCall<TenantDetail>(`/${orgId}`, { method: "PATCH", body: JSON.stringify(data) });
export const suspendTenant = (orgId: string, reason: string) => subCall<TenantDetail>(`/${orgId}/suspend`, { method: "POST", body: JSON.stringify({ reason: reason || null }) });
export const unsuspendTenant = (orgId: string) => subCall<TenantDetail>(`/${orgId}/unsuspend`, { method: "POST" });
export const addTenantMember = (orgId: string, email: string, role: string, sendInvite: boolean) =>
  subCall<TenantDetail>(`/${orgId}/members`, { method: "POST", body: JSON.stringify({ email, role, send_invite: sendInvite }) });
export const changeMemberRole = (orgId: string, userId: string, role: string) =>
  subCall<TenantDetail>(`/${orgId}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) });
export const removeTenantMember = (orgId: string, userId: string) => subCall<TenantDetail>(`/${orgId}/members/${userId}`, { method: "DELETE" });
export const resendMemberInvite = (orgId: string, userId: string) => subCall<{ ok: boolean }>(`/${orgId}/members/${userId}/resend-invite`, { method: "POST" });
