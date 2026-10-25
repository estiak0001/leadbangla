import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clock, Maximize2, MessageCircle, Minimize2, Phone, Plus, Search } from "lucide-react";
import Button from "../../components/Button";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import {
  createStage, DEFAULT_BOARD_PREFS, fetchColumnMore, fetchPipeline, fetchSettings, updateContactStage, taka, whatsappLink, SOURCE_LABELS, useSources,
  type BoardPrefs, type KanbanColumn, type KanbanContact, type TeamMember,
} from "../../lib/crm";
import LostReasonDialog from "./LostReasonDialog";

type ScoreFilter = "all" | "hot" | "warm" | "cold";
const SCORE_FILTERS: { key: ScoreFilter; label: string }[] = [
  { key: "all", label: "All" }, { key: "hot", label: "Hot 60+" }, { key: "warm", label: "Warm 30–59" }, { key: "cold", label: "Cold <30" },
];
const matchesScore = (s: number, f: ScoreFilter) =>
  f === "all" || (f === "hot" ? s >= 60 : f === "warm" ? s >= 30 && s < 60 : s < 30);

export const leadName = (c: { first_name: string | null; last_name: string | null; email: string | null; phone: string | null; company?: string | null }) =>
  [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || c.email || c.phone || "Unnamed lead";

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 60 ? "bg-success-light text-success-dark" : score >= 30 ? "bg-warning-light text-warning-dark" : "bg-surface-100 text-surface-500";
  return <span title="Lead score" className={`px-1.5 py-0.5 rounded text-xs font-semibold ${cls}`}>{score}</span>;
}

/** "Overdue" / "Today" / "in 3d" chip for the next open follow-up. */
function TaskChip({ due }: { due: string }) {
  const d = new Date(due);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const overdue = d.getTime() < now.getTime();
  const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  const [cls, text] = overdue && !sameDay ? ["bg-danger-light text-danger-dark", "Overdue"]
    : sameDay ? [overdue ? "bg-danger-light text-danger-dark" : "bg-warning-light text-warning-dark", overdue ? "Due now" : "Today"]
    : ["bg-surface-100 text-surface-600", `in ${days}d`];
  return <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${cls}`} title={`Follow-up ${d.toLocaleString()}`}><Clock size={11} />{text}</span>;
}

function Avatar({ team, id }: { team: TeamMember[]; id: string | null }) {
  if (!id) return null;
  const m = team.find((t) => t.user_id === id);
  return (
    <span title={`Owner: ${m?.email ?? "teammate"}`} className="w-5 h-5 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center uppercase">
      {(m?.name ?? "?").slice(0, 2)}
    </span>
  );
}

type Tier = "full" | "slim" | "mini";
const tierFor = (w: number): Tier => (w >= 240 ? "full" : w >= 150 ? "slim" : "mini");

function DueDot({ due, tier }: { due: string; tier: Tier }) {
  const d = new Date(due), now = new Date();
  const overdue = d.getTime() < now.getTime();
  const today = d.toDateString() === now.toDateString();
  if (tier === "full") return <TaskChip due={due} />;
  return <span title={`Follow-up ${d.toLocaleString()}`} className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${overdue && !today ? "bg-danger-base" : today ? "bg-warning-base" : "bg-surface-300"}`} />;
}

