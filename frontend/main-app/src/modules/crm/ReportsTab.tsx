import { Link } from "react-router-dom";
import StackBars from "../../components/StackBars";
import { useEffect, useState } from "react";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import { fetchReports, taka, SOURCE_LABELS, useSources, type CrmReports } from "../../lib/crm";

function Tile({ value, label, hint }: { value: string | number; label: string; hint?: string }) {
  return (
    <div className="bg-white border border-surface-200 rounded-[4px] px-4 py-3">
      <p className="text-xl font-bold text-surface-900 leading-none">{value}</p>
      <p className="text-xs text-surface-600 mt-1">{label}</p>
      {hint && <p className="text-[11px] text-surface-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function Panel({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="bg-white border border-surface-200 rounded-[4px] p-4">
      <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
      {note && <p className="text-xs text-surface-500 mt-0.5">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function ReportsTab() {
  const [days, setDays] = useState(30);
  useSources();
  const [r, setR] = useState<CrmReports | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { setR(null); fetchReports(days).then(setR).catch((e) => setError(e.message)); }, [days]);

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!r) return <div className="flex justify-center py-12"><Spinner /></div>;
  const s = r.summary;
  const maxFunnel = Math.max(1, ...r.funnel.map((f) => f.count));
  const maxSource = Math.max(1, ...r.by_source.map((x) => x.leads));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-surface-600">Period</span>
        {[7, 30, 90].map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`px-3 py-1 rounded-[3px] text-xs font-medium border ${days === d ? "bg-brand-500 text-white border-brand-500" : "bg-white text-surface-600 border-surface-200"}`}>Last {d} days</button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile value={s.new_leads} label="New leads" hint={`${s.total_leads} in total`} />
        <Tile value={s.win_rate == null ? "—" : `${s.win_rate}%`} label="Win rate" hint={`${s.won} won · ${s.lost} lost`} />
        <Tile value={taka(s.pipeline_value)} label="Open pipeline value" hint={s.forecast_missing ? `Forecast ${taka(s.forecast)} · set win chances in Customize` : `Forecast ${taka(s.forecast)} (weighted)`} />
        <Tile value={taka(s.won_value)} label="Won in period" />
        <Tile value={r.follow_up.rate == null ? "—" : `${r.follow_up.rate}%`} label="Follow-ups on time" hint={`${r.follow_up.due} were due`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile value={r.sales_cycle_days == null ? "—" : `${r.sales_cycle_days} days`} label="Average sales cycle" hint="from first contact to won" />
        <Tile value={r.stale_leads} label="Stale leads" hint="open, no movement for 14+ days" />
        <Tile value={taka(r.dues.total)} label="Dues to collect" hint={`${r.dues.customers} customers · ${r.dues.overdue} overdue`} />
        <Tile value={r.tasks.open} label="Open follow-ups" hint={`${r.tasks.overdue} overdue · ${r.tasks.done} done in period`} />
        <Tile value={`${r.score_bands.hot} hot`} label="Lead quality" hint={`${r.score_bands.warm} warm · ${r.score_bands.cold} cold`} />
      </div>

      <Panel title="Lead flow" note="New leads, wins and losses each day.">
        <StackBars days={r.trend.map((t) => t.date)} rows={r.trend as unknown as Record<string, number>[]}
          series={[{ key: "new", label: "New leads", color: "#6366f1" }, { key: "won", label: "Won", color: "#10b981" }, { key: "lost", label: "Lost", color: "#ef4444" }]} />
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Sales funnel" note="Where your leads are right now, and how long they’ve waited there on average.">
          <div className="space-y-2.5">
            {r.funnel.map((f) => (
              <div key={f.stage_id}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-surface-800">{f.name} <span className="text-surface-400">· {f.count}{f.probability != null ? ` · ${f.probability}% chance` : ""}</span></span>
                  <span className="text-surface-500">{f.avg_days_in_stage}d avg{f.value > 0 ? ` · ${taka(f.value)}` : ""}</span>
                </div>
                <div className="h-2.5 rounded-full bg-surface-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(f.count / maxFunnel) * 100}%`, backgroundColor: f.color }} /></div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Where leads come from" note="Won customers are counted per source.">
          {r.by_source.length === 0 ? <p className="text-sm text-surface-500">No leads yet.</p> : (
            <div className="space-y-2.5">
              {r.by_source.map((x) => (
                <div key={x.source}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-surface-800">{SOURCE_LABELS[x.source] ?? x.source} <span className="text-surface-400">· {x.leads}</span></span>
                    <span className="text-surface-500">{x.won} won · {x.leads ? Math.round((100 * x.won) / x.leads) : 0}%{x.won_value > 0 ? ` · ${taka(x.won_value)}` : ""}{x.won > 0 && x.won_value > 0 ? ` · avg ${taka(Math.round(x.won_value / x.won))}` : ""}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-surface-100 overflow-hidden"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(x.leads / maxSource) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Why leads are lost">
          {r.lost_reasons.length === 0 ? <p className="text-sm text-surface-500">No lost reasons recorded yet. You’re asked when a lead moves to a “Lost” stage.</p> : (
            <ul className="space-y-1.5 text-sm">
              {r.lost_reasons.map((x) => <li key={x.reason} className="flex justify-between"><span className="text-surface-800">{x.reason}</span><span className="text-surface-500">{x.count}</span></li>)}
            </ul>
          )}
        </Panel>

        <Panel title="Follow-up discipline" note="Tasks that came due in this period.">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><p className="text-lg font-bold text-success-dark">{r.follow_up.on_time}</p><p className="text-xs text-surface-600">On time</p></div>
            <div><p className="text-lg font-bold text-warning-dark">{r.follow_up.late}</p><p className="text-xs text-surface-600">Done late</p></div>
            <div><p className="text-lg font-bold text-danger-dark">{r.follow_up.missed}</p><p className="text-xs text-surface-600">Not done</p></div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Stage movement" note={`How many leads entered each stage in the last ${days} days.`}>
          <div className="space-y-2">
            {r.stage_flow.map((f) => (
              <div key={f.stage_id} className="flex items-center gap-2 text-xs">
                <span className="w-28 truncate text-surface-800 font-medium">{f.name}</span>
                <span className="flex-1 h-2.5 bg-surface-100 rounded-[2px] overflow-hidden"><span className="block h-full" style={{ width: `${(f.entered / Math.max(1, ...r.stage_flow.map((x) => x.entered))) * 100}%`, backgroundColor: f.color }} /></span>
                <span className="w-8 text-right text-surface-600">{f.entered}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Lead quality" note="Score from how complete and recent the lead is.">
          {(() => { const b = r.score_bands, tot = Math.max(1, b.hot + b.warm + b.cold); return (
            <>
              <div className="flex h-3 rounded-[3px] overflow-hidden bg-surface-100">
                <div style={{ flex: b.hot, backgroundColor: "#ef4444" }} /><div style={{ flex: b.warm, backgroundColor: "#f59e0b" }} /><div style={{ flex: b.cold, backgroundColor: "#94a3b8" }} />
              </div>
              <div className="grid grid-cols-3 gap-3 text-center mt-3">
                {[["Hot", b.hot, "text-danger-dark"], ["Warm", b.warm, "text-warning-dark"], ["Cold", b.cold, "text-surface-600"]].map(([l, n, c]) => (
                  <div key={l as string}><p className={`text-lg font-bold ${c}`}>{n}</p><p className="text-xs text-surface-600">{l} · {Math.round((100 * (n as number)) / tot)}%</p></div>
                ))}
              </div>
            </>
          ); })()}
        </Panel>

        <Panel title="Best places" note="Top districts by leads. Won value shows where money is made.">
          {r.by_district.length === 0 ? <p className="text-sm text-surface-500">Add a district to your contacts to see this.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm m-cards m-square">
              <thead><tr className="text-left text-xs text-surface-500 border-b border-surface-200"><th className="py-1.5 pr-2 font-medium">District</th><th className="py-1.5 px-2 font-medium">Leads</th><th className="py-1.5 px-2 font-medium">Won</th><th className="py-1.5 px-2 font-medium">Won value</th><th className="py-1.5 pl-2 font-medium">Pipeline</th></tr></thead>
              <tbody>{r.by_district.map((d) => (
                <tr key={d.name} className="border-b border-surface-100 last:border-0">
                  <td data-kind="primary" className="py-1.5 pr-2 font-medium text-surface-900">{d.name}</td><td data-label="Leads" className="py-1.5 px-2">{d.leads}</td>
                  <td data-label="Won" className="py-1.5 px-2">{d.won}</td><td data-label="Won value" className="py-1.5 px-2">{taka(d.won_value)}</td><td data-label="Pipeline" className="py-1.5 pl-2">{taka(d.pipeline)}</td>
                </tr>))}</tbody>
            </table></div>
          )}
        </Panel>

        <Panel title="Customer types" note="Retail, wholesale and others.">
          {r.by_type.length === 0 ? <p className="text-sm text-surface-500">No customer types set yet.</p> : (
            <div className="space-y-2.5">
              {r.by_type.map((d) => (
                <div key={d.name}>
                  <div className="flex justify-between text-xs mb-1"><span className="font-medium text-surface-800 capitalize">{d.name} <span className="text-surface-400">· {d.leads}</span></span><span className="text-surface-500">{d.won} won · {taka(d.won_value)}</span></div>
                  <div className="h-2.5 rounded-[2px] bg-surface-100 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${(d.leads / Math.max(1, ...r.by_type.map((x) => x.leads))) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Team activity" note="Per-person scorecard, daily activity and a live feed.">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-surface-700">{r.people.reduce((n, p) => n + p.calls + p.visits + p.meetings, 0)} customer touchpoints and {r.people.reduce((n, p) => n + p.stage_moves, 0)} stage moves in the last {days} days.</p>
          <Link to="/crm?tab=team" className="text-sm font-medium text-brand-600 hover:underline">Open the Team tab →</Link>
        </div>
      </Panel>
    </div>
  );
}
