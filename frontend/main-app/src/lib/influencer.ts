import { getAccessToken } from "./auth";

export interface Influencer {
  id: string;
  organization_id: string;
  name: string;
  handle: string | null;
  platform: string;
  followers: number;
  niche: string | null;
  engagement_rate: number | null;
  email: string | null;
  phone: string | null;
  outreach_status: "new" | "contacted" | "replied" | "agreed" | "completed" | "rejected";
  notes: string | null;
  contact_id: string | null;
  created_at: string;
}

export interface Deliverable {
  id: string;
  influencer_id: string;
  type: string;
  description: string;
  due_date: string | null;
  status: "pending" | "submitted" | "approved" | "rejected";
  referral_link_id: string | null;
  referral_link_code: string | null;
  outcome_clicks: number;
  outcome_conversions: number;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
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

// Influencers
export const listInfluencers = () => apiFetch<Influencer[]>("/influencers");
export const createInfluencer = (data: Omit<Influencer, "id" | "organization_id" | "created_at">) =>
  apiFetch<Influencer>("/influencers", { method: "POST", body: JSON.stringify(data) });
export const updateInfluencer = (id: string, data: Partial<Influencer>) =>
  apiFetch<Influencer>(`/influencers/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteInfluencer = (id: string) =>
  apiFetch<void>(`/influencers/${id}`, { method: "DELETE" });

// Deliverables
export const listDeliverables = (influencerId: string) =>
  apiFetch<Deliverable[]>(`/influencers/${influencerId}/deliverables`);
export const createDeliverable = (
  influencerId: string,
  data: Pick<Deliverable, "type" | "description" | "due_date" | "referral_link_id">
) =>
  apiFetch<Deliverable>(`/influencers/${influencerId}/deliverables`, {
    method: "POST",
    body: JSON.stringify(data),
  });
export const updateDeliverable = (id: string, data: Partial<Deliverable>) =>
  apiFetch<Deliverable>(`/influencers/deliverables/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
export const deleteDeliverable = (id: string) =>
  apiFetch<void>(`/influencers/deliverables/${id}`, { method: "DELETE" });

export const PLATFORMS = [
  "instagram", "youtube", "tiktok", "facebook", "twitter", "linkedin", "blog", "other",
] as const;

export const DELIVERABLE_TYPES = ["post", "story", "reel", "video", "blog_post", "tweet", "live"] as const;

export const OUTREACH_STATUSES = [
  "new", "contacted", "replied", "agreed", "completed", "rejected",
] as const;
