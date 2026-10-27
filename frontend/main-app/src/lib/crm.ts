import { useEffect, useState } from "react";
import { getAccessToken } from "./auth";

export type StageOutcome = "open" | "won" | "lost";

export interface PipelineStage {
  id: string;
  organization_id: string;
  name: string;
  position: number;
  color: string;
  outcome: StageOutcome;
  probability: number | null;
  stale_days: number | null;
  auto_task_days: number | null;
  auto_task_title: string | null;
  lead_count: number;
  created_at: string;
}

export interface KanbanContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  company: string | null;
  city: string | null;
  district: string | null;
  area: string | null;
  source: string | null;
  tags: string[];
  lead_score: number;
  pipeline_stage_id: string | null;
  owner_user_id: string | null;
  deal_value: number | null;          // paisa
  expected_close_date: string | null;
  stage_changed_at: string | null;
  next_task_due: string | null;
}

export interface KanbanColumn {
  id: string | null;
  name: string;
  position: number;
  color: string;
  outcome: StageOutcome;
  probability: number | null;
  stale_days: number | null;
  total: number;
  value_total: number;                // paisa
  contacts: KanbanContact[];
}

export interface CrmContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  sms_opt_in: boolean;
  whatsapp_opt_in: boolean;
  pipeline_stage_id: string | null;
  lead_score: number;
  created_at: string;
  updated_at: string;
  company: string | null;
  address: string | null;
  city: string | null;
  division: string | null;
  district: string | null;
  area: string | null;
  source: string | null;
  whatsapp_number: string | null;
  facebook_url: string | null;
  customer_type: "retail" | "wholesale" | null;
  last_contacted_at: string | null;
  owner_user_id: string | null;
  deal_value: number | null;          // paisa
  expected_close_date: string | null;
  lost_reason: string | null;
  stage_changed_at: string | null;
  latitude: number | null;
  longitude: number | null;
  custom_fields: Record<string, string | number>;
}

export interface TimelineEntry {
  timestamp: string;
  channel: string;
  event_type: string;
  title: string;
  detail: string | null;
}

export interface ContactNote {
  id: string;
  contact_id: string;
  content: string;
  created_at: string;
}

export interface TeamMember { user_id: string; email: string; name: string; role: string; }

export interface CrmTask {
  id: string;
  contact_id: string | null;
  contact_name: string;
  contact_phone: string | null;
  title: string;
  kind: string;
  due_at: string;
  done_at: string | null;
  assignee_user_id: string | null;
  created_by_user_id: string | null;
  priority: "low" | "normal" | "high";
  description: string | null;
  overdue: boolean;
}

export interface CustomField { id: string; key: string; label: string; field_type: "text" | "number" | "date" | "select"; options: string[]; }

export interface DueEntry { id: string; kind: "due" | "payment"; amount: number; note: string | null; due_date: string | null; created_at: string; }

export interface ConsentEntry { id: string; channel: string; granted: boolean; method: string; recorded_by: string | null; created_at: string; }

export interface DuesOverview {
  total: number; count: number;
  items: { contact_id: string; name: string; phone: string | null; balance: number; next_due_date: string | null; overdue: boolean }[];
}

export interface CrmReports {
  summary: { days: number; total_leads: number; new_leads: number; won: number; lost: number; win_rate: number | null; pipeline_value: number; won_value: number; forecast: number; forecast_missing: number };
  funnel: { stage_id: string; name: string; color: string; outcome: StageOutcome; probability: number | null; count: number; value: number; avg_days_in_stage: number; share: number }[];
  lost_reasons: { reason: string; count: number }[];
  by_source: { source: string; leads: number; won: number; won_value: number }[];
  people: { user_id: string; name: string; leads_owned: number; calls: number; visits: number; meetings: number; stage_moves: number; tasks_done: number }[];
  follow_up: { due: number; on_time: number; late: number; missed: number; rate: number | null };
  trend: { date: string; new: number; won: number; lost: number }[];
  by_district: { name: string; leads: number; won: number; won_value: number; pipeline: number }[];
  by_type: { name: string; leads: number; won: number; won_value: number; pipeline: number }[];
  score_bands: { hot: number; warm: number; cold: number };
  sales_cycle_days: number | null;
  stage_flow: { stage_id: string; name: string; color: string; outcome: StageOutcome; entered: number }[];
  stale_leads: number;
  dues: { total: number; customers: number; overdue: number };
  tasks: { open: number; overdue: number; done: number };
}

