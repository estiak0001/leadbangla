import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Bookmark, Copy, Eye, FileText, Mail, MessageCircle, MessageSquare, MoreVertical, Pencil, Plus, RotateCcw, Search, Trash2, Undo2, Users,
} from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import PageHeader from "../../components/PageHeader";
import Spinner from "../../components/Spinner";
import {
  duplicateSegment, fetchSegments, fetchTemplates, fetchTrashedSegments, purgeSegment, restoreDefaultTemplates, restoreSegment, trashSegment,
  type Segment,
} from "../../lib/audience";
import { describeRule, fetchSegmentMeta, type SegmentMeta } from "../../lib/segments";

export function ago(iso?: string | null): string {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" });
}

const RULES = (s: Segment, meta: SegmentMeta | null) => s.rules.map((r) => describeRule(r, meta)).join(s.match_type === "all" ? "  AND  " : "  OR  ");

export function RowMenu({ items }: { items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="relative inline-block" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="More actions" aria-expanded={open} className="p-2 rounded-sm text-surface-500 hover:text-surface-900 hover:bg-surface-100"><MoreVertical size={16} /></button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-surface-200 rounded-sm shadow-lg z-30 py-1 text-left">
          {items.map((it) => (
            <button key={it.label} type="button" onClick={() => { setOpen(false); it.onClick(); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-50 ${it.danger ? "text-danger-dark" : "text-surface-800"}`}>{it.icon}{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Reach({ s }: { s: Segment }) {
  const r = s.reach;
  if (!r) return <span className="text-surface-300">—</span>;
  const chip = "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-surface-100 text-xs text-surface-700";
  return (
    <div className="flex flex-wrap gap-1">
      <span className={chip} title="Have an email"><Mail size={11} className="text-surface-400" />{r.email}</span>
      <span className={chip} title="Agreed to SMS"><MessageSquare size={11} className="text-surface-400" />{r.sms}</span>
      <span className={chip} title="Agreed to WhatsApp"><MessageCircle size={11} className="text-surface-400" />{r.whatsapp}</span>
    </div>
  );
}

type Tab = "segments" | "templates" | "trash";
type Sort = "recent" | "name" | "size";
const th = "px-3 py-2.5 text-left text-xs font-semibold text-surface-500 uppercase tracking-wide";

export default function SegmentsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "segments";
  const setTab = (t: Tab) => setParams(t === "segments" ? {} : { tab: t }, { replace: true });

  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [templates, setTemplates] = useState<Segment[] | null>(null);
  const [trash, setTrash] = useState<Segment[] | null>(null);
  const [meta, setMeta] = useState<SegmentMeta | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);

  const loadAll = useCallback(() => {
    fetchSegments().then(setSegments).catch((e) => setError(e.message));
    fetchTemplates().then(setTemplates).catch(() => setTemplates([]));
    fetchTrashedSegments().then(setTrash).catch(() => setTrash([]));
  }, []);
  useEffect(() => { loadAll(); fetchSegmentMeta().then(setMeta).catch(() => undefined); }, [loadAll]);

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setError("");
    try { await fn(); loadAll(); after?.(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
  };
  const moveToTrash = (s: Segment) => act(async () => {
    const r = await trashSegment(s.id);
    setNotice({
      text: `“${s.name}” moved to trash.${r.used_in ? ` ${r.used_in} campaign${r.used_in > 1 ? "s" : ""} that already use it keep working.` : ""}`,
      undo: () => act(() => restoreSegment(s.id), () => setNotice(null)),
    });
  });

  const filter = (list: Segment[]) => {
    const t = q.trim().toLowerCase();
    return list.filter((s) => !t || s.name.toLowerCase().includes(t) || (s.description ?? "").toLowerCase().includes(t));
  };
  const mine = useMemo(() => [...filter(segments ?? [])].sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name) : sort === "size" ? b.contact_count - a.contact_count
      : +new Date(b.updated_at ?? b.created_at) - +new Date(a.updated_at ?? a.created_at)), [segments, q, sort]);  // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: { key: Tab; label: string; n?: number }[] = [
    { key: "segments", label: "My segments", n: segments?.length }, { key: "templates", label: "Templates", n: templates?.length }, { key: "trash", label: "Trash", n: trash?.length },
  ];
  const loading = (tab === "segments" && !segments) || (tab === "templates" && !templates) || (tab === "trash" && !trash);

  return (
    <AppLayout>
      <PageHeader title="Segments" description="Groups of contacts that update by themselves. Pick one as the audience of an email, SMS or WhatsApp campaign."
        actions={tab === "templates"
          ? <Button size="sm" icon={<Plus size={15} />} onClick={() => navigate("/segments/templates/new")}>New template</Button>
          : <Button size="sm" icon={<Plus size={15} />} onClick={() => navigate("/segments/new")}>New segment</Button>} />
      {error && <Alert variant="error" className="mb-3" onDismiss={() => setError("")}>{error}</Alert>}
      {notice && (
        <div className="mb-3 flex items-center justify-between gap-3 bg-surface-900 text-white px-4 py-2.5 rounded-sm text-sm">
          <span>{notice.text}</span>
          <span className="flex items-center gap-3 flex-shrink-0">
            {notice.undo && <button onClick={notice.undo} className="inline-flex items-center gap-1 font-semibold text-brand-300 hover:text-white"><Undo2 size={14} />Undo</button>}
            <button onClick={() => setNotice(null)} className="text-white/60 hover:text-white" aria-label="Dismiss">✕</button>
          </span>
        </div>
      )}

      <div className="flex gap-1 border-b border-surface-200 mb-4 overflow-x-auto" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setQ(""); }}
            className={`px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.key ? "border-brand-500 text-brand-600" : "border-transparent text-surface-600 hover:text-surface-900"}`}>
            {t.label}{t.n != null && <span className={`ml-1.5 text-xs rounded-sm px-1.5 py-0.5 ${t.key === "trash" && t.n ? "bg-surface-200 text-surface-700" : "bg-surface-100 text-surface-600"}`}>{t.n}</span>}
          </button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
        <>
          {/* ── My segments ── */}
          {tab === "segments" && (
            segments!.length === 0 ? (
              <div className="bg-white border border-surface-200 rounded-sm py-14 px-6 text-center">
                <Users size={30} className="mx-auto text-surface-300 mb-3" />
                <h2 className="text-base font-semibold text-surface-900">You haven’t made a segment yet</h2>
                <p className="text-sm text-surface-600 mt-1 max-w-md mx-auto">A segment is a saved group — like “wholesale customers in Dhaka” or “people who owe me money”. You can message them in one go.</p>
                <div className="flex flex-wrap justify-center gap-2 mt-5">
                  <Button icon={<Plus size={15} />} onClick={() => navigate("/segments/new")}>Create a segment</Button>
                  <Button variant="secondary" icon={<Bookmark size={15} />} onClick={() => setTab("templates")}>Start from a template</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <div className="relative flex-1 min-w-[12rem] max-w-sm"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search segments…" className="w-full border border-surface-200 rounded-sm pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" /></div>
                  <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="border border-surface-200 rounded-sm px-2.5 py-2 text-sm bg-white text-surface-700">
                    <option value="recent">Recently updated</option><option value="name">Name A–Z</option><option value="size">Largest first</option>
                  </select>
                </div>
                <div className="md:bg-white md:border md:border-surface-200 rounded-sm overflow-hidden">
                  <table className="w-full text-sm m-cards m-square">
                    <thead className="bg-surface-50 border-b border-surface-200"><tr>
                      <th className={th}>Segment</th><th className={`${th} w-[34%]`}>Who is in it</th><th className={th}>People</th>
                      <th className={th} title="How many have an email · agreed to SMS · agreed to WhatsApp">Can reach</th><th className={th}>Used in</th><th className={th}>Updated</th><th className="w-24" />
                    </tr></thead>
                    <tbody>
                      {mine.map((s) => (
                        <tr key={s.id} className="border-b border-surface-100 last:border-0 hover:bg-surface-50/70 align-top">
                          <td data-kind="primary" className="px-3 py-3">
                            <Link to={`/segments/${s.id}`} className="font-semibold text-surface-900 hover:text-brand-600">{s.name}</Link>
                            {s.description && <p className="text-xs text-surface-500 mt-0.5">{s.description}</p>}
                          </td>
                          <td data-label="Who is in it" className="px-3 py-3 text-xs text-surface-600"><span className="line-clamp-2" title={RULES(s, meta)}>{RULES(s, meta)}</span></td>
                          <td data-label="People" className="px-3 py-3"><span className="text-lg font-bold text-surface-900 leading-none">{s.contact_count}</span></td>
                          <td data-label="Can reach" className="px-3 py-3"><Reach s={s} /></td>
                          <td data-label="Used in" className="px-3 py-3 text-xs text-surface-600">{s.used_in ? `${s.used_in} campaign${s.used_in > 1 ? "s" : ""}` : <span className="text-surface-400">Not used yet</span>}</td>
                          <td data-label="Updated" className="px-3 py-3 text-xs text-surface-500 whitespace-nowrap">{ago(s.updated_at ?? s.created_at)}</td>
                          <td data-kind="actions" className="px-2 py-2 text-right whitespace-nowrap">
                            <Link to={`/segments/${s.id}`} className="inline-flex p-2 rounded-sm text-surface-500 hover:text-brand-600 hover:bg-surface-100" title="View people" aria-label={`View ${s.name}`}><Eye size={16} /></Link>
                            <Link to={`/segments/${s.id}/edit`} className="inline-flex p-2 rounded-sm text-surface-500 hover:text-brand-600 hover:bg-surface-100" title="Edit" aria-label={`Edit ${s.name}`}><Pencil size={16} /></Link>
                            <RowMenu items={[
                              { label: "Duplicate", icon: <Copy size={14} />, onClick: () => act(() => duplicateSegment(s.id), () => setNotice({ text: `Copied “${s.name}”.` })) },
                              { label: "Save as template", icon: <Bookmark size={14} />, onClick: () => act(() => duplicateSegment(s.id, true), () => setNotice({ text: `“${s.name}” saved as a template.` })) },
                              { label: "Move to trash", icon: <Trash2 size={14} />, danger: true, onClick: () => moveToTrash(s) },
                            ]} />
                          </td>
                        </tr>
                      ))}
                      {mine.length === 0 && <tr><td colSpan={7} data-kind="span" className="px-3 py-10 text-center text-surface-500">No segment matches “{q}”.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )
          )}

          {/* ── Templates ── */}
          {tab === "templates" && (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <p className="text-sm text-surface-600 max-w-2xl">Ready-made starting points. <strong>Use</strong> one to make your own segment from it. You can also edit, add or delete templates — they are yours.</p>
                <Button size="sm" variant="secondary" icon={<RotateCcw size={14} />} onClick={() => act(async () => { const r = await restoreDefaultTemplates(); setNotice({ text: r.added ? `Added back ${r.added} default template${r.added > 1 ? "s" : ""}.` : "All the default templates are already there." }); })}>Restore defaults</Button>
              </div>
              <div className="md:bg-white md:border md:border-surface-200 rounded-sm overflow-hidden">
                <table className="w-full text-sm m-cards m-square">
                  <thead className="bg-surface-50 border-b border-surface-200"><tr><th className={th}>Template</th><th className={`${th} w-[38%]`}>Rules</th><th className={th}>Matches now</th><th className="w-44" /></tr></thead>
                  <tbody>
                    {templates!.map((t) => (
                      <tr key={t.id} className="border-b border-surface-100 last:border-0 hover:bg-surface-50/70 align-top">
                        <td data-kind="primary" className="px-3 py-3"><Link to={`/segments/${t.id}`} className="font-semibold text-surface-900 hover:text-brand-600">{t.name}</Link>{t.description && <p className="text-xs text-surface-500 mt-0.5">{t.description}</p>}</td>
                        <td data-label="Rules" className="px-3 py-3 text-xs text-surface-600"><span className="line-clamp-2">{RULES(t, meta)}</span></td>
                        <td data-label="Matches now" className="px-3 py-3 font-semibold text-surface-900">{t.contact_count}</td>
                        <td data-kind="actions" className="px-2 py-2 text-right whitespace-nowrap">
                          <Button size="xs" onClick={() => navigate("/segments/new", { state: { templateId: t.id } })}>Use</Button>
                          <Link to={`/segments/${t.id}`} className="inline-flex p-2 rounded-sm text-surface-500 hover:text-brand-600 hover:bg-surface-100" title="See details" aria-label={`Details of ${t.name}`}><Eye size={16} /></Link>
                          <Link to={`/segments/${t.id}/edit`} className="inline-flex p-2 rounded-sm text-surface-500 hover:text-brand-600 hover:bg-surface-100" title="Edit template" aria-label={`Edit ${t.name}`}><Pencil size={16} /></Link>
                          <button type="button" onClick={() => moveToTrash(t)} className="p-2 rounded-sm text-surface-500 hover:text-danger-base hover:bg-surface-100" title="Delete template" aria-label={`Delete ${t.name}`}><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}
                    {templates!.length === 0 && <tr><td colSpan={4} data-kind="span" className="px-3 py-10 text-center text-surface-500">No templates. Add one, or restore the defaults.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Trash ── */}
          {tab === "trash" && (
            trash!.length === 0 ? (
              <div className="bg-white border border-surface-200 rounded-sm py-14 text-center"><Trash2 size={28} className="mx-auto text-surface-300 mb-2" /><p className="text-sm font-medium text-surface-700">Trash is empty</p><p className="text-xs text-surface-500 mt-1">Deleted segments and templates wait here until you restore or remove them for good.</p></div>
            ) : (
              <div className="md:bg-white md:border md:border-surface-200 rounded-sm overflow-hidden">
                <table className="w-full text-sm m-cards m-square">
                  <thead className="bg-surface-50 border-b border-surface-200"><tr><th className={th}>Name</th><th className={`${th} w-[36%]`}>Rules</th><th className={th}>Deleted</th><th className="w-60" /></tr></thead>
                  <tbody>
                    {trash!.map((s) => (
                      <tr key={s.id} className="border-b border-surface-100 last:border-0 align-top">
                        <td data-kind="primary" className="px-3 py-3"><span className="font-semibold text-surface-800">{s.name}</span>{s.is_template && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide bg-surface-100 text-surface-600 px-1.5 py-0.5 rounded-sm">Template</span>}
                          {s.used_in ? <p className="text-xs text-surface-500 mt-0.5">Still used by {s.used_in} campaign{s.used_in > 1 ? "s" : ""}</p> : null}</td>
                        <td data-label="Rules" className="px-3 py-3 text-xs text-surface-500"><span className="line-clamp-2">{RULES(s, meta)}</span></td>
                        <td data-label="Deleted" className="px-3 py-3 text-xs text-surface-500 whitespace-nowrap">{ago(s.deleted_at)}</td>
                        <td data-kind="actions" className="px-2 py-2 text-right whitespace-nowrap">
                          {confirmPurge === s.id ? (
                            <span className="inline-flex items-center gap-2 text-xs"><span className="text-surface-600">Delete for good?</span>
                              <button className="font-semibold text-danger-dark" onClick={() => act(() => purgeSegment(s.id), () => setConfirmPurge(null))}>Yes</button>
                              <button className="text-surface-600" onClick={() => setConfirmPurge(null)}>No</button></span>
                          ) : (<>
                            <Button size="xs" variant="secondary" icon={<RotateCcw size={13} />} onClick={() => act(() => restoreSegment(s.id), () => setNotice({ text: `“${s.name}” restored.` }))}>Restore</Button>
                            <Link to={`/segments/${s.id}`} className="inline-flex p-2 rounded-sm text-surface-500 hover:text-brand-600 hover:bg-surface-100" title="See history" aria-label="History"><FileText size={16} /></Link>
                            <button type="button" onClick={() => setConfirmPurge(s.id)} className="p-2 rounded-sm text-surface-500 hover:text-danger-base hover:bg-surface-100" title="Delete for good" aria-label={`Delete ${s.name} for good`}><Trash2 size={16} /></button>
                          </>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
    </AppLayout>
  );
}
