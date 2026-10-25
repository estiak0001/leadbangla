import { throwForFailedResponse } from "./planLimit";
import { getAccessToken } from "./auth";

export interface DnsRecord {
  type: string;
  host: string;
  data: string;
  purpose: "dkim" | "spf" | "dmarc";
  required: boolean;
  verified: boolean;
}

export interface SendingDomain {
  id: string;
  domain: string;
  provider: string;
  status: "pending" | "verified" | "paused";
  dns_records: DnsRecord[];
  verified_at: string | null;
  paused_reason: string | null;
  status_note: string | null;
  dns_submitted_at: string | null;
  last_checked_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface EmailProviderInfo {
  kind: "ses" | "smtp" | "none";
  label: string;
  configured: boolean;
  message: string;
  region: string | null;
}

export interface SenderAddress {
  id: string;
  domain_id: string;
  email: string;
  name: string | null;
  is_default: boolean;
  created_at: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`/api/v1/email-domains${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) await throwForFailedResponse(res);
  return res.status === 204 ? (undefined as T) : res.json();
}

export const fetchDomains = () => call<SendingDomain[]>("");
export const addDomain = (domain: string) => call<SendingDomain>("", { method: "POST", body: JSON.stringify({ domain }) });
export const verifyDomain = (id: string) => call<SendingDomain>(`/${id}/verify`, { method: "POST" });
export const deleteDomain = (id: string) => call<void>(`/${id}`, { method: "DELETE" });
export const fetchSenders = () => call<SenderAddress[]>("/senders");
export const addSender = (domain_id: string, email: string, name: string) =>
  call<SenderAddress>("/senders", { method: "POST", body: JSON.stringify({ domain_id, email, name: name || null }) });
export const setDefaultSender = (id: string) => call<SenderAddress>(`/senders/${id}/default`, { method: "POST" });
export const deleteSender = (id: string) => call<void>(`/senders/${id}`, { method: "DELETE" });
export const sendTestEmail = (id: string, to_email: string) =>
  call<{ ok: boolean; message_id: string }>(`/senders/${id}/test`, { method: "POST", body: JSON.stringify({ to_email }) });
export const fetchProvider = () => call<EmailProviderInfo>("/provider");
export const registerWithSes = (id: string) => call<SendingDomain>(`/${id}/register-ses`, { method: "POST" });
export const updateDomain = (id: string, domain: string) =>
  call<SendingDomain>(`/${id}`, { method: "PUT", body: JSON.stringify({ domain }) });
export const fetchTrashedDomains = () => call<SendingDomain[]>("/trash");
export const restoreDomain = (id: string) => call<SendingDomain>(`/trash/${id}/restore`, { method: "POST" });
export const purgeDomain = (id: string) => call<void>(`/trash/${id}`, { method: "DELETE" });