export interface TeamPerson {
  user_id: string; name: string; email: string; role: string; job_title: string | null;
  leads_owned: number; open_leads: number; pipeline_value: number; won: number; lost: number; won_value: number; win_rate: number | null;
  calls: number; visits: number; meetings: number; stage_moves: number; tasks_done: number; tasks_on_time: number; on_time_rate: number | null;
  tasks_open: number; tasks_overdue: number; activities: number; last_active: string | null;
}
export interface TeamFeedItem { id: string; kind: string; summary: string; created_at: string; user: string; contact_id: string; contact: string; }
export interface TeamActivity {
  days: number; people: TeamPerson[];
  daily: { date: string; calls: number; visits: number; meetings: number; stage_moves: number; tasks_done: number }[];
  feed: TeamFeedItem[];
  detail: { by_stage: { name: string; color: string; count: number }[]; open_tasks: { id: string; title: string; due_at: string; overdue: boolean; priority: string; contact: string | null; contact_id: string | null }[] } | null;
}

export interface SourceItem { key?: string | null; label: string; }
export interface BoardPrefs { show_value: boolean; show_company: boolean; show_source: boolean; show_due: boolean; stale_highlight: boolean; sort: "recent" | "value" | "waiting"; }
export interface CrmSettings { round_robin: boolean; task_reminders: boolean; lost_reasons: string[]; sources: { key: string; label: string }[]; board_prefs: BoardPrefs; }
export const DEFAULT_BOARD_PREFS: BoardPrefs = { show_value: true, show_company: true, show_source: true, show_due: true, stale_highlight: true, sort: "recent" };

export const SOURCE_LABELS: Record<string, string> = {
  facebook: "Facebook", whatsapp: "WhatsApp", messenger: "Messenger", instagram: "Instagram", website: "Website",
  referral: "Referral", walk_in: "Walk-in", phone_call: "Phone call", event: "Event / expo", import: "Imported", other: "Other", unknown: "Not set",
};
export const SOURCES = Object.keys(SOURCE_LABELS).filter((k) => k !== "unknown");

/** Paisa → "৳1,25,000" (Bangladeshi digit grouping). */
export function taka(paisa: number | null | undefined): string {
  if (paisa == null) return "—";
  return "৳" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(paisa / 100);
}

/** wa.me link for a Bangladeshi number (01712… / +8801712… / 8801712…). */
export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "88" + d;
  if (!d.startsWith("880") || d.length < 12) return null;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/crm${path}`, {
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
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const sendContactEmail = (contactId: string, senderId: string, subject: string, bodyHtml: string) =>
  apiFetch<void>(`/contacts/${contactId}/send-email`, {
    method: "POST",
    body: JSON.stringify({ sender_id: senderId, subject, body_html: bodyHtml }),
  });

export const sendContactSms = (contactId: string, body: string) =>
  apiFetch<void>(`/contacts/${contactId}/send-sms`, { method: "POST", body: JSON.stringify({ body }) });

export const fetchStages = () => apiFetch<PipelineStage[]>("/stages");

export type StageExtras = Partial<{ probability: number | null; stale_days: number | null; auto_task_days: number | null; auto_task_title: string | null }>;
export const createStage = (data: { name: string; color: string; outcome?: StageOutcome; position?: number } & StageExtras) =>
  apiFetch<PipelineStage>("/stages", { method: "POST", body: JSON.stringify(data) });

export const updateStage = (id: string, data: Partial<{ name: string; position: number; color: string; outcome: StageOutcome }> & StageExtras) =>
  apiFetch<PipelineStage>(`/stages/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const reorderStages = (ids: string[]) =>
  apiFetch<PipelineStage[]>("/stages/reorder", { method: "PUT", body: JSON.stringify({ ids }) });

export const deleteStage = (id: string, moveTo?: string) => apiFetch<void>(`/stages/${id}${moveTo ? `?move_to=${moveTo}` : ""}`, { method: "DELETE" });

