import { getAccessToken } from "./auth";

export type Folder = "inbox" | "starred" | "sent" | "archive" | "spam" | "trash";

export interface MailParticipant { email: string; name: string }
export interface MailThreadRow {
  id: string; subject: string; snippet: string; folder: string; starred: boolean; unread_count: number; message_count: number;
  has_outgoing: boolean; participants: MailParticipant[]; contact_id: string | null; assigned_to_user_id: string | null;
  last_message_at: string; address_id: string | null; address: string | null;
}
export interface MailAttachment { idx: number; filename: string; content_type: string; size: number }
export interface MailMessageView {
  id: string; direction: "in" | "out"; from_email: string; from_name: string | null; to: MailParticipant[]; cc: MailParticipant[];
  subject: string; sent_at: string; text: string; html: string | null; has_images: boolean; attachments: MailAttachment[];
  spam: string | null; virus: string | null; spf: string | null; dkim: string | null; dmarc: string | null;
  auto_generated: boolean; status: string; error: string | null; message_id: string | null;
}
export interface MailThreadDetail extends MailThreadRow {
  messages: MailMessageView[]; contact: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
}
export interface MailCounts { inbox_unread: number; spam_unread: number; folders: Record<string, number> }

export interface InboxDomain {
  id: string; sending_domain_id: string; receive_domain: string; status: "pending" | "active" | "disabled"; catch_all: boolean;
  mx: { type: string; host: string; data: string; priority: number; target: string };
  status_note: string | null; dns_submitted_at: string | null; last_checked_at: string | null; created_at: string;
}
export interface InboxAddress { id: string; inbox_domain_id: string; local_part: string; email: string; display_name: string | null; is_default: boolean }
export interface MailSetup {
  platform_ready: boolean; platform_message: string | null; region: string | null;
  domains: InboxDomain[]; addresses: InboxAddress[]; sending_domains: { id: string; domain: string }[]; retention_days: number;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(`/api/v1/mail${path}`, {
    ...init,
    headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), Authorization: `Bearer ${getAccessToken()}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : "Something went wrong");
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
const post = <T,>(path: string, body?: unknown) => call<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const fetchMailSetup = () => call<MailSetup>("/setup");
export const createInboxDomain = (sending_domain_id: string, receive_domain: string) => post<InboxDomain>("/domains", { sending_domain_id, receive_domain });
export const verifyInboxDomain = (id: string) => post<InboxDomain>(`/domains/${id}/verify`);
export const setInboxEnabled = (id: string, enabled: boolean) => post<InboxDomain>(`/domains/${id}/enabled`, { enabled });
export const setCatchAll = (id: string, value: boolean) => post<InboxDomain>(`/domains/${id}/catch-all`, { value });
export const addInboxAddress = (inbox_domain_id: string, local_part: string, display_name: string) => post<InboxAddress>("/addresses", { inbox_domain_id, local_part, display_name: display_name || null });
export const updateInboxAddress = (id: string, data: { display_name?: string; make_default?: boolean; local_part?: string; inbox_domain_id?: string }) => call<InboxAddress>(`/addresses/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteInboxAddress = (id: string) => call<void>(`/addresses/${id}`, { method: "DELETE" });

export const fetchMailCounts = () => call<MailCounts>("/counts");
export const fetchThreads = (p: { folder: Folder; q?: string; unreadOnly?: boolean; assigned?: string; offset?: number }) => {
  const qs = new URLSearchParams({ folder: p.folder, limit: "40", offset: String(p.offset ?? 0) });
  if (p.q) qs.set("q", p.q);
  if (p.unreadOnly) qs.set("unread_only", "true");
  if (p.assigned) qs.set("assigned", p.assigned);
  return call<MailThreadRow[]>(`/threads?${qs}`);
};
export const fetchThread = (id: string, images = false) => call<MailThreadDetail>(`/threads/${id}${images ? "?images=true" : ""}`);
export const markThreadRead = (id: string, read = true) => post<void>(`/threads/${id}/read`, { read });
export const patchThread = (id: string, data: { folder?: string; starred?: boolean }) => call<MailThreadRow>(`/threads/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const assignThread = (id: string, user_id: string | null) => post<MailThreadRow>(`/threads/${id}/assign`, { user_id });
export const saveThreadContact = (id: string) => post<{ id: string }>(`/threads/${id}/contact`);

export async function uploadMailFile(file: File) {
  const fd = new FormData(); fd.append("file", file);
  return call<{ id: string; filename: string; size: number; content_type: string }>("/uploads", { method: "POST", body: fd });
}
export const sendMail = (data: { address_id: string; to: string[]; cc: string[]; subject: string; text: string; thread_id?: string; upload_ids?: string[] }) =>
  post<{ id: string; thread_id: string; status: string }>("/send", data);

/** Files need the login token, so fetch them ourselves and hand the browser a download. */
export async function downloadAttachment(messageId: string, idx: number, filename: string) {
  const res = await fetch(`/api/v1/mail/messages/${messageId}/attachments/${idx}`, { headers: { Authorization: `Bearer ${getAccessToken()}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : "Could not download the file");
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const markAllRead = (folder: string) => post<{ updated: number }>(`/folders/${folder}/read-all`);
export const emptyFolder = (folder: string) => post<{ deleted: number }>(`/folders/${folder}/empty`);
export const deleteThreadForever = (id: string) => call<void>(`/threads/${id}`, { method: "DELETE" });