function ContactCard({
  contact, stages, team, tier, prefs, staleDays, onDragStart, onDragEnd, onMove, dragging,
}: {
  contact: KanbanContact; stages: { id: string | null; name: string }[]; team: TeamMember[]; tier: Tier; prefs: BoardPrefs; staleDays: number | null;
  onDragStart: (id: string) => void; onDragEnd: () => void; onMove: (id: string, stageId: string | null) => void; dragging: boolean;
}) {
  const navigate = useNavigate();
  const open = () => navigate(`/contacts/${contact.id}`, { state: { from: "crm" } });
  const wa = whatsappLink(contact.whatsapp_number || contact.phone);
  const place = [contact.area, contact.district ?? contact.city].filter(Boolean).join(", ");
  const name = leadName(contact);
  const score = contact.lead_score;
  const scoreCls = score >= 60 ? "bg-success-base" : score >= 30 ? "bg-warning-base" : "bg-surface-300";
  const tip = [name, staleDays ? `waiting ${staleDays} days` : "", contact.company, place, contact.deal_value != null ? taka(contact.deal_value) : "", contact.source ? SOURCE_LABELS[contact.source] : "", `score ${score}`].filter(Boolean).join(" · ");

  const actions = (
    <div className={`items-center gap-1 ${tier === "full" ? "flex" : "hidden group-hover:flex [@media(hover:none)]:flex"}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <select aria-label={`Move ${name} to stage`} value={contact.pipeline_stage_id ?? ""} onChange={(e) => onMove(contact.id, e.target.value || null)}
        className="flex-1 min-w-0 text-[11px] border border-surface-200 rounded-[3px] px-1 py-0.5 bg-white text-surface-600">
        {stages.map((st) => <option key={st.id ?? "none"} value={st.id ?? ""}>{tier === "mini" ? st.name : `Move to: ${st.name}`}</option>)}
      </select>
      {contact.phone && <a href={`tel:${contact.phone}`} aria-label="Call" className="p-1 rounded-[3px] bg-surface-100 text-surface-600 hover:text-brand-600"><Phone size={12} /></a>}
      {wa && <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="p-1 rounded-[3px] bg-success-light text-success-dark"><MessageCircle size={12} /></a>}
    </div>
  );

  return (
    <div
      draggable role="link" tabIndex={0} title={tier === "full" ? undefined : tip} onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter") open(); }}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(contact.id); }} onDragEnd={onDragEnd}
      className={`group bg-white rounded-[3px] border border-surface-200 border-l-[3px] hover:border-brand-300 hover:shadow-md cursor-pointer select-none transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${dragging ? "opacity-40" : ""} ${tier === "full" ? "px-2.5 py-2" : "px-2 py-1.5"}`}
      style={{ borderLeftColor: staleDays ? "#ef4444" : score >= 60 ? "#22c55e" : score >= 30 ? "#f59e0b" : "#cbd5e1" }}
    >
      {tier === "full" ? (
        <>
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-surface-900 truncate flex-1">{name}</p>
            <ScoreBadge score={score} />
          </div>
          {((prefs.show_company && contact.company) || place) && <p className="text-[11px] text-surface-500 truncate mt-0.5">{[prefs.show_company ? contact.company : null, place].filter(Boolean).join(" · ")}</p>}
          {staleDays ? <p className="text-[10px] font-medium text-danger-dark mt-0.5">● Waiting {staleDays} days</p> : null}
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            {prefs.show_value && contact.deal_value != null && <span className="px-1.5 py-px rounded-[3px] bg-success-light text-success-dark text-[11px] font-semibold">{taka(contact.deal_value)}</span>}
            {prefs.show_due && contact.next_task_due && <DueDot due={contact.next_task_due} tier={tier} />}
            {prefs.show_source && contact.source && <span className="px-1.5 py-px rounded-[3px] bg-info-light text-info-dark text-[11px]">{SOURCE_LABELS[contact.source] ?? contact.source}</span>}
            <span className="ml-auto"><Avatar team={team} id={contact.owner_user_id} /></span>
          </div>
          <div className="mt-1.5">{actions}</div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5">
            <p className={`font-semibold text-surface-900 truncate flex-1 ${tier === "slim" ? "text-[12.5px]" : "text-xs"}`}>{name}</p>
            {prefs.show_due && contact.next_task_due && <DueDot due={contact.next_task_due} tier={tier} />}
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${scoreCls}`} title={`Lead score ${score}`} />
          </div>
          <p className="text-[11px] leading-tight truncate mt-0.5">
            {prefs.show_value && contact.deal_value != null ? <span className="font-semibold text-success-dark">{taka(contact.deal_value)}</span> : <span className="text-surface-400">{(prefs.show_company && contact.company) || place || contact.phone || "—"}</span>}
            {prefs.show_value && contact.deal_value != null && tier === "slim" && ((prefs.show_company && contact.company) || place) && <span className="text-surface-500"> · {(prefs.show_company && contact.company) || place}</span>}
          </p>
          <div className="mt-1 hidden group-hover:block [@media(hover:none)]:block">{actions}</div>
        </>
      )}
    </div>
  );
}

