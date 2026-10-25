import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Phone, MessageCircle, MessageSquare, Trash2, CalendarClock, CheckCircle2, Circle, Plus, X } from "lucide-react";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Spinner from "../../components/Spinner";
import { addTaskComment, createTeamTask, fetchTaskComments, type TaskComment, deleteTask, fetchTasks, updateTask, whatsappLink, type CrmTask, type TeamMember } from "../../lib/crm";

const SCOPES = [["today", "Today & overdue"], ["upcoming", "Upcoming"], ["overdue", "Overdue"], ["done", "Done"]] as const;
const KIND_LABEL: Record<string, string> = { follow_up: "Follow-up", call: "Call", visit: "Visit", meeting: "Meeting", payment: "Payment" };
const PRIORITY_CLS: Record<string, string> = { high: "bg-danger-light text-danger-dark", low: "bg-surface-100 text-surface-500" };

export function fmtDue(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  const time = d.toLocaleTimeString("en-BD", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;
  return d.toLocaleDateString("en-BD", { weekday: "short", day: "numeric", month: "short" }) + `, ${time}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function NewTaskDialog({ team, onClose, onCreated }: { team: TeamMember[]; onClose: () => void; onCreated: () => void }) {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(10, 0, 0, 0);
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [due, setDue] = useState(localInput(tomorrow)); const [who, setWho] = useState(""); const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const f = "w-full border border-surface-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500";
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try { await createTeamTask({ title: title.trim(), description: desc.trim() || undefined, due_at: new Date(due).toISOString(), assignee_user_id: who || null, priority, kind: "follow_up" }); onCreated(); onClose(); }
    catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form onSubmit={submit} className="bg-white rounded-[6px] shadow-2xl w-full max-w-md animate-slide-up" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-100">
          <h2 className="font-semibold text-surface-900">New task</h2>
          <button type="button" onClick={onClose} className="p-1 rounded text-surface-400 hover:bg-surface-100" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {error && <Alert variant="error">{error}</Alert>}
          <input autoFocus className={f} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done? (e.g. Prepare Eid SMS list)" maxLength={300} />
          <textarea className={f} rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Details (optional)" maxLength={2000} />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-surface-500">Assign to</label>
              <select className={f} value={who} onChange={(e) => setWho(e.target.value)}><option value="">Me</option>{team.map((t) => <option key={t.user_id} value={t.user_id}>{t.email}</option>)}</select></div>
            <div><label className="text-xs text-surface-500">Priority</label>
              <select className={f} value={priority} onChange={(e) => setPriority(e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></div>
          </div>
          <div><label className="text-xs text-surface-500">Due</label><input type="datetime-local" className={f} value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <p className="text-xs text-surface-500">The assignee gets an email now and another when it is due. To link a task to a lead, add it from the lead’s page.</p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-surface-100">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" loading={busy} disabled={!title.trim()}>Create task</Button>
        </div>
      </form>
    </div>
  );
}

function Comments({ taskId }: { taskId: string }) {
  const [items, setItems] = useState<TaskComment[] | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { fetchTaskComments(taskId).then(setItems).catch((e) => setErr(e.message)); }, [taskId]);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try { const c = await addTaskComment(taskId, text.trim()); setItems((p) => [...(p ?? []), c]); setText(""); } catch (x: any) { setErr(x.message); }
  };
  return (
    <div className="mt-2 border-t border-surface-100 pt-2">
      {err && <p className="text-xs text-danger-dark mb-1">{err}</p>}
      {items === null ? <p className="text-xs text-surface-400">Loading…</p> : items.length === 0 ? <p className="text-xs text-surface-400">No comments yet.</p> : (
        <ul className="space-y-1.5 mb-2">
          {items.map((c) => (
            <li key={c.id} className="text-xs"><span className="font-medium text-surface-800">{c.author?.split("@")[0] ?? "Someone"}</span>
              <span className="text-surface-400"> · {new Date(c.created_at).toLocaleString("en-BD", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <p className="text-surface-700 whitespace-pre-wrap">{c.body}</p></li>
          ))}
        </ul>
      )}
      <form onSubmit={send} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a comment…" maxLength={2000} className="flex-1 border border-surface-200 rounded-md px-2.5 py-1.5 text-xs" />
        <Button type="submit" size="xs" disabled={!text.trim()}>Post</Button>
      </form>
    </div>
  );
}

export default function TasksTab({ isSales, team, myId, onChanged }: { isSales: boolean; team: TeamMember[]; myId: string | null; onChanged: () => void }) {
  const [params, setParams] = useSearchParams();
  const [scope, setScope] = useState<(typeof SCOPES)[number][0]>("today");
  // who: "all" | "me" | "assigned_by_me" | "unassigned" | <user id>
  const [who, setWho] = useState(params.get("assignee") ?? (isSales ? "me" : "all"));
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [openComments, setOpenComments] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const opts = who === "me" ? { mine: true } : who === "assigned_by_me" ? { assignedByMe: true } : who === "unassigned" ? { unassigned: true } : who !== "all" ? { assignee: who } : {};
    fetchTasks(scope, opts).then((t) => { setTasks(t); setError(""); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [scope, who]);
  useEffect(load, [load]);
  // A link from the Team page (?assignee=…) should show that person's open work, not just today.
  useEffect(() => { if (params.get("assignee")) setScope("upcoming"); }, [params]);

  const refresh = () => { load(); onChanged(); };
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); refresh(); } catch (e: any) { setError(e.message); } };
  const snooze = (t: CrmTask, days: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(10, 0, 0, 0); return act(() => updateTask(t.id, { due_at: d.toISOString() })); };
  const nameOf = (id: string | null) => (id ? team.find((m) => m.user_id === id)?.email.split("@")[0] ?? "teammate" : "Unassigned");

  return (
    <div>
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="flex gap-1 bg-surface-100 p-1 rounded-md overflow-x-auto" role="tablist">
          {SCOPES.map(([k, label]) => (
            <button key={k} onClick={() => setScope(k)} role="tab" aria-selected={scope === k}
              className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${scope === k ? "bg-white shadow-sm text-surface-900" : "text-surface-600 hover:text-surface-900"}`}>{label}</button>
          ))}
        </div>
        {!isSales && (
          <select value={who} onChange={(e) => { setWho(e.target.value); if (params.get("assignee")) setParams({ tab: "tasks" }, { replace: true }); }} aria-label="Whose tasks"
            className="border border-surface-200 rounded-md px-3 py-2 text-sm bg-white text-surface-700">
            <option value="all">Everyone’s tasks</option>
            <option value="me">Assigned to me</option>
            <option value="assigned_by_me">I assigned to others</option>
            <option value="unassigned">Not assigned</option>
            {team.filter((m) => m.user_id !== myId).map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
          </select>
        )}
        <Button size="sm" className="sm:ml-auto" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New task</Button>
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner /></div> : tasks.length === 0 ? (
        <div className="text-center py-14 bg-white border border-surface-200 rounded-lg">
          <CalendarClock size={28} className="mx-auto text-surface-300 mb-2" />
          <p className="text-sm font-medium text-surface-700">{scope === "done" ? "Nothing completed yet" : "You’re all caught up"}</p>
          <p className="text-xs text-surface-500 mt-1">Create a task for yourself or a teammate, or add a follow-up from a lead’s page.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => {
            const wa = whatsappLink(t.contact_phone);
            return (
              <li key={t.id} className={`bg-white border rounded-lg px-3.5 py-3 flex items-start gap-3 ${t.overdue ? "border-danger-base/40" : "border-surface-200"}`}>
                <button onClick={() => act(() => updateTask(t.id, { done: !t.done_at }))} aria-label={t.done_at ? "Mark not done" : "Mark done"} className="mt-0.5 text-surface-400 hover:text-success-base">
                  {t.done_at ? <CheckCircle2 size={20} className="text-success-base" /> : <Circle size={20} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${t.done_at ? "line-through text-surface-400" : "text-surface-900"}`}>
                    {t.title}{t.priority !== "normal" && <span className={`ml-2 align-middle px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${PRIORITY_CLS[t.priority]}`}>{t.priority}</span>}
                  </p>
                  {t.description && <p className="text-xs text-surface-600 mt-0.5 whitespace-pre-wrap">{t.description}</p>}
                  <p className="text-xs text-surface-600 mt-0.5">
                    {t.contact_id ? <><Link to={`/contacts/${t.contact_id}`} state={{ from: "crm" }} className="text-brand-600 hover:underline font-medium">{t.contact_name || "Open lead"}</Link>{" · "}</> : <>Team task{" · "}</>}
                    {KIND_LABEL[t.kind] ?? t.kind}
                    {" · "}<span className={t.overdue ? "text-danger-dark font-medium" : ""}>{t.done_at ? `Done ${fmtDue(t.done_at)}` : fmtDue(t.due_at)}{t.overdue ? " (overdue)" : ""}</span>
                  </p>
                  {!t.done_at && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {!isSales && (
                        <select value={t.assignee_user_id ?? ""} onChange={(e) => act(() => updateTask(t.id, { assignee_user_id: e.target.value || null }))}
                          aria-label="Assign to" className="border border-surface-200 rounded px-1.5 py-0.5 text-[11px] bg-white text-surface-700">
                          <option value="">Unassigned</option>
                          {team.map((m) => <option key={m.user_id} value={m.user_id}>{nameOf(m.user_id)}</option>)}
                        </select>
                      )}
                      <span className="text-[11px] text-surface-500">Snooze:</span>
                      {[["Tomorrow", 1], ["3 days", 3], ["Next week", 7]].map(([l, d]) => (
                        <button key={l as string} onClick={() => snooze(t, d as number)} className="px-2 py-0.5 rounded-full text-[11px] border border-surface-200 text-surface-600 hover:bg-surface-50">{l}</button>
                      ))}
                    </div>
                  )}
                  {t.done_at && <p className="text-[11px] text-surface-400 mt-1">Assigned to {nameOf(t.assignee_user_id)}</p>}
                  {openComments === t.id && <Comments taskId={t.id} />}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {t.contact_phone && <a href={`tel:${t.contact_phone}`} aria-label="Call" className="p-2 rounded bg-surface-100 text-surface-600 hover:text-brand-600"><Phone size={14} /></a>}
                  {wa && <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="p-2 rounded bg-success-light text-success-dark"><MessageCircle size={14} /></a>}
                  <button onClick={() => setOpenComments(openComments === t.id ? null : t.id)} aria-label="Comments" title="Comments" className={`p-2 rounded ${openComments === t.id ? "bg-brand-50 text-brand-600" : "text-surface-400 hover:text-brand-600"}`}><MessageSquare size={14} /></button>
                  <button onClick={() => act(() => deleteTask(t.id))} aria-label="Delete task" className="p-2 rounded text-surface-400 hover:text-danger-base"><Trash2 size={14} /></button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {creating && <NewTaskDialog team={team} onClose={() => setCreating(false)} onCreated={refresh} />}
    </div>
  );
}