export const fetchPipeline = (p: { owner?: string; q?: string; limit?: number; sort?: string } = {}) => {
  const qs = new URLSearchParams();
  if (p.sort) qs.set("sort", p.sort);
  if (p.owner) qs.set("owner", p.owner);
  if (p.q) qs.set("q", p.q);
  if (p.limit) qs.set("limit", String(p.limit));
  return apiFetch<KanbanColumn[]>(`/pipeline?${qs}`);
};

export const fetchColumnMore = (stageId: string | null, p: { offset: number; owner?: string; q?: string; limit?: number }) => {
  const qs = new URLSearchParams({ offset: String(p.offset), limit: String(p.limit ?? 20) });
  if (p.owner) qs.set("owner", p.owner);
  if (p.q) qs.set("q", p.q);
  return apiFetch<KanbanContact[]>(`/pipeline/columns/${stageId ?? "unassigned"}?${qs}`);
};

export const fetchCrmContact = (id: string) => apiFetch<CrmContact>(`/contacts/${id}`);

export const updateContactStage = (contactId: string, stageId: string | null, lostReason?: string) =>
  apiFetch<CrmContact>(`/contacts/${contactId}/stage`, {
    method: "PATCH",
    body: JSON.stringify({ stage_id: stageId, lost_reason: lostReason || null }),
  });

export type ProfileInput = Partial<{
  company: string | null; address: string | null; division: string | null; district: string | null; area: string | null; source: string | null;
  whatsapp_number: string | null; facebook_url: string | null; customer_type: string | null;
  deal_value: number | null; expected_close_date: string | null; latitude: number | null; longitude: number | null; custom_fields: Record<string, string | number | null>;
}>;
export const updateProfile = (id: string, data: ProfileInput) =>
  apiFetch<CrmContact>(`/contacts/${id}/profile`, { method: "PATCH", body: JSON.stringify(data) });

export const setOwner = (id: string, userId: string | null) =>
  apiFetch<CrmContact>(`/contacts/${id}/owner`, { method: "PATCH", body: JSON.stringify({ user_id: userId }) });

export const logActivity = (id: string, kind: "call" | "visit" | "meeting", summary: string) =>
  apiFetch<{ id: string }>(`/contacts/${id}/activities`, { method: "POST", body: JSON.stringify({ kind, summary }) });

export const fetchTimeline = (contactId: string) => apiFetch<TimelineEntry[]>(`/contacts/${contactId}/timeline`);
export const fetchConsent = (contactId: string) => apiFetch<ConsentEntry[]>(`/contacts/${contactId}/consent`);

export const fetchNotes = (contactId: string) => apiFetch<ContactNote[]>(`/contacts/${contactId}/notes`);
export const createNote = (contactId: string, content: string) =>
  apiFetch<ContactNote>(`/contacts/${contactId}/notes`, { method: "POST", body: JSON.stringify({ content }) });
export const deleteNote = (noteId: string) => apiFetch<void>(`/notes/${noteId}`, { method: "DELETE" });

// Team, settings, custom fields
export const fetchTeam = () => apiFetch<TeamMember[]>("/team");
export const fetchSettings = () => apiFetch<CrmSettings>("/settings");
export const saveSettings = (d: Partial<Omit<CrmSettings, "sources" | "board_prefs">> & { sources?: SourceItem[]; board_prefs?: Partial<BoardPrefs> }) => apiFetch<CrmSettings>("/settings", { method: "PUT", body: JSON.stringify(d) });
export const fetchCustomFields = () => apiFetch<CustomField[]>("/custom-fields");
export const createCustomField = (d: { label: string; field_type: string; options: string[] }) =>
  apiFetch<CustomField>("/custom-fields", { method: "POST", body: JSON.stringify(d) });
export const deleteCustomField = (id: string) => apiFetch<void>(`/custom-fields/${id}`, { method: "DELETE" });

// Tasks
const tz = () => -new Date().getTimezoneOffset();
export const fetchTasks = (scope: string, opts: { mine?: boolean; assignee?: string; assignedByMe?: boolean; unassigned?: boolean } = {}) => {
  const qs = new URLSearchParams({ scope, tz_offset: String(tz()) });
  if (opts.mine) qs.set("mine", "true");
  if (opts.assignee) qs.set("assignee", opts.assignee);
  if (opts.assignedByMe) qs.set("assigned_by_me", "true");
  if (opts.unassigned) qs.set("unassigned", "true");
  return apiFetch<CrmTask[]>(`/tasks?${qs}`);
};
export const createTeamTask = (d: { title: string; due_at: string; assignee_user_id?: string | null; priority?: string; description?: string; contact_id?: string | null; kind?: string }) =>
  apiFetch<CrmTask>("/tasks", { method: "POST", body: JSON.stringify(d) });
