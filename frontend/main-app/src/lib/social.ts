import { throwForFailedResponse } from "./planLimit";
import { getAccessToken } from "./auth";

export type SocialPlatform = "facebook" | "instagram" | "linkedin";
export type SocialPostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed";

export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  account_name: string;
  page_id: string;
  is_active: boolean;
  has_token: boolean;
  last_checked_at: string | null;
  last_check_ok: boolean | null;
  last_check_message: string | null;
  created_at: string;
}

export interface SocialPost {
  id: string;
  social_account_id: string;
  platform: SocialPlatform;
  content: string;
  media_url: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  external_post_id: string | null;
  status: SocialPostStatus;
  likes_count: number;
  shares_count: number;
  comments_count: number;
  error_message: string | null;
  created_at: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/social${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) await throwForFailedResponse(res);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const fetchSocialAccounts = () => apiFetch<SocialAccount[]>("/accounts");

/** "meta" covers both Facebook and Instagram — one consent screen picks Pages for both. */
export type OAuthProvider = "meta" | "linkedin";

export const startOAuthConnect = (provider: OAuthProvider) =>
  apiFetch<{ authorize_url: string }>(`/connect/${provider}/start`);

export const checkAccount = (id: string) => apiFetch<SocialAccount>(`/accounts/${id}/check`, { method: "POST" });

export const disconnectAccount = (id: string) =>
  apiFetch<void>(`/accounts/${id}`, { method: "DELETE" });

export const fetchSocialPosts = () => apiFetch<SocialPost[]>("/posts");

export const schedulePost = (data: {
  social_account_id: string;
  content: string;
  media_url?: string;
  scheduled_at?: string;
  draft?: boolean;
}) => apiFetch<SocialPost>("/posts", { method: "POST", body: JSON.stringify(data) });

export const updatePost = (id: string, data: {
  content?: string;
  media_url?: string;
  scheduled_at?: string;
  clear_schedule?: boolean;
  draft?: boolean;
}) => apiFetch<SocialPost>(`/posts/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const deletePost = (id: string) =>
  apiFetch<void>(`/posts/${id}`, { method: "DELETE" });

export const publishNow = (id: string) =>
  apiFetch<SocialPost>(`/posts/${id}/publish-now`, { method: "POST" });

export const refreshStats = (id: string) =>
  apiFetch<SocialPost>(`/posts/${id}/refresh-stats`, { method: "POST" });
