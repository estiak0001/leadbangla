import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus, Pencil, Mail, Copy, Check, ShieldCheck, ListChecks } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import PlanUsageStrip from "../../components/PlanUsageStrip";
import Alert from "../../components/Alert";
import Badge from "../../components/Badge";
import Button from "../../components/Button";
import PageHeader from "../../components/PageHeader";
import Spinner from "../../components/Spinner";
import UpgradeLimitModal from "../../components/UpgradeLimitModal";
import { useMe } from "../../lib/permissions";
import { fetchActivity, fetchMembers, resendInvite, ROLE_INFO, type AuditEntry, type TeamMember } from "../../lib/team";
import RolesTab from "./RolesTab";
import MemberDialog from "./MemberDialog";

const ACTION_LABEL: Record<string, string> = {
  preset_saved: "Preset saved", preset_deleted: "Preset deleted",
  password_reset: "Password reset", member_added: "Added", member_removed: "Removed", role_changed: "Role changed", access_changed: "Access changed",
  access_on: "Access on", access_off: "Access off",
};

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" });
}

export default function TeamPage() {
  const { me } = useMe();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [tab, setTab] = useState<"people" | "roles" | "activity">("people");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ text: string; link?: string; secret?: string } | null>(null);
  const [dialog, setDialog] = useState<{ member: TeamMember | null } | null>(null);
  const [limit, setLimit] = useState<{ resource: string; current: number; limit: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    Promise.all([fetchMembers(), fetchActivity()])
      .then(([m, a]) => { setMembers(m); setActivity(a); setError(""); })
      .catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const myRole = me?.my_role ?? "member";
  const canManage = (m: TeamMember) => myRole === "owner" || (myRole === "admin" && (m.role === "member" || m.role === "sales"));

  const resend = async (m: TeamMember) => {
    try {
      const r = await resendInvite(m.user_id);
      setNotice(r.invite_sent ? { text: `Invite email sent to ${m.email}.` } : { text: `We couldn't send the email. Share this link with ${m.email} yourself:`, link: r.invite_link ?? undefined });
    } catch (e: any) { setError(e.message); }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Team"
        description="Add your employees, choose what each person can open, and see who is working on what."
        actions={<Button size="sm" icon={<UserPlus size={15} />} onClick={() => setDialog({ member: null })}>Add person</Button>}
      />
      <PlanUsageStrip items={["team"]} />
      {error && <Alert variant="error" className="mb-4" onDismiss={() => setError("")}>{error}</Alert>}
      {notice && (
        <Alert variant="success" className="mb-4" onDismiss={() => setNotice(null)}>
          <p className="text-sm">{notice.text}</p>
          {(notice.link || notice.secret) && (
            <div className="flex items-center gap-2 mt-2">
              <input readOnly value={(notice.secret ?? notice.link)!} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 text-xs border border-surface-200 rounded px-2 py-1.5 bg-white" />
              <Button size="xs" variant="secondary" icon={copied ? <Check size={13} /> : <Copy size={13} />}
                onClick={() => { navigator.clipboard?.writeText((notice.secret ?? notice.link)!); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy"}</Button>
            </div>
          )}
        </Alert>
      )}

      <div className="flex gap-1 border-b border-surface-200 mb-4" role="tablist">
        {([["people", `People (${members.length})`], ["roles", "Roles"], ["activity", "Access log"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-brand-500 text-brand-600" : "border-transparent text-surface-600 hover:text-surface-900"}`}>{l}</button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : tab === "roles" ? <RolesTab members={members} canEdit={myRole === "owner" || myRole === "admin"} /> : tab === "people" ? (
        <div className="bg-white border border-surface-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm m-cards">
            <thead>
              <tr className="text-left text-xs text-surface-500 bg-surface-50 border-b border-surface-200">
                <th className="px-4 py-2.5 font-medium">Person</th><th className="px-3 py-2.5 font-medium">Role</th>
                <th className="px-3 py-2.5 font-medium">Can open</th><th className="px-3 py-2.5 font-medium">Leads</th>
                <th className="px-3 py-2.5 font-medium">Last seen</th><th className="px-3 py-2.5 font-medium">Open tasks</th><th className="px-3 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-b border-surface-100 last:border-0">
                  <td data-kind="primary" className={`px-4 py-3 ${m.is_active ? "" : "opacity-60"}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-xs font-bold uppercase flex-shrink-0">{m.email.slice(0, 2)}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-surface-900 truncate">{m.email}</p>
                        <p className="text-xs text-surface-500 truncate">{m.job_title || ROLE_INFO[m.role]?.label}</p>
                      </div>
                    </div>
                  </td>
                  <td data-label="Role" className="px-3 py-3">
                    <div className="flex flex-wrap gap-1 justify-end md:justify-start">
                      <Badge variant={m.role === "owner" ? "success" : m.role === "admin" ? "primary" : "default"} size="sm">{ROLE_INFO[m.role]?.label ?? m.role}</Badge>
                      {m.invite_pending && <Badge variant={m.invite_expired ? "danger" : "warning"} size="sm">{m.invite_expired ? "Invite expired" : "Invite pending"}</Badge>}
                      {!m.is_active && <Badge variant="danger" size="sm">Access off</Badge>}
                    </div>
                  </td>
                  <td data-label="Can open" className="px-3 py-3 text-surface-600">
                    {m.role === "owner" || m.role === "admin" ? "Everything" : <>{m.permissions.length} of 11 areas{m.custom_permissions && <span className="text-xs text-brand-600"> · custom</span>}</>}
                  </td>
                  <td data-label="Leads" className="px-3 py-3">{m.leads_owned}</td>
                  <td data-label="Last seen" className="px-3 py-3 text-surface-600">{m.invite_pending ? "Not joined yet" : m.last_seen_at ? ago(m.last_seen_at) : "—"}</td>
                  <td data-label="Open tasks" className="px-3 py-3">
                    <Link to={`/crm?tab=tasks&assignee=${m.user_id}`} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                      <ListChecks size={13} />{m.open_tasks}{m.overdue_tasks > 0 && <span className="text-danger-dark font-medium whitespace-nowrap"> · {m.overdue_tasks} overdue</span>}
                    </Link>
                  </td>
                  <td data-kind="actions" className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      {m.invite_pending && canManage(m) && <Button size="xs" variant="secondary" icon={<Mail size={13} />} onClick={() => resend(m)}>{m.invite_expired ? "Send a new invite" : "Resend invite"}</Button>}
                      {canManage(m) && <Button size="xs" variant="secondary" icon={<Pencil size={13} />} onClick={() => setDialog({ member: m })}>Manage</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-surface-200 rounded-lg">
          {activity.length === 0 ? <p className="p-5 text-center text-sm text-surface-500">Nothing yet. Invites, role changes and access changes appear here.</p> : (
            <ul className="divide-y divide-surface-100">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                  <ShieldCheck size={16} className="mt-0.5 text-brand-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-surface-900"><span className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</span> — {a.detail}</p>
                    <p className="text-xs text-surface-500">{a.actor ? `by ${a.actor}` : "by system"} · {ago(a.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {dialog && (
        <MemberDialog
          member={dialog.member} myRole={myRole}
          onClose={() => setDialog(null)}
          onDone={(msg) => { setDialog(null); if (msg) setNotice(msg); load(); }}
          onLimit={(l) => { setDialog(null); setLimit(l); }}
        />
      )}
      {limit && <UpgradeLimitModal {...limit} onClose={() => setLimit(null)} />}
    </AppLayout>
  );
}

