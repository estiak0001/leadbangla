import { getAccessToken } from "./auth";

export interface Campaign {
  id: string;
  name: string;
  status: "draft" | "sending" | "sent" | "failed" | "cancelled";
  subject: string | null;
  html_body: string | null;
  segment_id: string | null;
  sender_id: string | null;
  reply_to: string | null;
  sent_at: string | null;
  deleted_at: string | null;
  created_at: string;
  sent_count: number;
  opened_count: number;
  clicked_count: number;
  failed_count: number;
  total_recipients: number | null;
}

export type CampaignHistoryAction = "created" | "updated" | "deleted" | "restored" | "reverted";

export interface CampaignHistoryEntry {
  id: string;
  action: CampaignHistoryAction;
  changes: Record<string, { old: string | null; new: string | null }>;
  changed_by_email: string | null;
  source_history_id: string | null;
  created_at: string;
}

export interface CampaignPrecheck {
  recipient_count: number;
  free_remaining: number;
  billable_count: number;
  rate_bdt_per_1000: number | null;
  estimated_cost_bdt: number;
  wallet_balance_bdt: number;
  sufficient_balance: boolean;
  connection_ok: boolean;
  connection_note: string;
  from_email: string | null;
  sender_warning: string | null;
  daily_remaining: number | null;
}

export interface CampaignEventEntry {
  contact_id: string;
  email: string | null;
  status: "sent" | "failed";
  error: string | null;
  occurred_at: string;
}

export interface CampaignEventsResult {
  sent: CampaignEventEntry[];
  failed: CampaignEventEntry[];
}

export interface EmailConnectionStatus {
  connection_ok: boolean;
  connection_note: string;
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

export async function fetchCampaigns(): Promise<Campaign[]> {
  const res = await fetch("/api/v1/campaigns", { headers: authHeaders() });
  return handle<Campaign[]>(res);
}

export async function fetchEmailConnectionStatus(): Promise<EmailConnectionStatus> {
  const res = await fetch("/api/v1/campaigns/connection-status", { headers: authHeaders() });
  return handle<EmailConnectionStatus>(res);
}

export async function fetchCampaign(id: string): Promise<Campaign> {
  const res = await fetch(`/api/v1/campaigns/${id}`, { headers: authHeaders() });
  return handle<Campaign>(res);
}

export async function createCampaign(
  name: string,
  segmentId: string,
  subject: string,
  htmlBody: string,
  senderId: string | null = null,
  replyTo: string | null = null,
): Promise<Campaign> {
  const res = await fetch("/api/v1/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name, segment_id: segmentId, subject, html_body: htmlBody, sender_id: senderId, reply_to: replyTo }),
  });
  return handle<Campaign>(res);
}

export async function fetchCampaignPrecheck(id: string): Promise<CampaignPrecheck> {
  const res = await fetch(`/api/v1/campaigns/${id}/precheck`, { headers: authHeaders() });
  return handle<CampaignPrecheck>(res);
}

export async function fetchCampaignEvents(id: string): Promise<CampaignEventsResult> {
  const res = await fetch(`/api/v1/campaigns/${id}/events`, { headers: authHeaders() });
  return handle<CampaignEventsResult>(res);
}

export async function sendCampaign(id: string): Promise<Campaign> {
  const res = await fetch(`/api/v1/campaigns/${id}/send`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handle<Campaign>(res);
}

export async function cancelCampaign(id: string): Promise<Campaign> {
  const res = await fetch(`/api/v1/campaigns/${id}/cancel`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handle<Campaign>(res);
}

export async function simulateEngagement(id: string): Promise<Campaign> {
  const res = await fetch(`/api/v1/campaigns/${id}/simulate-engagement`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handle<Campaign>(res);
}

export async function updateCampaign(
  id: string,
  data: Partial<{ name: string; segment_id: string; subject: string; html_body: string; sender_id: string; reply_to: string }>,
): Promise<Campaign> {
  const res = await fetch(`/api/v1/campaigns/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  return handle<Campaign>(res);
}

/** Soft delete — the campaign moves to the trash and can be restored. */
export async function deleteCampaign(id: string): Promise<void> {
  const res = await fetch(`/api/v1/campaigns/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? "Failed to delete campaign");
  }
}

export async function fetchTrashedCampaigns(): Promise<Campaign[]> {
  const res = await fetch("/api/v1/campaigns/trash", { headers: authHeaders() });
  return handle<Campaign[]>(res);
}

export async function restoreCampaign(id: string): Promise<Campaign> {
  const res = await fetch(`/api/v1/campaigns/trash/${id}/restore`, { method: "POST", headers: authHeaders() });
  return handle<Campaign>(res);
}

export async function fetchCampaignHistory(id: string): Promise<CampaignHistoryEntry[]> {
  const res = await fetch(`/api/v1/campaigns/${id}/history`, { headers: authHeaders() });
  return handle<CampaignHistoryEntry[]>(res);
}

export async function restoreCampaignHistory(id: string, historyId: string): Promise<Campaign> {
  const res = await fetch(`/api/v1/campaigns/${id}/history/${historyId}/restore`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handle<Campaign>(res);
}
