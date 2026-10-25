import { getAccessToken } from "./auth";
import { throwForFailedResponse } from "./planLimit";

export interface TeamMember {
  user_id: string; email: string; role: "owner" | "admin" | "member" | "sales"; job_title: string | null;
  is_active: boolean; invite_pending: boolean; invite_expired: boolean; last_seen_at: string | null; permissions: string[]; custom_permissions: boolean; joined_at: string;
  leads_owned: number; open_tasks: number; overdue_tasks: number;
}
export interface PermissionInfo { key: string; label: string; description: string; }
export interface PermissionCatalog { catalog: PermissionInfo[]; role_defaults: Record<string, string[]>; }
export interface AuditEntry { id: string; action: string; detail: string; actor: string | null; created_at: string; }
export interface InviteResult { email: string; invite_sent: boolean; invite_link: string | null; temporary_password: string | null; }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/team${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAccessToken()}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) await throwForFailedResponse(res);
  return res.status === 204 ? (undefined as T) : res.json();
}

export const fetchMembers = () => api<TeamMember[]>("/members");
export const fetchPermissionCatalog = () => api<PermissionCatalog>("/permissions");
export const fetchActivity = () => api<AuditEntry[]>("/activity");
export const inviteMember = (d: { email: string; role: string; permissions: string[] | null; job_title?: string; password_mode?: "invite" | "set"; password?: string }) =>
  api<InviteResult>("/members", { method: "POST", body: JSON.stringify(d) });
export const patchMember = (id: string, d: Partial<{ role: string; permissions: string[] | null; is_active: boolean; job_title: string }>) =>
  api<void>(`/members/${id}`, { method: "PATCH", body: JSON.stringify(d) });
export const removeMember = (id: string) => api<{ leads_unassigned: number; tasks_reassigned: number }>(`/members/${id}`, { method: "DELETE" });
export const resendInvite = (id: string) => api<{ invite_sent: boolean; invite_link: string | null }>(`/members/${id}/resend-invite`, { method: "POST" });

export interface AccessPreset { id: string; name: string; permissions: string[]; }
export const fetchPresets = () => api<AccessPreset[]>("/presets");
export const savePreset = (name: string, permissions: string[]) => api<AccessPreset>("/presets", { method: "POST", body: JSON.stringify({ name, permissions }) });
export const deletePreset = (id: string) => api<void>(`/presets/${id}`, { method: "DELETE" });

export const ROLE_INFO: Record<string, { label: string; blurb: string }> = {
  owner: { label: "Owner", blurb: "Full control, billing and team. A company needs at least one." },
  admin: { label: "Admin", blurb: "Everything except changing owners." },
  member: { label: "Team member", blurb: "Works on campaigns, contacts and CRM. You choose what they can open." },
  sales: { label: "Sales (own leads)", blurb: "Sees only leads and tasks assigned to them. Can't bulk delete or import." },
};

export const resetMemberPassword = (id: string, d: { mode: "link" | "set"; password?: string }) =>
  api<Omit<InviteResult, "email">>(`/members/${id}/reset-password`, { method: "POST", body: JSON.stringify(d) });

/** A readable random password (no look-alike characters). */
export function generatePassword(len = 11): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}
