import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDown, CalendarCheck, Footprints, MapPin, Phone, Repeat, Trophy, Users, UserRound, X } from "lucide-react";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import StackBars from "../../components/StackBars";
import { fetchTeamActivity, taka, type TeamActivity, type TeamPerson } from "../../lib/crm";

const SERIES = [
  { key: "calls", label: "Calls", color: "#6366f1" }, { key: "visits", label: "Visits", color: "#10b981" }, { key: "meetings", label: "Meetings", color: "#f59e0b" },
  { key: "stage_moves", label: "Stage moves", color: "#06b6d4" }, { key: "tasks_done", label: "Tasks done", color: "#94a3b8" },
];
const KINDS: [string, string][] = [["", "All"], ["call", "Calls"], ["visit", "Visits"], ["meeting", "Meetings"], ["stage_change", "Stage moves"], ["task_done", "Tasks done"]];
const KIND_ICON: Record<string, React.ReactNode> = {
  call: <Phone size={13} />, visit: <MapPin size={13} />, meeting: <Users size={13} />, stage_change: <Repeat size={13} />, task_done: <CalendarCheck size={13} />, owner_change: <UserRound size={13} />,
};
const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Team member", sales: "Sales" };

function ago(iso: string | null) {
  if (!iso) return "never";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-BD", { day: "numeric", month: "short" });
}
const when = (iso: string) => new Date(iso).toLocaleString("en-BD", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Tile({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="bg-white border border-surface-200 rounded-[4px] px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-xs text-surface-500">{icon}{label}</div>
      <p className="text-xl font-bold text-surface-900 mt-1 leading-none">{value}</p>
      {hint && <p className="text-[11px] text-surface-400 mt-1">{hint}</p>}
    </div>
  );
}

type SortKey = "activities" | "won_value" | "win_rate" | "tasks_overdue" | "leads_owned";

export default function TeamActivityTab({ canManage }: { canManage: boolean }) {
  const [days, setDays] = useState(30);
  const [user, setUser] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const [data, setData] = useState<TeamActivity | null>(null);
  const [all, setAll] = useState<TeamActivity | null>(null);       // org-wide numbers, kept while one person is selected
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("activities");

  useEffect(() => {
    fetchTeamActivity(days, user ?? undefined, kind || undefined).then((d) => { setData(d); if (!user) setAll(d); }).catch((e) => setError(e.message));
  }, [days, user, kind]);
  useEffect(() => { if (user) fetchTeamActivity(days).then(setAll).catch(() => undefined); }, [days, user]);

  const people = useMemo(() => [...(all?.people ?? [])].filter((p) => p.leads_owned || p.activities || p.tasks_open || p.tasks_done).sort((a, b) =>
    sort === "win_rate" ? (b.win_rate ?? -1) - (a.win_rate ?? -1) : (b[sort] as number) - (a[sort] as number)), [all, sort]);
  const idle = (all?.people ?? []).filter((p) => !(p.leads_owned || p.activities || p.tasks_open || p.tasks_done));

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!data || !all) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const t = all.people.reduce((a, p) => ({ acts: a.acts + p.activities, touch: a.touch + p.calls + p.visits + p.meetings, done: a.done + p.tasks_done, ontime: a.ontime + p.tasks_on_time, over: a.over + p.tasks_overdue, won: a.won + p.won, wonValue: a.wonValue + p.won_value, active: a.active + (p.activities > 0 ? 1 : 0) }), { acts: 0, touch: 0, done: 0, ontime: 0, over: 0, won: 0, wonValue: 0, active: 0 });
  const sel: TeamPerson | undefined = canManage ? (user ? all.people.find((p) => p.user_id === user) : undefined) : all.people[0];
  const th = (k: SortKey, label: string, title?: string) => (
    <th className="px-2.5 py-2 text-left text-[11px] font-semibold text-surface-500 uppercase tracking-wide whitespace-nowrap">
      <button type="button" title={title ?? `Sort by ${label}`} onClick={() => setSort(k)} className={`inline-flex items-center gap-1 ${sort === k ? "text-brand-700" : "hover:text-surface-800"}`}>{label}{sort === k && <ArrowDown size={11} />}</button>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-surface-600">Period</span>
        {[7, 30, 90].map((d) => <button key={d} onClick={() => setDays(d)} className={`px-3 py-1 rounded-[3px] text-xs font-medium border ${days === d ? "bg-brand-500 text-white border-brand-500" : "bg-white text-surface-600 border-surface-200"}`}>Last {d} days</button>)}
        {canManage && sel && <button onClick={() => { setUser(null); setKind(""); }} className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] bg-brand-50 border border-brand-200 text-xs font-medium text-brand-700">Showing {sel.name} <X size={12} /></button>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile icon={<Footprints size={13} />} label={canManage ? "Team activities" : "My activities"} value={t.acts} hint={canManage ? `${t.active} of ${all.people.length} people active` : "in this period"} />
        <Tile icon={<Phone size={13} />} label="Customer touchpoints" value={t.touch} hint="calls + visits + meetings" />
        <Tile icon={<Trophy size={13} />} label="Deals won" value={t.won} hint={taka(t.wonValue)} />
        <Tile icon={<CalendarCheck size={13} />} label="Tasks done on time" value={t.done ? `${Math.round((100 * t.ontime) / t.done)}%` : "—"} hint={`${t.done} finished`} />
        <Tile icon={<AlertTriangle size={13} />} label="Overdue tasks now" value={<span className={t.over ? "text-danger-dark" : ""}>{t.over}</span>} hint={canManage ? "across the team" : "assigned to you"} />
      </div>

      {/* leaderboard */}
      <section className="bg-white border border-surface-200 rounded-[4px] overflow-hidden">
        <header className="px-4 py-2.5 border-b border-surface-100"><h2 className="text-sm font-semibold text-surface-900">{canManage ? "Team scorecard" : "My scorecard"}</h2><p className="text-xs text-surface-500">{canManage ? "Click a person to see their pipeline, tasks and recent activity." : "You can see your own numbers. Owners and admins see the whole team."}</p></header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm m-cards m-square">
            <thead className="bg-surface-50 border-b border-surface-200"><tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-surface-500 uppercase tracking-wide">Person</th>
              {th("leads_owned", "Leads")}{th("won_value", "Won", "Deals won in the period")}{th("win_rate", "Win %")}
              <th className="px-2.5 py-2 text-left text-[11px] font-semibold text-surface-500 uppercase tracking-wide">Calls</th><th className="px-2.5 py-2 text-left text-[11px] font-semibold text-surface-500 uppercase tracking-wide">Visits</th><th className="px-2.5 py-2 text-left text-[11px] font-semibold text-surface-500 uppercase tracking-wide">Meetings</th>
              {th("activities", "Activity")}<th className="px-2.5 py-2 text-left text-[11px] font-semibold text-surface-500 uppercase tracking-wide">Tasks</th>{th("tasks_overdue", "Overdue")}
              <th className="px-2.5 py-2 text-left text-[11px] font-semibold text-surface-500 uppercase tracking-wide whitespace-nowrap">Last active</th>
            </tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.user_id} onClick={canManage ? () => { setUser(user === p.user_id ? null : p.user_id); setKind(""); } : undefined}
                  className={`border-b border-surface-100 last:border-0 ${canManage ? "cursor-pointer" : ""} ${user === p.user_id ? "bg-brand-50/60" : canManage ? "hover:bg-surface-50/70" : ""}`}>
                  <td data-kind="primary" className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5"><span className="w-8 h-8 rounded-full bg-brand-50 text-brand-600 text-xs font-bold flex items-center justify-center uppercase flex-shrink-0">{p.name.slice(0, 2)}</span>
                      <span className="min-w-0"><span className="block font-semibold text-surface-900 truncate">{p.name}</span><span className="block text-[11px] text-surface-500 truncate">{p.job_title || ROLE[p.role] || p.role}</span></span></div>
                  </td>
                  <td data-label="Leads" className="px-2.5 py-2.5"><span className="font-semibold text-surface-900">{p.leads_owned}</span><span className="text-[11px] text-surface-500"> · {p.open_leads} open</span></td>
                  <td data-label="Won" className="px-2.5 py-2.5"><span className="font-semibold text-surface-900">{p.won}</span>{p.won_value > 0 && <span className="text-[11px] text-success-dark"> · {taka(p.won_value)}</span>}</td>
                  <td data-label="Win %" className="px-2.5 py-2.5 text-surface-700">{p.win_rate == null ? <span className="text-surface-300">—</span> : `${p.win_rate}%`}</td>
                  <td data-label="Calls" className="px-2.5 py-2.5">{p.calls}</td><td data-label="Visits" className="px-2.5 py-2.5">{p.visits}</td><td data-label="Meetings" className="px-2.5 py-2.5">{p.meetings}</td>
                  <td data-label="Activity" className="px-2.5 py-2.5"><div className="flex items-center gap-2"><span className="font-semibold text-surface-900 w-6">{p.activities}</span>
                    <span className="hidden md:block h-1.5 w-16 rounded-full bg-surface-100 overflow-hidden"><span className="block h-full bg-brand-500" style={{ width: `${Math.min(100, (p.activities / Math.max(...people.map((x) => x.activities), 1)) * 100)}%` }} /></span></div></td>
                  <td data-label="Tasks" className="px-2.5 py-2.5 text-xs text-surface-600">{p.tasks_done} done · {p.tasks_open} open{p.on_time_rate != null && <span className="text-surface-400"> · {p.on_time_rate}% on time</span>}</td>
                  <td data-label="Overdue" className="px-2.5 py-2.5">{p.tasks_overdue ? <span className="inline-block px-1.5 py-0.5 rounded-[3px] bg-danger-light text-danger-dark text-xs font-semibold">{p.tasks_overdue}</span> : <span className="text-surface-300">0</span>}</td>
                  <td data-label="Last active" className="px-2.5 py-2.5 text-xs text-surface-500 whitespace-nowrap">{ago(p.last_active)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canManage && idle.length > 0 && <p className="px-4 py-2 border-t border-surface-100 text-xs text-surface-500">No work yet: {idle.map((p) => p.name).join(", ")}.</p>}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 items-stretch">
        {/* chart + (selected person) pipeline & open tasks */}
        <div className="space-y-4 min-w-0">
          <section className="bg-white border border-surface-200 rounded-[4px] p-4">
            <h2 className="text-sm font-semibold text-surface-900">Daily activity {sel ? `— ${sel.name}` : "— whole team"}</h2>
            <p className="text-xs text-surface-500 mb-3">What was logged each day. Hover a bar for the numbers.</p>
            <StackBars days={data.daily.map((d) => d.date)} rows={data.daily as unknown as Record<string, number>[]} series={SERIES} height={sel ? 200 : 290} />
          </section>

          {sel && data.detail && (
            <section className="bg-white border border-surface-200 rounded-[4px] p-4 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div><h2 className="text-sm font-semibold text-surface-900">{sel.name} <span className="font-normal text-surface-500">· {sel.job_title || ROLE[sel.role]}</span></h2>
                  <p className="text-xs text-surface-500">{sel.email} · last active {ago(sel.last_active)}</p></div>
                <div className="flex gap-4 text-right">
                  <div><p className="text-lg font-bold text-surface-900 leading-none">{taka(sel.pipeline_value)}</p><p className="text-[11px] text-surface-500">open pipeline</p></div>
                  <div><p className="text-lg font-bold text-success-dark leading-none">{taka(sel.won_value)}</p><p className="text-[11px] text-surface-500">won ({days}d)</p></div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-surface-700 mb-1.5">Their leads by stage</p>
                <div className="flex h-3 rounded-[3px] overflow-hidden bg-surface-100">
                  {data.detail.by_stage.filter((s) => s.count > 0).map((s) => <div key={s.name} title={`${s.name}: ${s.count}`} style={{ flex: s.count, backgroundColor: s.color }} />)}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">{data.detail.by_stage.map((s) => <span key={s.name} className="inline-flex items-center gap-1 text-[11px] text-surface-600"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />{s.name} {s.count}</span>)}</div>
              </div>
              <div>
                <p className="text-xs font-semibold text-surface-700 mb-1.5">Open tasks</p>
                {data.detail.open_tasks.length === 0 ? <p className="text-sm text-surface-500">Nothing open.</p> : (
                  <ul className="divide-y divide-surface-100 border border-surface-200 rounded-[3px]">
                    {data.detail.open_tasks.map((tk) => (
                      <li key={tk.id} className="flex items-center gap-2 px-2.5 py-2 text-sm">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tk.overdue ? "bg-danger-base" : "bg-surface-300"}`} />
                        <span className="min-w-0 flex-1 truncate text-surface-900">{tk.title}{tk.contact && <span className="text-surface-500"> · {tk.contact_id ? <Link to={`/contacts/${tk.contact_id}`} className="hover:text-brand-600">{tk.contact}</Link> : tk.contact}</span>}</span>
                        <span className={`text-xs whitespace-nowrap ${tk.overdue ? "text-danger-dark font-medium" : "text-surface-500"}`}>{tk.overdue ? "overdue · " : ""}{when(tk.due_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </div>

        {/* feed */}
        <section className="bg-white border border-surface-200 rounded-[4px] min-w-0 flex flex-col">
          <header className="px-4 py-3 border-b border-surface-100">
            <h2 className="text-sm font-semibold text-surface-900">Recent activity {sel ? `— ${sel.name}` : ""}</h2>
            <div className="flex flex-wrap gap-1 mt-2">{KINDS.map(([k, l]) => <button key={k} onClick={() => setKind(k)} className={`px-2 py-0.5 rounded-[3px] text-[11px] font-medium border ${kind === k ? "bg-brand-500 text-white border-brand-500" : "bg-white text-surface-600 border-surface-200 hover:bg-surface-50"}`}>{l}</button>)}</div>
          </header>
          {data.feed.length === 0 ? <p className="p-5 text-center text-sm text-surface-500">No activity matches.</p> : (
            <div className="relative flex-1 min-h-[340px]"><ul className="divide-y divide-surface-100 max-h-[340px] xl:max-h-none xl:absolute xl:inset-0 overflow-y-auto">
              {data.feed.map((f) => (
                <li key={f.id} className="flex gap-2.5 px-4 py-2.5">
                  <span className="mt-0.5 w-6 h-6 rounded-[3px] bg-surface-100 text-surface-600 flex items-center justify-center flex-shrink-0">{KIND_ICON[f.kind] ?? <Footprints size={13} />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-surface-900"><button className="font-semibold hover:text-brand-600" onClick={() => { if (!canManage) return; const p = all.people.find((x) => x.name === f.user); if (p) { setUser(p.user_id); setKind(""); } }}>{f.user}</button> · <Link to={`/contacts/${f.contact_id}`} className="text-brand-600 hover:underline">{f.contact}</Link></p>
                    <p className="text-xs text-surface-600 break-words">{f.summary}</p>
                    <p className="text-[11px] text-surface-400 mt-0.5">{when(f.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul></div>
          )}
        </section>
      </div>
    </div>
  );
}