function KanbanCol({
  column, shown, stages, team, tier, width, prefs, draggedId, loadingMore, onDragStart, onDragEnd, onDrop, onMove, onMore,
}: {
  column: KanbanColumn; shown: KanbanContact[]; stages: { id: string | null; name: string }[]; team: TeamMember[]; tier: Tier; width: number; prefs: BoardPrefs;
  draggedId: string | null; loadingMore: boolean;
  onDragStart: (id: string) => void; onDragEnd: () => void; onDrop: (stageId: string | null) => void;
  onMove: (id: string, stageId: string | null) => void; onMore: () => void;
}) {
  const [over, setOver] = useState(false);
  const remaining = column.total - column.contacts.length;
  return (
    <div
      style={{ width, minWidth: width }}
      className={`flex flex-col h-full flex-shrink-0 rounded-[3px] border transition-colors ${over ? "border-brand-400 bg-brand-50 ring-2 ring-brand-400/30" : "border-surface-200 bg-surface-50"}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDrop(column.id); }}
    >
      <div className="px-2 py-1.5 border-b border-surface-200 bg-white rounded-t-[3px]" style={{ borderTop: `3px solid ${column.color}` }} title={`${column.name} · ${column.total}${column.value_total > 0 ? ` · ${taka(column.value_total)}` : ""}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`font-semibold text-surface-800 truncate ${tier === "mini" ? "text-[11px]" : "text-xs"}`}>{column.name}</span>
          <span className="ml-auto text-[11px] font-medium text-surface-600 bg-surface-100 rounded-[3px] px-1.5">{column.total}</span>
        </div>
        {tier !== "mini" && (column.value_total > 0 || column.outcome !== "open") && (
          <p className="text-[11px] text-surface-500 truncate">
            {column.outcome === "won" && <span className="text-success-dark font-semibold">Won · </span>}{column.outcome === "lost" && <span className="font-semibold">Lost · </span>}
            {column.value_total > 0 ? taka(column.value_total) : ""}
          </p>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5 min-h-0">
        {shown.map((c) => <ContactCard key={c.id} contact={c} stages={stages} team={team} tier={tier} prefs={prefs}
          staleDays={prefs.stale_highlight && column.stale_days && c.stage_changed_at && column.outcome === "open" ? ((d) => (d > column.stale_days! ? d : null))(Math.floor((Date.now() - new Date(c.stage_changed_at).getTime()) / 86400000)) : null} onDragStart={onDragStart} onDragEnd={onDragEnd} onMove={onMove} dragging={draggedId === c.id} />)}
        {shown.length === 0 && (
          <div className={`text-center text-[11px] rounded-[3px] border border-dashed py-5 ${over ? "border-brand-400 text-brand-600" : "border-surface-200 text-surface-400"}`}>{draggedId ? "Drop here" : "Empty"}</div>
        )}
        {remaining > 0 && <button type="button" onClick={onMore} disabled={loadingMore} className="w-full text-[11px] py-1 rounded-[3px] border border-surface-200 bg-white text-surface-600 hover:bg-surface-50 disabled:opacity-60">{loadingMore ? "…" : `+${Math.min(remaining, 20)} more (${remaining})`}</button>}
      </div>
    </div>
  );
}

export interface PipelineTabProps { team: TeamMember[]; isSales: boolean; canManage?: boolean; reloadKey: number; onChanged: () => void; }

export default function PipelineTab({ team, isSales, canManage = false, reloadKey, onChanged }: PipelineTabProps) {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [owner, setOwner] = useState("all");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [moreFor, setMoreFor] = useState<string | null>(null);
  const [lostAsk, setLostAsk] = useState<{ contactId: string; stageId: string; name: string } | null>(null);
  const seq = useRef(0);
  const [full, setFull] = useState(false);
  const [adding, setAdding] = useState(false);
  const [stageName, setStageName] = useState("");
  const [stageColor, setStageColor] = useState("#3B82F6");
  const [stageType, setStageType] = useState<"open" | "won" | "lost">("open");
  const [prefs, setPrefs] = useState<BoardPrefs>(DEFAULT_BOARD_PREFS);
  const [reasons, setReasons] = useState<string[] | undefined>(undefined);
  useSources();
  useEffect(() => { fetchSettings().then((s) => { setPrefs(s.board_prefs); setReasons(s.lost_reasons); }).catch(() => undefined); }, []);
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardW, setBoardW] = useState(1200);

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const ownerParam = owner === "all" ? undefined : owner;
  const load = useCallback((silent = false) => {
    const my = ++seq.current;
    if (!silent) setLoading(true);
    fetchPipeline({ owner: ownerParam, q: debounced || undefined })
      .then((c) => { if (my === seq.current) { setColumns(c); setError(""); } })
      .catch((e) => setError(e.message))
      .finally(() => { if (my === seq.current) setLoading(false); });
  }, [ownerParam, debounced]);
  useEffect(() => load(), [load, reloadKey]);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoardW(el.clientWidth));
    ro.observe(el); setBoardW(el.clientWidth);
    return () => ro.disconnect();
  }, [loading, full, columns.length]);
  useEffect(() => {
    if (!full) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [full]);

  const stageOptions = useMemo(
    () => columns.map((c) => ({ id: c.id, name: c.name })),
    [columns],
  );

  const doMove = async (contactId: string, toStageId: string | null, lostReason?: string) => {
    let moved: KanbanContact | undefined;
    for (const col of columns) {
      const f = col.contacts.find((k) => k.id === contactId);
      if (f) { if (col.id === toStageId) return; moved = f; }
    }
    if (!moved) return;
    const card = { ...moved, pipeline_stage_id: toStageId };
    setColumns((prev) => prev.map((col) => {
      const had = col.contacts.some((c) => c.id === contactId);
      const without = col.contacts.filter((c) => c.id !== contactId);
      if (col.id === toStageId) return { ...col, total: col.total + (had ? 0 : 1), contacts: [card, ...without] };
      return { ...col, total: col.total - (had ? 1 : 0), contacts: without };
    }));
    try { await updateContactStage(contactId, toStageId, lostReason); load(true); onChanged(); }
    catch (e: any) { setError(`Could not move lead: ${e.message}`); load(true); }
  };

  const requestMove = (contactId: string, toStageId: string | null) => {
    const target = columns.find((c) => c.id === toStageId);
    const card = columns.flatMap((c) => c.contacts).find((c) => c.id === contactId);
    if (target?.outcome === "lost" && card && card.pipeline_stage_id !== toStageId) {
      setLostAsk({ contactId, stageId: target.id!, name: leadName(card) });
    } else doMove(contactId, toStageId);
  };

  const handleDrop = (toStageId: string | null) => {
    const id = draggedId;
    setDraggedId(null);
    if (id) requestMove(id, toStageId);
  };

  const showMore = async (col: KanbanColumn) => {
    setMoreFor(col.id ?? "unassigned");
    try {
      const next = await fetchColumnMore(col.id, { offset: col.contacts.length, owner: ownerParam, q: debounced || undefined });
      setColumns((prev) => prev.map((c) => (c.id === col.id ? { ...c, contacts: [...c.contacts, ...next.filter((n) => !c.contacts.some((x) => x.id === n.id))] } : c)));
    } catch (e: any) { setError(e.message); }
    setMoreFor(null);
  };

  const addStageNow = async () => {
    if (!stageName.trim()) return;
    try { await createStage({ name: stageName.trim(), color: stageColor, outcome: stageType }); setStageName(""); setStageType("open"); setAdding(false); load(true); onChanged(); }
    catch (e: any) { setError(e.message); }
  };

  const filtersActive = debounced !== "" || scoreFilter !== "all" || owner !== "all";

  // Fit every stage on screen when it can be done at a readable width (≥112px each, 160px on phones); otherwise scroll.
  const n = Math.max(columns.length, 1);
  const gap = 8, pad = 12;
  const minW = boardW < 640 ? 160 : 112;
  const colW = Math.max(minW, Math.min(300, Math.floor((boardW - pad * 2 - gap * (n - 1)) / n)));
  const tier = tierFor(colW);
  const fits = colW * n + gap * (n - 1) + pad * 2 <= boardW + 1;

  const toolbar = (
    <div className="flex items-center gap-2 flex-wrap mb-2">
      <div className="relative flex-1 min-w-40 max-w-xs">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, shop, phone…"
          className="w-full border border-surface-200 rounded-[3px] pl-8 pr-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
      </div>
      {!isSales && (
        <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Filter by owner" className="border border-surface-200 rounded-[3px] px-2 py-1.5 text-sm bg-white text-surface-700">
          <option value="all">All leads</option><option value="me">My leads</option><option value="unassigned">No owner</option>
          {team.map((t) => <option key={t.user_id} value={t.user_id}>{t.name}</option>)}
        </select>
      )}
      <div className="flex gap-0.5 bg-surface-100 p-0.5 rounded-[3px]" role="group" aria-label="Filter by lead score">
        {SCORE_FILTERS.map((f) => (
          <button key={f.key} onClick={() => setScoreFilter(f.key)} className={`px-2 py-1 rounded-[3px] text-xs font-medium whitespace-nowrap ${scoreFilter === f.key ? "bg-white shadow-sm text-surface-900" : "text-surface-600 hover:text-surface-900"}`}>{f.label}</button>
        ))}
      </div>
      {filtersActive && <Button size="xs" variant="ghost" onClick={() => { setSearch(""); setScoreFilter("all"); setOwner("all"); }}>Clear</Button>}
      <span className="hidden md:inline text-[11px] text-surface-400 ml-auto">{columns.reduce((a, c) => a + c.total, 0)} leads · {columns.length} stages{fits ? "" : " · scroll →"}</span>
      {canManage && (
        <div className="relative">
          <button type="button" onClick={() => setAdding((a) => !a)} aria-expanded={adding} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[3px] border border-brand-200 bg-brand-50 text-xs font-semibold text-brand-700 hover:bg-brand-100"><Plus size={14} />Add stage</button>
          {adding && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-surface-200 rounded-[4px] shadow-xl z-40 p-3">
              <p className="text-xs font-semibold text-surface-800 mb-2">New stage</p>
              <input autoFocus value={stageName} onChange={(e) => setStageName(e.target.value)} placeholder="Name (e.g. Quotation sent)" maxLength={100}
                onKeyDown={async (e) => { if (e.key === "Enter" && stageName.trim()) { await addStageNow(); } if (e.key === "Escape") setAdding(false); }}
                className="w-full border border-surface-200 rounded-[3px] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
              <div className="flex items-center gap-1.5 mt-2.5" role="radiogroup" aria-label="Colour">
                {["#3B82F6", "#8B5CF6", "#EC4899", "#EF4444", "#F59E0B", "#10B981", "#14B8A6", "#64748B"].map((c) => (
                  <button key={c} type="button" onClick={() => setStageColor(c)} aria-label={c} className={`w-5 h-5 rounded-[3px] border-2 ${stageColor === c ? "border-surface-800" : "border-transparent"}`} style={{ backgroundColor: c }} />
                ))}
              </div>
              <select value={stageType} onChange={(e) => setStageType(e.target.value as "open" | "won" | "lost")} className="w-full mt-2.5 border border-surface-200 rounded-[3px] px-2 py-1.5 text-xs bg-white"><option value="open">In progress</option><option value="won">Won (becomes a customer)</option><option value="lost">Lost</option></select>
              <div className="flex items-center justify-between mt-3">
                <Link to="/crm?tab=customize#stages" className="text-xs text-brand-600 hover:underline">More options →</Link>
                <span className="flex gap-2"><Button size="xs" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button size="xs" disabled={!stageName.trim()} onClick={addStageNow}>Add</Button></span>
              </div>
            </div>
          )}
        </div>
      )}
      <button type="button" onClick={() => setFull((f) => !f)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[3px] border border-surface-200 bg-white text-xs font-medium text-surface-700 hover:bg-surface-50" title={full ? "Exit full screen (Esc)" : "Full screen board"}>
        {full ? <><Minimize2 size={14} />Exit</> : <><Maximize2 size={14} />Full screen</>}
      </button>
    </div>
  );

  const board = loading ? (
    <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  ) : columns.length === 0 ? (
    <div className="h-full min-h-48 flex flex-col items-center justify-center text-center text-surface-500 border border-dashed border-surface-200 rounded-[3px] bg-white">
      <p className="text-sm font-medium text-surface-700">No stages yet</p><p className="text-xs mt-1">Open “Customize” to add your sales stages.</p>
    </div>
  ) : (
    <div ref={boardRef} className="h-full overflow-x-auto overflow-y-hidden">
      <div className="flex gap-2 h-full" style={{ padding: `0 ${pad}px 4px 0`, width: fits ? "100%" : undefined }}>
        {columns.map((col) => (
          <KanbanCol key={col.id ?? "unassigned"} column={col} stages={stageOptions} team={team} tier={tier} width={colW} prefs={prefs} draggedId={draggedId}
            shown={col.contacts.filter((c) => matchesScore(c.lead_score, scoreFilter))} loadingMore={moreFor === (col.id ?? "unassigned")}
            onDragStart={setDraggedId} onDragEnd={() => setDraggedId(null)} onDrop={handleDrop} onMove={requestMove} onMore={() => showMore(col)} />
        ))}
      </div>
    </div>
  );

  const dialogs = lostAsk && (
    <LostReasonDialog name={lostAsk.name} reasons={reasons} onCancel={() => setLostAsk(null)}
      onConfirm={(reason) => { const a = lostAsk; setLostAsk(null); doMove(a.contactId, a.stageId, reason); }} />
  );

  // The board always measures itself (even before data arrives) so the first paint is already the right width.
  const measure = <div ref={loading ? boardRef : undefined} />;

  if (full) {
    return (
      <div className="fixed inset-0 z-[60] bg-surface-50 flex flex-col p-3">
        <div className="flex items-center gap-2 mb-2"><h2 className="text-base font-bold text-surface-900">Lead board</h2><span className="text-xs text-surface-500">Esc to exit</span></div>
        {error && <Alert variant="error" className="mb-2">{error}</Alert>}
        {toolbar}
        <div className="flex-1 min-h-0">{board}</div>
        {dialogs}
      </div>
    );
  }
  return (
    <>
      {error && <Alert variant="error" className="mb-2">{error}</Alert>}
      {toolbar}
      <div className="h-[calc(100vh-13.5rem)] min-h-[420px]">{board}</div>
      {measure}
      {dialogs}
    </>
  );
}
