import { getAccessToken } from "./auth";
import { throwForFailedResponse } from "./planLimit";

export interface Contact {
  id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  tags: string[];
  sms_opt_in: boolean;
  whatsapp_opt_in: boolean;
  company?: string | null;
  city?: string | null;
  division?: string | null;
  district?: string | null;
  area?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source?: string | null;
  owner_user_id?: string | null;
  pipeline_stage_id?: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface ContactImportResult {
  created: number;
  updated: number;
  restored: number;
  skipped: number;
  total_rows: number;
  blocked: number;
  limit: number | null;
  errors: { row: number; reason: string; value: string }[];
  ignored_columns: string[];
  recognised_columns: string[];
  sms_opted_in: number;
  whatsapp_opted_in: number;
}

export interface ContactCreateInput {
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  tags?: string[];
  company?: string | null;
  city?: string | null;
  division?: string | null;
  district?: string | null;
  area?: string | null;
  address?: string | null;
  source?: string | null;
  whatsapp_number?: string | null;
  facebook_url?: string | null;
  customer_type?: string | null;
  owner_user_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  deal_value?: number | null;
  expected_close_date?: string | null;
  custom_fields?: Record<string, string>;
  sms_opt_in?: boolean;
  whatsapp_opt_in?: boolean;
}

export type ContactUpdateInput = Pick<ContactCreateInput, "email" | "phone" | "first_name" | "last_name" | "tags">;

/** The same email / phone is already in the contact list (HTTP 409). */
export class DuplicateContactError extends Error {
  contactId: string;
  constructor(message: string, contactId: string) {
    super(message);
    this.name = "DuplicateContactError";
    this.contactId = contactId;
  }
}

export interface BulkDeleteResult {
  deleted: number;
}

export type ContactHistoryAction = "created" | "updated" | "deleted" | "restored" | "reverted";

export interface ContactHistoryChangeValue {
  old: string | string[] | null;
  new: string | string[] | null;
}

export interface ContactHistoryEntry {
  id: string;
  action: ContactHistoryAction;
  changes: Record<string, ContactHistoryChangeValue>;
  changed_by_user_id: string | null;
  changed_by_email: string | null;
  source_history_id: string | null;
  created_at: string;
}

export type SegmentField = string;
export type SegmentOperator = string;
export type SegmentMatchType = "all" | "any";

export interface SegmentRule {
  field: SegmentField;
  operator: SegmentOperator;
  value: string | null;
  value2?: string | null;      // second value for "between"
  values?: string[] | null;    // for "is any of", "has any of / all of"
}

export interface SegmentReach { total: number; email: number; phone: number; sms: number; whatsapp: number; located: number; }

export interface Segment {
  id: string;
  name: string;
  rules: SegmentRule[];
  match_type: SegmentMatchType;
  created_at: string;
  contact_count: number;
  description?: string | null;
  updated_at?: string | null;
  reach?: SegmentReach | null;
  used_in?: number;
  is_template?: boolean;
  deleted_at?: string | null;
}

export interface TagPreset {
  id: string;
  name: string;
  created_at: string;
}

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    await throwForFailedResponse(res);
  }
  return res.json();
}

export async function importContactsCsv(file: File): Promise<ContactImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/v1/contacts/import", {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  return handle<ContactImportResult>(res);
}

export async function fetchContacts(): Promise<Contact[]> {
  const res = await fetch("/api/v1/contacts", { headers: authHeaders() });
  return handle<Contact[]>(res);
}

export async function createContact(input: ContactCreateInput, force = false): Promise<Contact> {
  const res = await fetch(`/api/v1/contacts${force ? "?force=true" : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    if (body.detail?.code === "duplicate") throw new DuplicateContactError(body.detail.message, body.detail.contact_id);
  }
  return handle<Contact>(res);
}

export async function updateContact(id: string, input: ContactUpdateInput): Promise<Contact> {
  const res = await fetch(`/api/v1/contacts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  return handle<Contact>(res);
}

export async function deleteContact(id: string): Promise<void> {
  const res = await fetch(`/api/v1/contacts/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) await throwForFailedResponse(res);
}

export async function bulkDeleteContacts(contactIds: string[]): Promise<BulkDeleteResult> {
  const res = await fetch("/api/v1/contacts/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ contact_ids: contactIds }),
  });
  return handle<BulkDeleteResult>(res);
}

export async function deleteContactsByTag(tag: string): Promise<BulkDeleteResult> {
  const res = await fetch("/api/v1/contacts/delete-by-tag", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ tag }),
  });
  return handle<BulkDeleteResult>(res);
}

export async function fetchTrashedContacts(): Promise<Contact[]> {
  const res = await fetch("/api/v1/contacts/trash", { headers: authHeaders() });
  return handle<Contact[]>(res);
}

export async function restoreContact(id: string): Promise<Contact> {
  const res = await fetch(`/api/v1/contacts/trash/${id}/restore`, { method: "POST", headers: authHeaders() });
  return handle<Contact>(res);
}

export async function purgeContact(id: string): Promise<void> {
  const res = await fetch(`/api/v1/contacts/trash/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) await throwForFailedResponse(res);
}

export async function fetchContactHistory(contactId: string): Promise<ContactHistoryEntry[]> {
  const res = await fetch(`/api/v1/contacts/${contactId}/history`, { headers: authHeaders() });
  return handle<ContactHistoryEntry[]>(res);
}

export async function restoreContactHistory(contactId: string, historyId: string): Promise<Contact> {
  const res = await fetch(`/api/v1/contacts/${contactId}/history/${historyId}/restore`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handle<Contact>(res);
}

export async function previewSegment(rules: SegmentRule[], matchType: SegmentMatchType = "all"): Promise<{ count: number; reach: SegmentReach }> {
  const res = await fetch("/api/v1/segments/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ rules, match_type: matchType }),
  });
  return handle<{ count: number; reach: SegmentReach }>(res);
}

export async function createSegment(
  name: string, rules: SegmentRule[], matchType: SegmentMatchType = "all", description?: string | null, asTemplate = false
): Promise<Segment> {
  const res = await fetch(`/api/v1/segments${asTemplate ? "?as_template=true" : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name, description: description || null, rules, match_type: matchType }),
  });
  return handle<Segment>(res);
}

export async function updateSegment(
  id: string, name: string, rules: SegmentRule[], matchType: SegmentMatchType = "all", description?: string | null
): Promise<Segment> {
  const res = await fetch(`/api/v1/segments/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name, description: description || null, rules, match_type: matchType }),
  });
  return handle<Segment>(res);
}

