import { getAccessToken } from "./auth";

export interface Feature { code: string; name: string; description: string | null; is_enabled: boolean; updated_by: string | null; updated_at: string | null }

const auth = (): HeadersInit => ({ Authorization: `Bearer ${getAccessToken()}` });

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/admin/features${path}`, { ...init, headers: { ...auth(), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Request failed: ${res.status}`);
  }
  return res.json();
}

export const listFeatures = () => call<Feature[]>("");
export const setFeature = (code: string, is_enabled: boolean) =>
  call<Feature>(`/${code}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_enabled }) });
