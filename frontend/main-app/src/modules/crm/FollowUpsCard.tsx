import { FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Phone, MapPin, Users, Trash2, CalendarPlus } from "lucide-react";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Alert from "../../components/Alert";
import { createTask, deleteTask, fetchContactTasks, logActivity, updateTask, type CrmTask, type TeamMember } from "../../lib/crm";
import { fmtDue } from "./TasksTab";

function Wrap({ bare, children }: { bare: boolean; children: React.ReactNode }) {
  return bare ? <div>{children}</div> : <Card>{children}</Card>;
}

const KINDS = [["follow_up", "Follow-up"], ["call", "Call"], ["visit", "Visit"], ["meeting", "Meeting"], ["payment", "Collect payment"]];

function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function quick(days: number) { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(10, 0, 0, 0); return localInput(d); }

export default function FollowUpsCard({ contactId, team, onChanged, bare = false }: { contactId: string; team: TeamMember[]; onChanged: () => void; bare?: boolean }) {
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("follow_up");
  const [due, setDue] = useState(quick(1));
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);
  const [logKind, setLogKind] = useState<"call" | "visit" | "meeting" | null>(null);
  const [logText, setLogText] = useState("");

  const load = useCallback(() => { fetchContactTasks(contactId).then(setTasks).catch((e) => setError(e.message)); }, [contactId]);
  useEffect(load, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true); setError("");
    try {
      await createTask(contactId, { title: title.trim(), due_at: new Date(due).toISOString(), kind, assignee_user_id: assignee || null });
      setTitle(""); load(); onChanged();
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };
  const toggle = async (t: CrmTask) => { try { await updateTask(t.id, { done: !t.done_at }); load(); onChanged(); } catch (e: any) { setError(e.message); } };
  const remove = async (t: CrmTask) => { try { await deleteTask(t.id); load(); onChanged(); } catch (e: any) { setError(e.message); } };
  const saveLog = async () => {
    if (!logKind) return;
    try { await logActivity(contactId, logKind, logText.trim()); setLogKind(null); setLogText(""); onChanged(); } catch (e: any) { setError(e.message); }
  };

  const open = tasks.filter((t) => !t.done_at);
  const done = tasks.filter((t) => t.done_at);

  return (
    <Wrap bare={bare}>
      {!bare && <h2 className="text-sm font-semibold text-surface-900 mb-3">Follow-ups &amp; activity log</h2>}
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}

      <div className="flex flex-wrap gap-2 mb-3">
        <span className="text-xs text-surface-500 self-center mr-1">Just did:</span>
        {([["call", "Call", Phone], ["visit", "Visit", MapPin], ["meeting", "Meeting", Users]] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => setLogKind(logKind === k ? null : k)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border ${logKind === k ? "bg-brand-500 text-white border-brand-500" : "bg-white text-surface-700 border-surface-200 hover:bg-surface-50"}`}><Icon size={13} />Log {l.toLowerCase()}</button>
        ))}
      </div>
      {logKind && (
        <div className="flex gap-2 mb-4">
          <input autoFocus value={logText} onChange={(e) => setLogText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveLog()} maxLength={500}
            placeholder="What happened? (e.g. asked for a discount, will decide Friday)" className="flex-1 border border-surface-200 rounded-md px-3 py-2 text-sm" />
          <Button size="sm" onClick={saveLog}>Save</Button>
        </div>
      )}

      {open.length === 0 && done.length === 0 && <p className="text-sm text-surface-500 mb-3">No follow-ups yet. Schedule the next step below so this lead isn’t forgotten.</p>}
      <ul className="space-y-1.5 mb-4">
        {[...open, ...done].map((t) => (
          <li key={t.id} className={`flex items-center gap-2.5 border rounded-md px-2.5 py-2 ${t.overdue ? "border-danger-base/40 bg-danger-light/30" : "border-surface-200"}`}>
            <button onClick={() => toggle(t)} aria-label={t.done_at ? "Mark not done" : "Mark done"}>{t.done_at ? <CheckCircle2 size={18} className="text-success-base" /> : <Circle size={18} className="text-surface-400 hover:text-success-base" />}</button>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${t.done_at ? "line-through text-surface-400" : "text-surface-900"}`}>{t.title}</p>
              <p className={`text-xs ${t.overdue ? "text-danger-dark font-medium" : "text-surface-500"}`}>{t.done_at ? "Done" : fmtDue(t.due_at)}{t.overdue && " · overdue"}</p>
            </div>
            <button onClick={() => remove(t)} aria-label="Delete" className="text-surface-300 hover:text-danger-base"><Trash2 size={14} /></button>
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="border-t border-surface-100 pt-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-surface-500 flex items-center gap-1.5"><CalendarPlus size={13} />Add follow-up</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call back about the price list" maxLength={300} className="w-full border border-surface-200 rounded-md px-3 py-2 text-sm" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="border border-surface-200 rounded-md px-2 py-2 text-sm bg-white">{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="border border-surface-200 rounded-md px-2 py-2 text-sm" />
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="border border-surface-200 rounded-md px-2 py-2 text-sm bg-white">
            <option value="">Assign to: lead owner / me</option>{team.map((t) => <option key={t.user_id} value={t.user_id}>{t.email}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[["Today 5pm", 0, 17], ["Tomorrow", 1, 10], ["In 3 days", 3, 10], ["Next week", 7, 10]].map(([l, d, h]) => (
            <button type="button" key={l as string} onClick={() => { const x = new Date(); x.setDate(x.getDate() + (d as number)); x.setHours(h as number, 0, 0, 0); setDue(localInput(x)); }}
              className="px-2 py-0.5 rounded-full text-[11px] border border-surface-200 text-surface-600 hover:bg-surface-50">{l}</button>
          ))}
          <Button type="submit" size="sm" className="ml-auto" loading={saving} disabled={!title.trim()}>Add</Button>
        </div>
      </form>
    </Wrap>
  );
}
