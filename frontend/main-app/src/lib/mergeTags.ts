import { getAccessToken } from "./auth";
import { throwForFailedResponse } from "./planLimit";

export interface MergeTag {
  id: string;
  key: string;
  value: string;
  description: string | null;
  builtin: boolean;
  updated_at: string;
}

/** Built-in tags filled from each contact's own details. Fixed: they can't be
 * edited, removed or redefined as custom tags. */
export const BUILTIN_TAGS = [
  { key: "first_name", label: "First name", sample: "রাহিম" },
  { key: "last_name", label: "Last name", sample: "আহমেদ" },
  { key: "email", label: "Email", sample: "rahim@example.com" },
  { key: "phone", label: "Phone", sample: "01712-345678" },
] as const;

function headers(): HeadersInit {
  const t = getAccessToken();
  return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/merge-tags${path}`, { ...init, headers: headers() });
  if (!res.ok) await throwForFailedResponse(res);
  return res.status === 204 ? (undefined as T) : res.json();
}

export const fetchMergeTags = () => call<MergeTag[]>("");
export const createMergeTag = (key: string, value: string, description?: string) =>
  call<MergeTag>("", { method: "POST", body: JSON.stringify({ key, value, description: description || null }) });
export const updateMergeTag = (id: string, data: { value?: string; description?: string | null }) =>
  call<MergeTag>(`/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteMergeTag = (id: string) => call<void>(`/${id}`, { method: "DELETE" });