export const fetchTaskCounts = (mine: boolean) =>
  apiFetch<{ overdue: number; today: number; upcoming: number }>(`/tasks/counts?mine=${mine}&tz_offset=${tz()}`);
export const fetchContactTasks = (contactId: string) => apiFetch<CrmTask[]>(`/contacts/${contactId}/tasks`);
export const createTask = (contactId: string, d: { title: string; due_at: string; kind: string; assignee_user_id?: string | null }) =>
  apiFetch<CrmTask>(`/contacts/${contactId}/tasks`, { method: "POST", body: JSON.stringify(d) });
export const updateTask = (id: string, d: { done?: boolean; due_at?: string; title?: string; assignee_user_id?: string | null; priority?: string; description?: string }) =>
  apiFetch<CrmTask>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(d) });
export const deleteTask = (id: string) => apiFetch<void>(`/tasks/${id}`, { method: "DELETE" });

// Baki
export const fetchDuesOverview = () => apiFetch<DuesOverview>("/dues");
export const fetchContactDues = (contactId: string) => apiFetch<{ balance: number; entries: DueEntry[] }>(`/contacts/${contactId}/dues`);
export const addDue = (contactId: string, d: { kind: "due" | "payment"; amount: number; note?: string; due_date?: string | null }) =>
  apiFetch<DueEntry>(`/contacts/${contactId}/dues`, { method: "POST", body: JSON.stringify(d) });
export const deleteDue = (id: string) => apiFetch<void>(`/dues/${id}`, { method: "DELETE" });

export const fetchReports = (days: number) => apiFetch<CrmReports>(`/reports?days=${days}`);

export interface TaskComment { id: string; body: string; author: string | null; user_id: string | null; created_at: string; }
export const fetchTaskComments = (taskId: string) => apiFetch<TaskComment[]>(`/tasks/${taskId}/comments`);
export const addTaskComment = (taskId: string, body: string) =>
  apiFetch<TaskComment>(`/tasks/${taskId}/comments`, { method: "POST", body: JSON.stringify({ body }) });

export const updateCustomField = (id: string, d: { label: string; options: string[] }) =>
  apiFetch<CustomField>(`/custom-fields/${id}`, { method: "PUT", body: JSON.stringify(d) });
export const reorderCustomFields = (ids: string[]) =>
  apiFetch<CustomField[]>("/custom-fields-order", { method: "PUT", body: JSON.stringify({ ids }) });

// ── Company-defined lead sources: the lists below are filled from the server and shared by every screen ──
export function applySources(list: { key: string; label: string }[]) {
  for (const k of Object.keys(SOURCE_LABELS)) if (k !== "unknown") delete SOURCE_LABELS[k];
  list.forEach((s) => { SOURCE_LABELS[s.key] = s.label; });
  SOURCE_LABELS.unknown = "Not set";
  SOURCES.length = 0;
  list.forEach((s) => SOURCES.push(s.key));
}
let sourcesPromise: Promise<void> | null = null;
export function loadSources(force = false): Promise<void> {
  if (!sourcesPromise || force) sourcesPromise = fetchSettings().then((s) => applySources(s.sources)).catch(() => { sourcesPromise = null; });
  return sourcesPromise;
}
/** Re-renders the screen once the company's own lead-source list has loaded. */
export function useSources() {
  const [, bump] = useState(0);
  useEffect(() => { let live = true; loadSources().then(() => live && bump((n) => n + 1)); return () => { live = false; }; }, []);
  return SOURCES;
}

export const fetchTeamActivity = (days: number, user?: string, kind?: string) => {
  const qs = new URLSearchParams({ days: String(days) });
  if (user) qs.set("user", user);
  if (kind) qs.set("kind", kind);
  return apiFetch<TeamActivity>(`/team-activity?${qs}`);
};
