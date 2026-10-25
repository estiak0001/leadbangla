import { getAccessToken } from "./auth";

export interface AppNotification {
  id: string; category: string; kind: string; title: string; body: string; link: string | null; read: boolean; created_at: string;
}
export interface NotificationPref { key: string; label: string; description: string; in_app: boolean; email: boolean; }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/notifications${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAccessToken()}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const fetchNotifications = (p: { unreadOnly?: boolean; limit?: number; offset?: number } = {}) => {
  const qs = new URLSearchParams({ limit: String(p.limit ?? 30), offset: String(p.offset ?? 0) });
  if (p.unreadOnly) qs.set("unread_only", "true");
  return api<AppNotification[]>(`?${qs}`);
};
export const fetchUnreadCount = () => api<{ count: number }>("/unread-count").then((r) => r.count);
export const markRead = (ids?: string[]) => api<void>("/read", { method: "POST", body: JSON.stringify({ ids: ids ?? null }) });
export const fetchNotificationPreferences = () => api<NotificationPref[]>("/preferences");
export const saveNotificationPreferences = (prefs: Record<string, { in_app?: boolean; email?: boolean }>) =>
  api<NotificationPref[]>("/preferences", { method: "PUT", body: JSON.stringify({ prefs }) });

export function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-BD", { day: "numeric", month: "short" });
}
