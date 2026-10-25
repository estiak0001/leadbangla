import { getAccessToken } from "./auth";

export interface GatewayField { key: string; label: string; secret: boolean; required: boolean; hint: string; value: string; is_set: boolean }
export interface GatewayProvider {
  code: "alphasms" | "sslwireless"; name: string; docs: string; tagline: string;
  fields: GatewayField[]; has_credentials: boolean; is_live: boolean; is_enabled: boolean;
  last_tested_at: string | null; last_test_ok: boolean | null; last_test_error: string | null;
}
export interface GatewayOverview {
  providers: GatewayProvider[];
  active: string | null;
  stats: { sent_this_month: number; failed_this_month: number; pending_masking_requests: number; masking_approved: number };
  customer_rate_bdt: number | null;
}
export interface GatewayResult { ok: boolean; message: string; balance?: number | null }

const auth = (): HeadersInit => ({ Authorization: `Bearer ${getAccessToken()}` });

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/admin/sms-gateway${path}`, {
    ...init, headers: { "Content-Type": "application/json", ...auth(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Request failed: ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export interface SenderIdRow { org_id: string; org_name: string; sender_id: string; approved: boolean }
export const fetchSenderIds = () => call<SenderIdRow[]>("/sender-ids");
export const assignSenderId = (org_id: string, sender_id: string) => call<{ ok: boolean }>("/sender-ids", { method: "POST", body: JSON.stringify({ org_id, sender_id }) });
export const revokeSenderId = (org_id: string) => call<void>(`/sender-ids/${org_id}`, { method: "DELETE" });

export const fetchGateway = () => call<GatewayOverview>("");
export const saveGatewayCredentials = (code: string, values: Record<string, string>) =>
  call<GatewayProvider>(`/${code}/credentials`, { method: "PUT", body: JSON.stringify({ values }) });
export const testGateway = (code: string) => call<GatewayResult>(`/${code}/test`, { method: "POST" });
export const sendGatewayTest = (code: string, to: string, message?: string) =>
  call<GatewayResult>(`/${code}/send-test`, { method: "POST", body: JSON.stringify({ to, ...(message ? { message } : {}) }) });
export const activateGateway = (code: string, live: boolean) =>
  call<GatewayOverview>(`/${code}/activate`, { method: "POST", body: JSON.stringify({ live }) });
export const clearGatewayCredentials = (code: string) => call<void>(`/${code}/credentials`, { method: "DELETE" });

export interface SmsUsage {
  days: number;
  totals: { sent: number; failed: number; customer_spend_bdt: number; success_rate: number | null };
  by_day: { date: string; sent: number; failed: number }[];
  by_tenant: { org_id: string; name: string; sent: number; failed: number; spend_bdt: number }[];
  gateway_balance: number | null;
  gateway_balance_error: string | null;
}
export const fetchSmsUsage = (days: number) => call<SmsUsage>(`/usage?days=${days}`);
