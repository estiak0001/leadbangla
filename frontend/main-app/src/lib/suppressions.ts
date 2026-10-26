import { getAccessToken } from "./auth";

export interface Suppression { id: string; email: string; reason: string; label: string; can_remove: boolean; created_at: string }
export interface SuppressionList { counts: Record<string, number>; items: Suppression[] }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/email-suppressions${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAccessToken()}`, ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : "Something went wrong");
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
export const fetchSuppressions = (p: { q?: string; reason?: string } = {}) => {
  const qs = new URLSearchParams({ limit: "200" });
  if (p.q) qs.set("q", p.q);
  if (p.reason) qs.set("reason", p.reason);
  return call<SuppressionList>(`?${qs}`);
};
export const addSuppression = (email: string) => call<{ added: boolean }>("", { method: "POST", body: JSON.stringify({ email }) });
export const removeSuppression = (id: string) => call<void>(`/${id}`, { method: "DELETE" });
