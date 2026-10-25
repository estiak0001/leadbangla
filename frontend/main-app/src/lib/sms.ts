import { getAccessToken } from "./auth";

export type SmsChannel = "sms" | "whatsapp";
export type SmsCampaignStatus = "draft" | "sending" | "sent" | "failed";

export interface SmsCampaign {
  id: string;
  name: string;
  channel: SmsChannel;
  status: SmsCampaignStatus;
  segment_id: string | null;
  sender_id: string;
  message_body: string;
  sent_at: string | null;
  created_at: string;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
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

export const fetchSmsCampaigns = () => apiFetch<SmsCampaign[]>("/sms/campaigns");

export const createSmsCampaign = (data: {
  name: string;
  segment_id: string;
  channel: SmsChannel;
  message_body: string;
  sender_id?: string;
  wa_template?: WaTemplateChoice;
}) => apiFetch<SmsCampaign>("/sms/campaigns", { method: "POST", body: JSON.stringify(data) });

export interface WaTemplateChoice { name: string; language: string; params: string[] }
export interface MetaTemplate { name: string; language: string; category: string; body: string; params: number }
export interface WaTemplates { mode: "meta" | "provider" | "off"; templates: MetaTemplate[]; error?: string }
export const fetchWhatsAppTemplates = () => apiFetch<WaTemplates>("/whatsapp/templates");

export const sendSmsCampaign = (id: string) =>
  apiFetch<SmsCampaign>(`/sms/campaigns/${id}/send`, { method: "POST" });

export const fetchSmsCampaign = (id: string) =>
  apiFetch<SmsCampaign>(`/sms/campaigns/${id}`);

export interface OrgSmsSettings {
  sms_sender_id: string | null;
  suggested_sender_id: string;
  approved: boolean;
  setup_fee_bdt: number;
}

export interface SmsEntitlement {
  plan_name: string | null;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
  masking_allowed: boolean;
  monthly_limit: number;      // -1 = unlimited
  used: number;
  remaining: number | null;   // null = unlimited
}

export const fetchSmsEntitlement = () => apiFetch<SmsEntitlement>("/sms/settings/entitlement");

export const fetchSmsSettings = () => apiFetch<OrgSmsSettings>("/sms/settings");

export const updateSmsSettings = (data: { sms_sender_id: string | null }) =>
  apiFetch<OrgSmsSettings>("/sms/settings", { method: "PUT", body: JSON.stringify(data) });

export interface SmsDashboard {
  total_campaigns: number;
  campaigns_by_status: Record<string, number>;
  total_sent: number;
  total_failed: number;
  total_skipped: number;
  total_inbound: number;
  sms_credits_spent_bdt: number;
  whatsapp_credits_spent_bdt: number;
  sender_id: string | null;
  sender_id_approved: boolean;
}

export const fetchSmsDashboard = () => apiFetch<SmsDashboard>("/sms/dashboard");

export interface SmsEventItem {
  id: string;
  campaign_id: string;
  campaign_name: string;
  phone: string;
  type: "sent" | "failed";
  gateway_message_id: string | null;
  error?: string | null;
  occurred_at: string;
}

export const fetchSmsHistory = () => apiFetch<SmsEventItem[]>("/sms/history");

export interface SmsSkipEventItem {
  id: string;
  campaign_id: string;
  campaign_name: string;
  phone: string;
  occurred_at: string;
}

export interface SmsCampaignEvents {
  sent_and_failed: SmsEventItem[];
  skipped: SmsSkipEventItem[];
}

export const fetchSmsCampaignEvents = (campaignId: string) =>
  apiFetch<SmsCampaignEvents>(`/sms/campaigns/${campaignId}/events`);

export interface SmsInboundItem {
  id: string;
  from_phone: string;
  to_sender_id: string | null;
  body: string;
  contact_id: string | null;
  contact_name: string | null;
  received_at: string;
}

export const fetchSmsInbound = () => apiFetch<SmsInboundItem[]>("/sms/inbound");

export const updateOptIn = (
  contactId: string,
  data: { sms_opt_in?: boolean; whatsapp_opt_in?: boolean }
) =>
  apiFetch<{ sms_opt_in: boolean; whatsapp_opt_in: boolean }>(
    `/contacts/${contactId}/opt-in`,
    { method: "PATCH", body: JSON.stringify(data) }
  );

export type WaRequestStatus = "pending" | "rejected" | "with_meta" | "approved" | "meta_rejected" | "cancelled";
export interface WaTemplateRequest {
  id: string; label: string; meta_name: string; language: string; category: string; body: string; examples: string[];
  status: WaRequestStatus; status_label: string; admin_note: string | null; meta_reason: string | null; created_at: string;
}
export const fetchWaTemplateRequests = () => apiFetch<WaTemplateRequest[]>("/whatsapp/template-requests");
export const createWaTemplateRequest = (d: { label: string; language: string; category: string; body: string; examples: string[] }) =>
  apiFetch<WaTemplateRequest>("/whatsapp/template-requests", { method: "POST", body: JSON.stringify(d) });
export const cancelWaTemplateRequest = (id: string) => apiFetch<WaTemplateRequest>(`/whatsapp/template-requests/${id}`, { method: "DELETE" });

export interface OwnWaAccount {
  connected: boolean; number: string | null; approved: boolean; phone_number_id: string | null; waba_id: string | null;
  verified_name: string | null; quality: string | null; has_app_secret: boolean; webhook_key: string | null;
  health?: { ok: boolean; quality: string | null; message: string | null; checked_at: string } | null;
}
export interface WaSendingFrom {
  source: "own" | "dedicated" | "shared" | "provider" | "none"; number: string | null; message: string;
  monthly_limit: number; used: number; remaining: number | null;
}
export const fetchWaSendingFrom = () => apiFetch<WaSendingFrom>("/whatsapp/sending-from");
export const fetchOwnWaAccount = () => apiFetch<OwnWaAccount>("/whatsapp/own-account");
export const connectOwnWaAccount = (d: { access_token?: string; phone_number_id: string; waba_id?: string; app_secret?: string; verify_token?: string }) =>
  apiFetch<OwnWaAccount>("/whatsapp/own-account", { method: "PUT", body: JSON.stringify(d) });
export const disconnectOwnWaAccount = () => apiFetch<OwnWaAccount>("/whatsapp/own-account", { method: "DELETE" });
