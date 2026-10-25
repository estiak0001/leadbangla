import { getAccessToken } from "./auth";

export interface NotificationPrefs {
  low_balance_alert: boolean;
  usage_limit_alert: boolean;
  low_balance_threshold_bdt: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/billing${path}`, {
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
  return res.json();
}

export const fetchNotificationPrefs = () => apiFetch<NotificationPrefs>("/notification-prefs");

export const updateNotificationPrefs = (patch: Partial<{
  low_balance_alert: boolean;
  usage_limit_alert: boolean;
  low_balance_threshold_bdt: number;
}>) =>
  apiFetch<NotificationPrefs>("/notification-prefs", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
