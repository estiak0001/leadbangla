import { getAccessToken } from "./auth";

export interface MDoc { id: string; filename: string; content_type: string; size: number }
export interface ManualPaymentRow {
  id: string; method: string; amount_bdt: number; sender_account: string; trx_id: string;
  customer_note: string | null; status: "pending" | "approved" | "rejected"; admin_note: string | null;
  created_at: string; plan_name: string | null; customer_email: string | null; documents: MDoc[];
}

const auth = (): HeadersInit => ({ Authorization: `Bearer ${getAccessToken()}` });

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/admin/manual-payments${path}`, { ...init, headers: { ...auth(), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Request failed: ${res.status}`);
  }
  return res.json();
}

export const listManualPayments = (status?: string) => call<ManualPaymentRow[]>(status ? `?status=${status}` : "");
export const pendingManualPaymentCount = () => call<{ pending: number }>("/pending-count").then((r) => r.pending);
export const decideManualPayment = (id: string, decision: "approve" | "reject", note: string) =>
  call<ManualPaymentRow>(`/${id}/${decision}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: note || null }) });

export async function openProof(paymentId: string, doc: MDoc) {
  const res = await fetch(`/api/v1/admin/manual-payments/${paymentId}/documents/${doc.id}`, { headers: auth() });
  if (!res.ok) throw new Error("Could not open the document");
  window.open(URL.createObjectURL(await res.blob()), "_blank", "noopener");
}

export interface PaymentSettings {
  online: { enabled: boolean; configured: boolean; available: boolean };
  manual: { enabled: boolean; available: boolean };
  accounts: Record<"bkash" | "nagad" | "rocket" | "bank" | "note", string>;
}
export const getPaymentSettings = () => call<PaymentSettings>("/settings");
export const savePaymentSettings = (body: { online_enabled?: boolean; manual_enabled?: boolean; accounts?: Partial<PaymentSettings["accounts"]> }) =>
  call<PaymentSettings>("/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