export async function fetchSegment(id: string): Promise<Segment> {
  return handle<Segment>(await fetch(`/api/v1/segments/${id}`, { headers: authHeaders() }));
}

/** Soft delete — the segment goes to the trash and can be restored. */
export async function trashSegment(id: string): Promise<{ used_in: number }> {
  return handle<{ used_in: number }>(await fetch(`/api/v1/segments/${id}`, { method: "DELETE", headers: authHeaders() }));
}

export async function restoreSegment(id: string): Promise<Segment> {
  return handle<Segment>(await fetch(`/api/v1/segments/${id}/restore`, { method: "POST", headers: authHeaders() }));
}

export async function purgeSegment(id: string): Promise<void> {
  const res = await fetch(`/api/v1/segments/${id}/permanent`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) await handle<never>(res);
}

export async function fetchTrashedSegments(): Promise<Segment[]> {
  return handle<Segment[]>(await fetch("/api/v1/segments/trash", { headers: authHeaders() }));
}

/** Copy. asTemplate=true → save as a reusable template; false → live segment from a template; omit → plain copy. */
export async function duplicateSegment(id: string, asTemplate?: boolean): Promise<Segment> {
  const q = asTemplate === undefined ? "" : `?as_template=${asTemplate}`;
  return handle<Segment>(await fetch(`/api/v1/segments/${id}/duplicate${q}`, { method: "POST", headers: authHeaders() }));
}

export interface SegmentHistoryEntry {
  id: string; action: "created" | "updated" | "deleted" | "restored" | "reverted";
  changes: Record<string, { old: unknown; new: unknown }>; changed_by_email: string | null; created_at: string;
}
export async function fetchSegmentHistory(id: string): Promise<SegmentHistoryEntry[]> {
  return handle<SegmentHistoryEntry[]>(await fetch(`/api/v1/segments/${id}/history`, { headers: authHeaders() }));
}
export async function revertSegment(id: string, historyId: string): Promise<Segment> {
  return handle<Segment>(await fetch(`/api/v1/segments/${id}/history/${historyId}/restore`, { method: "POST", headers: authHeaders() }));
}

export async function fetchTemplates(): Promise<Segment[]> {
  return handle<Segment[]>(await fetch("/api/v1/segments/templates", { headers: authHeaders() }));
}
export async function restoreDefaultTemplates(): Promise<{ added: number }> {
  return handle<{ added: number }>(await fetch("/api/v1/segments/templates/restore-defaults", { method: "POST", headers: authHeaders() }));
}

export async function previewSegmentContacts(
  rules: SegmentRule[], matchType: SegmentMatchType = "all"
): Promise<Contact[]> {
  const res = await fetch("/api/v1/segments/preview-contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ rules, match_type: matchType }),
  });
  return handle<Contact[]>(res);
}

export async function fetchSegments(): Promise<Segment[]> {
  const res = await fetch("/api/v1/segments", { headers: authHeaders() });
  return handle<Segment[]>(res);
}

export async function fetchContactSegments(contactId: string): Promise<Segment[]> {
  const res = await fetch(`/api/v1/contacts/${contactId}/segments`, { headers: authHeaders() });
  return handle<Segment[]>(res);
}

export async function fetchSegmentContacts(segmentId: string, limit = 500): Promise<Contact[]> {
  const res = await fetch(`/api/v1/segments/${segmentId}/contacts?limit=${limit}`, { headers: authHeaders() });
  return handle<Contact[]>(res);
}

export async function fetchTagPresets(): Promise<TagPreset[]> {
  const res = await fetch("/api/v1/tag-presets", { headers: authHeaders() });
  return handle<TagPreset[]>(res);
}

export async function createTagPreset(name: string): Promise<TagPreset> {
  const res = await fetch("/api/v1/tag-presets", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name }),
  });
  return handle<TagPreset>(res);
}

export async function deleteTagPreset(id: string): Promise<void> {
  const res = await fetch(`/api/v1/tag-presets/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) await throwForFailedResponse(res);
}

export async function bulkRestoreContacts(ids: string[]): Promise<{ restored: string[]; failed: { id: string; reason: string }[] }> {
  const res = await fetch("/api/v1/contacts/trash/bulk-restore", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ ids }) });
  return handle(res);
}

export async function bulkPurgeContacts(ids: string[]): Promise<{ deleted: number }> {
  const res = await fetch("/api/v1/contacts/trash/bulk-purge", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ ids }) });
  return handle(res);
}
