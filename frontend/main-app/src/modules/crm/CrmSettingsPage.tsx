import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AlarmClock, ArrowDown, ArrowUp, Check, ChevronDown, GripVertical, ListChecks, Megaphone, Plus, RotateCcw, SlidersHorizontal, Tags,
  Trash2, Users, Workflow, X,
} from "lucide-react";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Spinner from "../../components/Spinner";
import Toggle from "../../components/Toggle";
import { useMe } from "../../lib/permissions";
import {
  applySources, createCustomField, createStage, DEFAULT_BOARD_PREFS, deleteCustomField, deleteStage, fetchCustomFields, fetchSettings, fetchStages,
  reorderCustomFields, reorderStages, saveSettings, taka, updateCustomField, updateStage,
  type BoardPrefs, type CrmSettings, type CustomField, type PipelineStage, type StageOutcome,
} from "../../lib/crm";

export const PALETTE = ["#3B82F6", "#6366F1", "#8B5CF6", "#EC4899", "#EF4444", "#F59E0B", "#10B981", "#14B8A6", "#06B6D4", "#64748B", "#6B7280", "#84CC16"];
const OUTCOME: Record<StageOutcome, { label: string; hint: string }> = {
  open: { label: "In progress", hint: "Still being worked on" }, won: { label: "Won", hint: "Became a customer" }, lost: { label: "Lost", hint: "Did not buy" },
};
const DEFAULT_REASONS = ["Price too high", "Chose a competitor", "No response", "Not interested", "Out of budget", "Wrong number"];
const inp = "border border-surface-200 rounded-[3px] px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500";

const SECTIONS = [
  { id: "stages", label: "Sales stages", icon: Workflow }, { id: "sources", label: "Lead sources", icon: Megaphone },
  { id: "lost", label: "Lost reasons", icon: Tags }, { id: "board", label: "Board display", icon: SlidersHorizontal },
  { id: "team", label: "Team & reminders", icon: Users }, { id: "fields", label: "Extra fields", icon: ListChecks },
] as const;

function Section({ id, icon: Icon, title, hint, children, status }: { id: string; icon: typeof Workflow; title: string; hint: string; children: ReactNode; status?: ReactNode }) {
  return (
    <section id={id} className="bg-white border border-surface-200 rounded-[4px] scroll-mt-20">
      <header className="flex items-start gap-3 px-4 sm:px-5 py-3 border-b border-surface-100">
        <span className="w-8 h-8 rounded-[3px] bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0"><Icon size={16} /></span>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-surface-900">{title}</h2><p className="text-xs text-surface-500 mt-0.5">{hint}</p></div>
        {status}
      </header>
      <div className="p-4 sm:p-4">{children}</div>
    </section>
  );
}

export function Saved({ at }: { at: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => { if (!at) return; setOn(true); const t = setTimeout(() => setOn(false), 1800); return () => clearTimeout(t); }, [at]);
  return <span className={`inline-flex items-center gap-1 text-xs text-success-dark transition-opacity ${on ? "opacity-100" : "opacity-0"}`}><Check size={13} />Saved</span>;
}

