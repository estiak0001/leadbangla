import { getAccessToken } from "./auth";

export interface ReferralProgram {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  commission_type: "flat" | "percentage";
  commission_value: number;
  cookie_days: number;
  target_url: string;
  is_active: boolean;
  created_at: string;
}

export interface ReferralLink {
  id: string;
  program_id: string;
  contact_id: string | null;
  code: string;
  clicks: number;
  conversions: number;
  created_at: string;
}

export interface Commission {
  id: string;
  organization_id: string;
  program_id: string;
  link_id: string;
  contact_id: string | null;
  click_id: string | null;
  commission_amount: number;
  conversion_value: number;
  status: "pending" | "approved" | "paid" | "rejected";
  notes: string | null;
  created_at: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/referral${path}`, {
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

// Programs
export const listPrograms = () => apiFetch<ReferralProgram[]>("/programs");
export const createProgram = (data: Omit<ReferralProgram, "id" | "organization_id" | "created_at">) =>
  apiFetch<ReferralProgram>("/programs", { method: "POST", body: JSON.stringify(data) });
export const updateProgram = (id: string, data: Partial<ReferralProgram>) =>
  apiFetch<ReferralProgram>(`/programs/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteProgram = (id: string) =>
  apiFetch<void>(`/programs/${id}`, { method: "DELETE" });

// Links
export const listLinks = (programId?: string) =>
  apiFetch<ReferralLink[]>(`/links${programId ? `?program_id=${programId}` : ""}`);
export const createLink = (programId: string, contactId?: string) =>
  apiFetch<ReferralLink>(`/programs/${programId}/links`, {
    method: "POST",
    body: JSON.stringify({ contact_id: contactId ?? null }),
  });
export const deleteLink = (id: string) => apiFetch<void>(`/links/${id}`, { method: "DELETE" });

// Conversions & commissions
export const recordConversion = (code: string, conversion_value: number, notes?: string) =>
  apiFetch<Commission>("/conversions", {
    method: "POST",
    body: JSON.stringify({ code, conversion_value, notes: notes ?? null }),
  });
export const listCommissions = () => apiFetch<Commission[]>("/commissions");
export const updateCommissionStatus = (id: string, status: Commission["status"]) =>
  apiFetch<Commission>(`/commissions/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

export function trackingUrl(code: string): string {
  return `${window.location.origin}/api/v1/public/ref/${code}`;
}
