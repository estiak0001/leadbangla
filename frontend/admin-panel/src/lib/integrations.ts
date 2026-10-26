import { getAccessToken } from "./auth";

export interface PlatformServiceField {
  key: string;
  label: string;
  type: "text" | "password";
  hint?: string;
}

export const SERVICE_FIELDS: Record<string, PlatformServiceField[]> = {
  amazon_ses: [
    { key: "access_key_id", label: "AWS Access Key ID", type: "text", hint: "From an IAM user with SES permissions (e.g. AmazonSESFullAccess). Starts with AKIA…" },
    { key: "secret_access_key", label: "AWS Secret Access Key", type: "password" },
    { key: "region", label: "AWS Region", type: "text", hint: "Where your SES domains are verified, e.g. us-east-1, eu-west-1, ap-south-1" },
    { key: "default_from_email", label: "Default From Email", type: "text", hint: "Used for platform emails and tests. Must be on a domain verified in SES." },
    { key: "configuration_set", label: "Configuration Set (optional)", type: "text", hint: "Only if you set one up in SES for event publishing" },
    { key: "public_api_url", label: "Public API URL (for open/click tracking)", type: "text", hint: "Publicly reachable URL of this API, e.g. https://api.yourdomain.com/api — leave empty on localhost (tracking links won't work from outside)" },
    { key: "inbound_bucket", label: "Inbox: S3 bucket name (receiving)", type: "text", hint: "Optional. Turns on the shared inbox: SES drops every received email into this bucket. Same AWS region as SES. See the inbox guide below." },
    { key: "inbound_topic_arn", label: "Inbox: SNS topic ARN (receiving)", type: "text", hint: "Optional but needed for new mail to appear on its own. arn:aws:sns:<region>:<account>:<topic>" },
    { key: "events_topic_arn", label: "Events: SNS topic ARN (bounces & complaints)", type: "text", hint: "Optional but strongly recommended before asking AWS for production access. A second SNS topic that receives bounce/complaint notices. See “Bounce & complaint tracking” below." },
    { key: "webhook_secret", label: "Webhook Secret", type: "password", hint: "Pick any long random string. In SNS, subscribe https://<public-api>/v1/public/email/events?secret=<this value> to receive bounces & complaints" },
  ],
  sslcommerz: [
    { key: "store_id", label: "Store ID", type: "text" },
    { key: "store_password", label: "Store Password", type: "password" },
    {
      key: "sandbox_base_url",
      label: "Base URL",
      type: "text",
      hint: "https://sandbox.sslcommerz.com or https://securepay.sslcommerz.com",
    },
  ],
  sslwireless: [
    { key: "api_token", label: "API Token", type: "password", hint: "Connection credential only — per-org Sender IDs are managed on each tenant's detail page" },
  ],
  meta_social: [
    { key: "access_token", label: "Page Access Token", type: "password" },
    { key: "page_id", label: "Facebook Page ID", type: "text" },
  ],
  linkedin: [
    { key: "access_token", label: "Access Token", type: "password" },
    { key: "org_urn", label: "Org URN", type: "text", hint: "urn:li:organization:XXXXXXXX" },
  ],
  firebase_vapid: [
    { key: "vapid_public_key", label: "VAPID Public Key", type: "text" },
    { key: "vapid_private_key", label: "VAPID Private Key", type: "password" },
    { key: "vapid_subject", label: "VAPID Subject", type: "text", hint: "mailto:admin@example.com" },
  ],
  meta_whatsapp: [
    { key: "access_token", label: "Access token", type: "password", hint: "A permanent token from a System User in Meta Business settings (permission: whatsapp_business_messaging)." },
    { key: "phone_number_id", label: "Phone number ID", type: "text", hint: "Meta developer console → WhatsApp → API setup. This is an ID, not the phone number itself." },
    { key: "waba_id", label: "WhatsApp Business Account ID", type: "text", hint: "Needed to list your approved message templates." },
    { key: "app_secret", label: "App secret", type: "password", hint: "App settings → Basic. Used to check that webhook calls really come from Meta." },
    { key: "verify_token", label: "Webhook verify token", type: "password", hint: "Make one up (any random text) and paste the same value into Meta's webhook settings." },
  ],
  whatsapp_bsp: [
    { key: "api_token", label: "BSP API token", type: "password", hint: "From your WhatsApp Business Solution Provider (for example SSL Wireless, once approved as your BSP)." },
    { key: "business_number", label: "Platform business number (optional)", type: "text", hint: "The WhatsApp number registered with your BSP, for your own reference." },
  ],
  dataseo: [
    { key: "login", label: "Login (email)", type: "text" },
    { key: "password", label: "Password", type: "password" },
  ],
  twitter_x: [
    { key: "bearer_token", label: "Bearer Token", type: "password" },
    { key: "api_key", label: "API Key", type: "password" },
    { key: "api_secret", label: "API Secret", type: "password" },
  ],
};

export interface PlatformServiceAdmin {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  docs_url: string | null;
  cost_model: string | null;
  est_monthly_usd: number;
  is_enabled: boolean;
  is_live: boolean;
  has_credentials: boolean;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
}

