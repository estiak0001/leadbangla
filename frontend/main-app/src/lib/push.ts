import { getAccessToken } from "./auth";

export interface PushConfig {
  ready: boolean;              // can this company send push right now?
  vapid_public_key: string | null;
  site_key: string;            // identifies the company on its website and subscribe link
  subscribers: number;
  last_7_days: number;
  linked: number;              // subscribers matched to a contact
}

export interface PushToken {
  id: string;
  endpoint: string;
  contact_id: string | null;
  source: "dashboard" | "website" | "link";
  email: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface PushCampaign {
  id: string;
  title: string;
  body: string;
  icon_url: string | null;
  click_url: string | null;
  segment_id: string | null;
  provider: string;
  status: "pending" | "sending" | "sent" | "failed";
  sent_count: number;
  failed_count: number;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/push${path}`, {
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

// Config (keys are managed by the platform admin, not here)
export const getConfig = () => apiFetch<PushConfig>("/config");

// Tokens
export const listTokens = () => apiFetch<PushToken[]>("/tokens");

export const registerToken = (sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string;
  contact_id?: string;
}) => apiFetch<PushToken>("/tokens", { method: "POST", body: JSON.stringify(sub) });

// Campaigns
export const listCampaigns = () => apiFetch<PushCampaign[]>("/campaigns");
export const sendCampaign = (data: {
  title: string;
  body: string;
  icon_url?: string;
  click_url?: string;
  segment_id?: string | null;
}) => apiFetch<PushCampaign>("/campaigns", { method: "POST", body: JSON.stringify(data) });

// ---------------------------------------------------------------------------
// Browser-side push subscription helpers
// ---------------------------------------------------------------------------

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return false;
  return sub.unsubscribe();
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// Public subscribe link (no login): /subscribe/:siteKey
export interface PublicPushInfo { ready: boolean; public_key: string | null; name: string }
export const fetchPublicPushInfo = async (siteKey: string): Promise<PublicPushInfo> => {
  const res = await fetch(`/api/v1/public/push/${siteKey}/info`);
  if (!res.ok) throw new Error("This link isn't valid.");
  return res.json();
};
export const publicSubscribe = async (siteKey: string, sub: { endpoint: string; p256dh: string; auth: string; email?: string }) => {
  const res = await fetch(`/api/v1/public/push/${siteKey}/subscribe`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...sub, source: "link", user_agent: navigator.userAgent.slice(0, 200) }),
  });
  if (!res.ok) throw new Error("Could not save your subscription.");
};
