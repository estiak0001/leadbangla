import { getAccessToken } from "./auth";

export type VerificationStatus = "pending" | "needs_info" | "submitted" | "approved" | "rejected" | "cancelled";
export interface VDoc { id: string; doc_type: string; filename: string; content_type: string; size: number; created_at: string }
export interface VRequirement { type: string; label: string; required: boolean; hint: string; group?: string | null; group_label?: string | null; uploaded: VDoc | null }
export interface VRequest {
  id: string; kind: "sms_sender_id" | "whatsapp_number"; value: string; status: VerificationStatus;
  customer_note: string | null; admin_note: string | null; reviewed_by: string | null; reviewed_at: string | null;
  gateway_ref: string | null; submitted_at: string | null;
  created_at: string; updated_at: string; organization_id: string; organization_name: string | null;
  documents: VDoc[]; requirements: VRequirement[]; missing_required: string[];
}

const auth = (): HeadersInit => ({ Authorization: `Bearer ${getAccessToken()}` });

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/admin/verifications${path}`, { ...init, headers: { ...auth(), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Request failed: ${res.status}`);
  }
  return res.json();
}

export const listVerifications = (status?: string, kind?: string) => {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (kind) q.set("kind", kind);
  return call<VRequest[]>(q.toString() ? `?${q}` : "");
};
export const pendingVerificationCount = () => call<{ pending: number }>("/pending-count").then((r) => r.pending);
export const decideVerification = (id: string, decision: "approved" | "rejected" | "needs_info" | "submitted" | "revoked", note: string, finalValue?: string, gatewayRef?: string, skipDocuments?: boolean) =>
  call<VRequest>(`/${id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note: note || null, final_value: finalValue || null, gateway_ref: gatewayRef || null, skip_documents: !!skipDocuments }) });

export async function downloadBundle(requestId: string) {
  const res = await fetch(`/api/v1/admin/verifications/${requestId}/bundle`, { headers: auth() });
  if (!res.ok) throw new Error("Could not build the download");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = `documents-${requestId.slice(0, 8)}.zip`; a.click();
  URL.revokeObjectURL(url);
}

export async function openAdminDoc(requestId: string, doc: VDoc) {
  const res = await fetch(`/api/v1/admin/verifications/${requestId}/documents/${doc.id}`, { headers: auth() });
  if (!res.ok) throw new Error("Could not open the document");
  window.open(URL.createObjectURL(await res.blob()), "_blank", "noopener");
}
