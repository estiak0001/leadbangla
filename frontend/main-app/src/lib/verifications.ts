import { getAccessToken } from "./auth";

export type VerificationKind = "sms_sender_id" | "whatsapp_number";
export type VerificationStatus = "pending" | "needs_info" | "submitted" | "approved" | "rejected" | "cancelled";

export interface VerificationDocument { id: string; doc_type: string; filename: string; content_type: string; size: number; created_at: string }
export interface Requirement { type: string; label: string; required: boolean; hint: string; group?: string | null; group_label?: string | null; uploaded: VerificationDocument | null }
export interface VerificationRequest {
  id: string; kind: VerificationKind; value: string; status: VerificationStatus;
  customer_note: string | null; admin_note: string | null; reviewed_by: string | null; reviewed_at: string | null;
  gateway_ref: string | null; submitted_at: string | null;
  created_at: string; updated_at: string;
  documents: VerificationDocument[]; requirements: Requirement[]; missing_required: string[];
}

const auth = (): HeadersInit => ({ Authorization: `Bearer ${getAccessToken()}` });

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/verifications${path}`, { ...init, headers: { ...auth(), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 413) throw new Error("That file is too large. Please upload a file under 5 MB.");
    throw new Error(typeof body.detail === "string" ? body.detail : `Request failed (${res.status}). Please try again.`);
  }
  return res.json();
}

export const fetchVerifications = (kind: VerificationKind) => call<VerificationRequest[]>(`?kind=${kind}`);
export const createVerification = (kind: VerificationKind, value: string, note?: string) =>
  call<VerificationRequest>("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, value, note: note || null }) });
export const cancelVerification = (id: string) => call<VerificationRequest>(`/${id}/cancel`, { method: "POST" });
export const deleteVerificationDoc = (id: string, docId: string) => call<VerificationRequest>(`/${id}/documents/${docId}`, { method: "DELETE" });
export function uploadVerificationDoc(id: string, docType: string, file: File) {
  const fd = new FormData();
  fd.append("doc_type", docType);
  fd.append("file", file);
  return call<VerificationRequest>(`/${id}/documents`, { method: "POST", body: fd });
}

/** Open an uploaded document in a new tab (needs the auth header, so fetch → blob). */
export async function openVerificationDoc(requestId: string, doc: VerificationDocument) {
  const res = await fetch(`/api/v1/verifications/${requestId}/documents/${doc.id}`, { headers: auth() });
  if (!res.ok) throw new Error("Could not open the document");
  window.open(URL.createObjectURL(await res.blob()), "_blank", "noopener");
}

export const STATUS_META: Record<VerificationStatus, { label: string; variant: "warning" | "info" | "success" | "danger" | "default" }> = {
  pending: { label: "Under review", variant: "warning" },
  needs_info: { label: "Needs more info", variant: "info" },
  submitted: { label: "With the operator", variant: "info" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "danger" },
  cancelled: { label: "Cancelled", variant: "default" },
};