// ── a single stage row ──────────────────────────────────────────────────────────
export function StageRow({ st, others, dragging, compact = false, onChange, onDelete, onDragStart, onDragOver, onDrop, onDragEnd }: {
  st: PipelineStage; others: PipelineStage[]; dragging: boolean; compact?: boolean;
  onChange: (patch: Partial<PipelineStage>, save: boolean) => void; onDelete: (moveTo?: string) => void;
  onDragStart: () => void; onDragOver: () => void; onDrop: () => void; onDragEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const has = [st.probability != null, st.stale_days != null, st.auto_task_days != null].filter(Boolean).length;
  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v))));

  return (
    <div draggable onDragStart={onDragStart} onDragOver={(e) => { e.preventDefault(); onDragOver(); }} onDrop={(e) => { e.preventDefault(); onDrop(); }} onDragEnd={onDragEnd}
      className={`border rounded-[3px] bg-white ${dragging ? "opacity-40 border-brand-300" : "border-surface-200"}`}>
      <div className="flex items-center gap-2 px-2 py-2">
        <GripVertical size={16} className="text-surface-300 cursor-grab flex-shrink-0" aria-hidden />
        <label className="relative flex-shrink-0 cursor-pointer" title="Colour">
          <span className="block w-6 h-6 rounded-[3px] border border-black/10" style={{ backgroundColor: st.color }} />
          <input type="color" value={st.color} onChange={(e) => onChange({ color: e.target.value }, false)} onBlur={(e) => onChange({ color: e.target.value }, true)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" aria-label="Stage colour" />
        </label>
        <input value={st.name} maxLength={100} aria-label="Stage name" onChange={(e) => onChange({ name: e.target.value }, false)} onBlur={(e) => e.target.value.trim() && onChange({ name: e.target.value.trim() }, true)} className={`${inp} flex-1 min-w-0 font-medium`} />
        <select value={st.outcome} aria-label="Stage type" onChange={(e) => onChange({ outcome: e.target.value as StageOutcome }, true)} className={`${inp} hidden sm:block text-xs`}>
          {(Object.keys(OUTCOME) as StageOutcome[]).map((o) => <option key={o} value={o}>{OUTCOME[o].label}</option>)}
        </select>
        <span className="hidden md:inline text-xs text-surface-500 w-14 text-right" title="Leads in this stage">{st.lead_count} lead{st.lead_count === 1 ? "" : "s"}</span>
        {!compact && <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-[3px] text-xs font-medium border ${open ? "bg-brand-50 border-brand-200 text-brand-700" : "border-surface-200 text-surface-600 hover:bg-surface-50"}`}>
          More{has > 0 && <span className="bg-brand-500 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center">{has}</span>}<ChevronDown size={13} className={open ? "rotate-180" : ""} />
        </button>}
        <button type="button" onClick={() => setDel(true)} aria-label={`Delete ${st.name}`} className="p-1.5 text-surface-400 hover:text-danger-base"><Trash2 size={15} /></button>
      </div>

      {open && !compact && (
        <div className="border-t border-surface-100 bg-surface-50/60 px-3 py-3 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="sm:hidden"><label className="text-xs text-surface-500">Type</label>
            <select value={st.outcome} onChange={(e) => onChange({ outcome: e.target.value as StageOutcome }, true)} className={`${inp} w-full`}>{(Object.keys(OUTCOME) as StageOutcome[]).map((o) => <option key={o} value={o}>{OUTCOME[o].label}</option>)}</select></div>
          <div>
            <label className="text-xs font-medium text-surface-700">Chance of winning</label>
            <div className="flex items-center gap-2 mt-1"><input type="number" min={0} max={100} value={st.probability ?? ""} placeholder="—" onChange={(e) => onChange({ probability: num(e.target.value) }, false)} onBlur={(e) => onChange({ probability: num(e.target.value) }, true)} className={`${inp} w-20`} /><span className="text-sm text-surface-500">%</span></div>
            <p className="text-[11px] text-surface-500 mt-1">Used for the forecast in Reports (deal value × chance).</p>
          </div>
          <div>
            <label className="text-xs font-medium text-surface-700">Flag leads that wait too long</label>
            <div className="flex items-center gap-2 mt-1 text-sm text-surface-600">after <input type="number" min={1} max={365} value={st.stale_days ?? ""} placeholder="off" onChange={(e) => onChange({ stale_days: num(e.target.value) || null }, false)} onBlur={(e) => onChange({ stale_days: num(e.target.value) || null }, true)} className={`${inp} w-20`} /> days</div>
            <p className="text-[11px] text-surface-500 mt-1">The card gets a red edge on the board.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-surface-700">When a lead enters this stage</label>
            <div className="flex items-center gap-2 mt-1 text-sm text-surface-600">add a follow-up in <input type="number" min={0} max={365} value={st.auto_task_days ?? ""} placeholder="off" onChange={(e) => onChange({ auto_task_days: e.target.value === "" ? null : num(e.target.value) }, false)} onBlur={(e) => onChange({ auto_task_days: e.target.value === "" ? null : num(e.target.value) }, true)} className={`${inp} w-16`} /> days</div>
            {st.auto_task_days != null && <input value={st.auto_task_title ?? ""} maxLength={200} placeholder="Task title (e.g. Send quotation)" onChange={(e) => onChange({ auto_task_title: e.target.value }, false)} onBlur={(e) => onChange({ auto_task_title: e.target.value }, true)} className={`${inp} w-full mt-1.5`} />}
          </div>
        </div>
      )}

      {del && (
        <div className="border-t border-danger-base/20 bg-danger-light/40 px-3 py-2.5 flex items-center gap-2 flex-wrap text-sm">
          <span className="text-danger-dark">Delete “{st.name}”?{st.lead_count > 0 ? ` Move its ${st.lead_count} lead${st.lead_count > 1 ? "s" : ""} to` : ""}</span>
          {st.lead_count > 0 && <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className={`${inp} text-xs`}><option value="">first open stage</option>{others.filter((o) => o.id !== st.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}
          <span className="ml-auto flex gap-3"><button className="font-semibold text-danger-dark" onClick={() => onDelete(moveTo || undefined)}>Delete</button><button className="text-surface-600" onClick={() => setDel(false)}>Keep</button></span>
        </div>
      )}
    </div>
  );
}

/** Everything you can customize, inside the CRM's Customize tab. */
export default function CrmCustomize() {
  const hash = useLocation().hash;
  const { me } = useMe();
  const canEdit = me ? me.my_role === "owner" || me.my_role === "admin" : false;
  const [stages, setStages] = useState<PipelineStage[] | null>(null);
  const [settings, setSettings] = useState<CrmSettings | null>(null);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [newStage, setNewStage] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newSource, setNewSource] = useState("");
  const [fLabel, setFLabel] = useState(""); const [fType, setFType] = useState("text"); const [fOptions, setFOptions] = useState("");
  const [editField, setEditField] = useState<{ id: string; label: string; options: string } | null>(null);
  const [active, setActive] = useState<string>("stages");
  const pending = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(() => {
    Promise.all([fetchStages(), fetchSettings(), fetchCustomFields()])
      .then(([st, se, f]) => { setStages([...st].sort((a, b) => a.position - b.position)); setSettings(se); setFields(f); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  const tick = (k: string) => setSaved((s) => ({ ...s, [k]: Date.now() }));
  const guard = async (key: string, fn: () => Promise<void>) => { setError(""); try { await fn(); tick(key); } catch (e) { setError(e instanceof Error ? e.message : "Could not save"); } };

  // arriving from a card in the Customize tab: jump to that section
  useEffect(() => { if (stages && settings && hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" }), 50); }, [stages, settings, hash]);

  // scroll spy for the side menu
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((entries) => { const v = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setActive(v.target.id); }, { rootMargin: "-20% 0px -65% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [stages, settings]);

  // ── stages ──
  const patchStage = (id: string, patch: Partial<PipelineStage>, save: boolean) => {
    setStages((p) => p?.map((s) => (s.id === id ? { ...s, ...patch } : s)) ?? null);
    if (!save) return;
    guard("stages", async () => { const { name, color, outcome, probability, stale_days, auto_task_days, auto_task_title } = patch; await updateStage(id, { name, color, outcome, probability, stale_days, auto_task_days, auto_task_title }); });
  };
  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId || !stages) return;
    const next = [...stages]; const from = next.findIndex((s) => s.id === dragId), to = next.findIndex((s) => s.id === targetId);
    const [m] = next.splice(from, 1); next.splice(to, 0, m);
    setStages(next); setDragId(null);
    guard("stages", async () => { await reorderStages(next.map((s) => s.id)); });
  };
  const addStage = () => guard("stages", async () => {
    if (!newStage.trim() || !stages) return;
    const c = await createStage({ name: newStage.trim(), color: PALETTE[stages.length % PALETTE.length] });
    setStages([...stages, { ...c, lead_count: 0 }]); setNewStage("");
  });

  // ── settings (debounced auto-save) ──
  const saveSetting = (key: string, patch: Parameters<typeof saveSettings>[0], optimistic: Partial<CrmSettings>, delay = 0) => {
    setSettings((s) => (s ? { ...s, ...optimistic } : s));
    clearTimeout(pending.current[key]);
    pending.current[key] = setTimeout(() => guard(key, async () => { const s = await saveSettings(patch); setSettings(s); applySources(s.sources); }), delay);
  };
  const reasons = settings?.lost_reasons ?? [];
  const setReasons = (next: string[]) => saveSetting("lost", { lost_reasons: next }, { lost_reasons: next });
  const setSources = (next: { key: string; label: string }[]) => saveSetting("sources", { sources: next }, { sources: next }, 600);
  const prefs = settings?.board_prefs ?? DEFAULT_BOARD_PREFS;
  const setPref = (p: Partial<BoardPrefs>) => saveSetting("board", { board_prefs: p }, { board_prefs: { ...prefs, ...p } });

  if (!stages || !settings) return error ? <Alert variant="error">{error}</Alert> : <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  const dis = !canEdit;

  return (
    <>
      <p className="text-sm text-surface-600 mb-3">Changes save automatically and apply to everyone on your team.</p>
      {!canEdit && <Alert variant="info" className="mb-4">Only the owner or an admin can change these settings. You can look around.</Alert>}
      {error && <Alert variant="error" className="mb-4" onDismiss={() => setError("")}>{error}</Alert>}

      {/* section menu: sticky on desktop, a scrolling chip bar on phones */}
      <div className="lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-6 items-start">
        <nav className="lg:sticky lg:top-3 mb-4 lg:mb-0" aria-label="Sections">
          <ul className="flex flex-wrap lg:flex-col gap-1">
            {SECTIONS.map((s) => (
              <li key={s.id}><a href={`#${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); setActive(s.id); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-[3px] text-sm whitespace-nowrap border ${active === s.id ? "bg-white border-surface-200 text-brand-700 font-semibold shadow-sm" : "border-transparent text-surface-600 hover:bg-white/70"}`}><s.icon size={15} />{s.label}</a></li>
            ))}
          </ul>
        </nav>

        <div className="space-y-4 min-w-0">
          {/* STAGES */}
          <Section id="stages" icon={Workflow} title="Sales stages" hint="Drag to reorder. Mark which stage means Won and which means Lost. Open “More” for the win chance, a warning for slow leads, and automatic follow-ups." status={<Saved at={saved.stages ?? 0} />}>
            <fieldset disabled={dis} className="min-w-0 space-y-1.5">
              {stages.map((st) => (
                <StageRow key={st.id} st={st} others={stages} dragging={dragId === st.id}
                  onChange={(p, save) => patchStage(st.id, p, save)}
                  onDelete={(moveTo) => guard("stages", async () => { await deleteStage(st.id, moveTo); load(); })}
                  onDragStart={() => setDragId(st.id)} onDragOver={() => undefined} onDrop={() => dropOn(st.id)} onDragEnd={() => setDragId(null)} />
              ))}
              <div className="flex gap-2 pt-2">
                <input value={newStage} onChange={(e) => setNewStage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStage()} placeholder="New stage name (e.g. Quotation sent)" className={`${inp} flex-1`} />
                <Button size="sm" icon={<Plus size={14} />} onClick={addStage} disabled={!newStage.trim()}>Add stage</Button>
              </div>
            </fieldset>
          </Section>

          {/* SOURCES */}
          <Section id="sources" icon={Megaphone} title="Lead sources" hint="Where your leads come from. These are the choices when you add a lead, and what the Reports group by." status={<Saved at={saved.sources ?? 0} />}>
            <fieldset disabled={dis} className="min-w-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5">
                {settings.sources.map((s, i) => (
                  <div key={s.key} className="flex items-center gap-1 border border-surface-200 rounded-[3px] bg-white pl-2">
                    <input value={s.label} maxLength={40} aria-label="Source name" onChange={(e) => setSources(settings.sources.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} className="flex-1 min-w-0 py-1.5 text-sm bg-transparent focus:outline-none" />
                    <button type="button" aria-label={`Remove ${s.label}`} disabled={settings.sources.length <= 1} onClick={() => setSources(settings.sources.filter((_, k) => k !== i))} className="p-1.5 text-surface-400 hover:text-danger-base disabled:opacity-30"><X size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3 max-w-md">
                <input value={newSource} onChange={(e) => setNewSource(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newSource.trim()) { setSources([...settings.sources, { key: "", label: newSource.trim() }]); setNewSource(""); } }} placeholder="Add a source (e.g. Daraz, Exhibition)" className={`${inp} flex-1`} />
                <Button size="sm" variant="secondary" icon={<Plus size={14} />} disabled={!newSource.trim()} onClick={() => { setSources([...settings.sources, { key: "", label: newSource.trim() }]); setNewSource(""); }}>Add</Button>
              </div>
              <p className="text-[11px] text-surface-500 mt-2">Renaming a source changes how it is shown; contacts that already have it keep it.</p>
            </fieldset>
          </Section>

          {/* LOST REASONS */}
          <Section id="lost" icon={Tags} title="Lost reasons" hint="The quick choices shown when a lead is marked Lost. They feed the “Why leads are lost” report." status={<Saved at={saved.lost ?? 0} />}>
            <fieldset disabled={dis} className="min-w-0">
              <div className="flex flex-wrap gap-1.5">
                {reasons.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-[3px] bg-surface-100 text-sm text-surface-800">{r}
                    <button type="button" aria-label={`Remove ${r}`} onClick={() => setReasons(reasons.filter((x) => x !== r))} className="p-0.5 text-surface-400 hover:text-danger-base"><X size={13} /></button></span>
                ))}
                {reasons.length === 0 && <span className="text-sm text-surface-500">No quick reasons — people can still type their own.</span>}
              </div>
              <div className="flex gap-2 mt-3 max-w-md">
                <input value={newReason} onChange={(e) => setNewReason(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newReason.trim()) { setReasons([...reasons, newReason.trim()]); setNewReason(""); } }} placeholder="Add a reason (e.g. Delivery too slow)" className={`${inp} flex-1`} />
                <Button size="sm" variant="secondary" icon={<Plus size={14} />} disabled={!newReason.trim()} onClick={() => { setReasons([...reasons, newReason.trim()]); setNewReason(""); }}>Add</Button>
              </div>
              <button type="button" onClick={() => setReasons(DEFAULT_REASONS)} className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"><RotateCcw size={12} />Use the standard list</button>
            </fieldset>
          </Section>

          {/* BOARD */}
          <Section id="board" icon={SlidersHorizontal} title="Board display" hint="What each lead card shows and how cards are ordered in a column." status={<Saved at={saved.board ?? 0} />}>
            <fieldset disabled={dis} className="min-w-0 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px] gap-5">
              <div className="space-y-3">
                {([["show_value", "Deal value"], ["show_company", "Shop / company"], ["show_source", "Lead source"], ["show_due", "Follow-up due marker"], ["stale_highlight", "Highlight leads that wait too long (needs “days” on the stage)"]] as const).map(([k, l]) => (
                  <label key={k} className="flex items-center justify-between gap-3 text-sm text-surface-800"><span>{l}</span><Toggle value={prefs[k]} onChange={(v) => setPref({ [k]: v })} /></label>
                ))}
                <div className="pt-3 border-t border-surface-100">
                  <p className="text-sm font-medium text-surface-800 mb-1.5">Order cards by</p>
                  <div className="flex flex-wrap gap-1.5">
                    {([["recent", "Newest first"], ["value", "Biggest deal first"], ["waiting", "Waiting longest first"]] as const).map(([k, l]) => (
                      <button key={k} type="button" onClick={() => setPref({ sort: k })} className={`px-3 py-1.5 rounded-[3px] border text-sm ${prefs.sort === k ? "bg-brand-500 border-brand-500 text-white" : "bg-white border-surface-200 text-surface-700 hover:bg-surface-50"}`}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-surface-500 mb-1.5">Preview</p>
                <div className="rounded-[3px] border border-surface-200 border-l-[3px] border-l-danger-base bg-white px-2.5 py-2 shadow-sm">
                  <p className="text-[13px] font-semibold text-surface-900 truncate">Rahim Uddin</p>
                  {prefs.show_company && <p className="text-[11px] text-surface-500 truncate">Rahim Fashion · Gulshan, Dhaka</p>}
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {prefs.show_value && <span className="px-1.5 py-px rounded-[3px] bg-success-light text-success-dark text-[11px] font-semibold">{taka(2500000)}</span>}
                    {prefs.show_due && <span className="px-1.5 py-px rounded-[3px] bg-danger-light text-danger-dark text-[11px]">Overdue</span>}
                    {prefs.show_source && <span className="px-1.5 py-px rounded-[3px] bg-info-light text-info-dark text-[11px]">Facebook</span>}
                  </div>
                  {prefs.stale_highlight && <p className="text-[10px] text-danger-dark mt-1.5">● Waiting 9 days in this stage</p>}
                </div>
              </div>
            </fieldset>
          </Section>

          {/* TEAM */}
          <Section id="team" icon={Users} title="Team & reminders" hint="How new leads are handed out and when people are nudged." status={<Saved at={saved.team ?? 0} />}>
            <fieldset disabled={dis} className="min-w-0 space-y-4">
              <label className="flex items-start justify-between gap-4"><span><span className="block text-sm font-medium text-surface-900">Share new leads round-robin</span><span className="block text-xs text-surface-500">Each new lead goes to the next teammate in turn. Off: leads have no owner until you assign one.</span></span>
                <Toggle value={settings.round_robin} onChange={(v) => saveSetting("team", { round_robin: v }, { round_robin: v })} /></label>
              <label className="flex items-start justify-between gap-4"><span><span className="block text-sm font-medium text-surface-900 flex items-center gap-1.5"><AlarmClock size={14} />Email a reminder when a follow-up is due</span><span className="block text-xs text-surface-500">Sent to whoever the task is assigned to (checked every 15 minutes).</span></span>
                <Toggle value={settings.task_reminders} onChange={(v) => saveSetting("team", { task_reminders: v }, { task_reminders: v })} /></label>
              <p className="text-xs text-surface-500">Who can open what is managed on the <Link to="/team" className="text-brand-600 hover:underline">Team</Link> page.</p>
            </fieldset>
          </Section>

          {/* EXTRA FIELDS */}
          <Section id="fields" icon={ListChecks} title="Extra fields" hint="Details specific to your business (shop size, product interest, delivery area…). Up to 20. They appear on every lead and can be used in segments." status={<Saved at={saved.fields ?? 0} />}>
            <fieldset disabled={dis} className="min-w-0">
              {fields.length === 0 && <p className="text-sm text-surface-500 mb-3">No extra fields yet.</p>}
              <div className="space-y-1.5">
                {fields.map((f, i) => (
                  <div key={f.id} className="border border-surface-200 rounded-[3px] bg-white">
                    {editField?.id === f.id ? (
                      <div className="p-2.5 space-y-2">
                        <input value={editField.label} onChange={(e) => setEditField({ ...editField, label: e.target.value })} className={`${inp} w-full`} aria-label="Field name" />
                        {f.field_type === "select" && <input value={editField.options} onChange={(e) => setEditField({ ...editField, options: e.target.value })} placeholder="Choices, comma separated" className={`${inp} w-full`} />}
                        <div className="flex justify-end gap-2"><Button size="xs" variant="ghost" onClick={() => setEditField(null)}>Cancel</Button>
                          <Button size="xs" onClick={() => guard("fields", async () => { const u = await updateCustomField(f.id, { label: editField.label, options: editField.options.split(",").map((x) => x.trim()).filter(Boolean) }); setFields((p) => p.map((x) => (x.id === f.id ? u : x))); setEditField(null); })}>Save</Button></div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-2.5 py-2">
                        <span className="flex flex-col"><button type="button" disabled={i === 0} aria-label="Move up" onClick={() => { const n = [...fields]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setFields(n); guard("fields", async () => { await reorderCustomFields(n.map((x) => x.id)); }); }} className="text-surface-400 hover:text-surface-800 disabled:opacity-25"><ArrowUp size={13} /></button>
                          <button type="button" disabled={i === fields.length - 1} aria-label="Move down" onClick={() => { const n = [...fields]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setFields(n); guard("fields", async () => { await reorderCustomFields(n.map((x) => x.id)); }); }} className="text-surface-400 hover:text-surface-800 disabled:opacity-25"><ArrowDown size={13} /></button></span>
                        <span className="min-w-0 flex-1 text-sm"><span className="font-medium text-surface-900">{f.label}</span> <span className="text-xs text-surface-500">· {f.field_type === "select" ? "choice" : f.field_type}{f.options.length ? ` (${f.options.join(", ")})` : ""}</span></span>
                        <button type="button" onClick={() => setEditField({ id: f.id, label: f.label, options: f.options.join(", ") })} className="text-xs text-brand-600 hover:underline">Edit</button>
                        <button type="button" aria-label={`Delete ${f.label}`} onClick={() => guard("fields", async () => { await deleteCustomField(f.id); setFields((p) => p.filter((x) => x.id !== f.id)); })} className="p-1 text-surface-400 hover:text-danger-base"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px_auto] gap-2 mt-3">
                <input value={fLabel} onChange={(e) => setFLabel(e.target.value)} placeholder="New field name (e.g. Shop size)" className={inp} />
                <select value={fType} onChange={(e) => setFType(e.target.value)} className={inp}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="select">Choice</option></select>
                <Button size="sm" icon={<Plus size={14} />} disabled={!fLabel.trim() || fields.length >= 20} onClick={() => guard("fields", async () => { const f = await createCustomField({ label: fLabel.trim(), field_type: fType, options: fOptions.split(",").map((x) => x.trim()).filter(Boolean) }); setFields((p) => [...p, f]); setFLabel(""); setFOptions(""); setFType("text"); })}>Add field</Button>
                {fType === "select" && <input value={fOptions} onChange={(e) => setFOptions(e.target.value)} placeholder="Choices, comma separated (Small, Medium, Large)" className={`${inp} sm:col-span-3`} />}
              </div>
            </fieldset>
          </Section>
        </div>
      </div>
    </>
  );
}