export interface IntegrationTestResult {
  ok: boolean;
  message: string;
  tested_at: string | null;
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
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function listIntegrations(): Promise<PlatformServiceAdmin[]> {
  const res = await fetch("/api/v1/admin/integrations", { headers: authHeaders() });
  return handle<PlatformServiceAdmin[]>(res);
}

export async function updateIntegration(
  code: string,
  patch: {
    credentials?: Record<string, string>;
    is_enabled?: boolean;
    is_live?: boolean;
    est_monthly_usd?: number;
  },
): Promise<PlatformServiceAdmin> {
  const res = await fetch(`/api/v1/admin/integrations/${code}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  return handle<PlatformServiceAdmin>(res);
}

export async function testIntegration(code: string): Promise<IntegrationTestResult> {
  const res = await fetch(`/api/v1/admin/integrations/${code}/test`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handle<IntegrationTestResult>(res);
}

export async function clearIntegrationCredentials(code: string): Promise<void> {
  const res = await fetch(`/api/v1/admin/integrations/${code}/credentials`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle<void>(res);
}

export async function sendSesTestEmail(toEmail: string): Promise<IntegrationTestResult> {
  const res = await fetch("/api/v1/admin/integrations/amazon_ses/send-test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ to_email: toEmail }),
  });
  return handle<IntegrationTestResult>(res);
}

export async function sendSslwirelessTestSms(to: string): Promise<IntegrationTestResult> {
  const res = await fetch("/api/v1/admin/integrations/sslwireless/send-test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ to }),
  });
  return handle<IntegrationTestResult>(res);
}

export interface SavedField { is_set: boolean; secret: boolean; preview: string }

export async function fetchSavedFields(code: string): Promise<Record<string, SavedField>> {
  const res = await fetch(`/api/v1/admin/integrations/${code}/fields`, { headers: authHeaders() });
  return handle<Record<string, SavedField>>(res);
}

/** Saves credentials by merging: a blank secret keeps the stored value, a blank plain field is cleared. */
export async function saveIntegrationCredentials(code: string, values: Record<string, string>, required: string[]): Promise<Record<string, SavedField>> {
  const res = await fetch(`/api/v1/admin/integrations/${code}/credentials`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ values, required }),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : "Could not save");
  }
  return res.json();
}

export interface WhatsAppNumberRow { org_id: string; org_name: string; number: string; approved: boolean; own_account?: boolean; verified_name?: string | null; quality?: string | null; phone_number_id?: string | null; has_waba?: boolean;
  source?: "own" | "dedicated" | "shared"; health?: { ok: boolean; quality: string | null; message: string | null; checked_at: string } | null }
export interface WaHealth { ok: boolean; quality: string | null; message: string | null; checked_at: string }

async function waCall<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/admin/whatsapp${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : "Request failed");
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
export const fetchWhatsAppNumbers = () => waCall<WhatsAppNumberRow[]>("/numbers");
export const assignWhatsAppNumber = (org_id: string, number: string, phone_number_id: string | undefined, use_shared_number: boolean) =>
  waCall<{ ok: boolean }>("/numbers", { method: "POST", body: JSON.stringify({ org_id, number, phone_number_id: phone_number_id || null, use_shared_number }) });
export const fetchWhatsAppHealth = () => waCall<{ platform: WaHealth | null }>("/health");
export const runWhatsAppHealth = () => waCall<{ platform: { ok: boolean; quality: string | null; message: string } | null; orgs_checked: number; orgs_with_problems: number }>("/health/run", { method: "POST" });
export const checkOwnWaAccount = (org_id: string) => waCall<{ ok: boolean; message: string }>(`/numbers/${org_id}/check`, { method: "POST" });
export const revokeWhatsAppNumber = (org_id: string) => waCall<void>(`/numbers/${org_id}`, { method: "DELETE" });
export const sendWhatsAppTest = (to: string) => waCall<{ ok: boolean; message: string }>("/send-test", { method: "POST", body: JSON.stringify({ to }) });

export type WaTplStatus = "pending" | "rejected" | "with_meta" | "approved" | "meta_rejected" | "cancelled";
export interface WaTemplateRequestAdmin {
  id: string; organization_name: string | null; label: string; meta_name: string; language: string; category: string; body: string; examples: string[];
  status: WaTplStatus; status_label: string; admin_note: string | null; meta_reason: string | null; reviewed_by: string | null; created_at: string;
}
export const fetchWaTemplateRequests = () => waCall<WaTemplateRequestAdmin[]>("/template-requests");
export const decideWaTemplate = (id: string, decision: "approve" | "reject", note?: string) =>
  waCall<WaTemplateRequestAdmin>(`/template-requests/${id}/decision`, { method: "POST", body: JSON.stringify({ decision, note: note || null }) });
export const syncWaTemplate = (id: string) => waCall<WaTemplateRequestAdmin>(`/template-requests/${id}/sync`, { method: "POST" });

export async function generatePushKeys(): Promise<{ replaced: boolean; subscribers: number }> {
  const res = await fetch("/api/v1/admin/integrations/firebase_vapid/generate-keys", { method: "POST", headers: authHeaders() });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
    throw new Error("Could not generate keys");
  }
  return res.json();
}

export interface MailCheck { name: string; ok: boolean; message: string }
export async function checkMailSetup(): Promise<{ ok: boolean; region: string; mx: string; checks: MailCheck[] }> {
  const res = await fetch("/api/v1/admin/mail/check-setup", { method: "POST", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 || res.status === 403 ? "UNAUTHORIZED" : body.detail ?? "Check failed");
  }
  return res.json();
}

export const fetchSesWebhookUrls = async (): Promise<{ inbound: string; events: string }> => {
  const res = await fetch("/api/v1/admin/integrations/amazon_ses/webhook-urls", { headers: { Authorization: `Bearer ${getAccessToken()}` } });
  if (!res.ok) throw new Error("Could not load the webhook URLs");
  return res.json();
};

export interface EventsReport { ok: boolean; set: string; checks: MailCheck[] }
async function eventsCall(path: string): Promise<EventsReport> {
  const res = await fetch(`/api/v1/admin/mail/events/${path}`, { method: "POST", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 || res.status === 403 ? "UNAUTHORIZED" : body.detail ?? "Request failed");
  }
  return res.json();
}
export const checkBounceTracking = () => eventsCall("check");
export const setupBounceTracking = () => eventsCall("setup");
