import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Bookmark, ChevronRight, Copy, Download, FilePlus2, Mail, MapPin, MessageCircle, MessageSquare, Pencil, RotateCcw, Search, Trash2, Undo2, Users,
} from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Spinner from "../../components/Spinner";
import {
  duplicateSegment, fetchSegment, fetchSegmentContacts, fetchSegmentHistory, restoreSegment, revertSegment, trashSegment,
  type Contact, type Segment, type SegmentHistoryEntry,
} from "../../lib/audience";
import { exportContacts } from "../../lib/csv";
import { describeChange, describeRule, fetchSegmentMeta, type SegmentMeta } from "../../lib/segments";
import { ago, RowMenu } from "./SegmentsPage";

const nameOf = (c: Contact) => [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || c.email || c.phone || "Unnamed";
const ACTION: Record<string, { label: string; dot: string }> = {
  created: { label: "Created", dot: "bg-success-base" }, updated: { label: "Edited", dot: "bg-brand-500" }, deleted: { label: "Moved to trash", dot: "bg-danger-base" },
  restored: { label: "Restored from trash", dot: "bg-success-base" }, reverted: { label: "Went back to an earlier version", dot: "bg-warning-base" },
};

export default function SegmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [seg, setSeg] = useState<Segment | null>(null);
  const [meta, setMeta] = useState<SegmentMeta | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [history, setHistory] = useState<SegmentHistoryEntry[] | null>(null);
  const [tab, setTab] = useState<"people" | "history">("people");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const loadHistory = useCallback(() => { if (id) fetchSegmentHistory(id).then(setHistory).catch(() => setHistory([])); }, [id]);
  const load = useCallback(() => {
    if (!id) return;
    fetchSegment(id).then(setSeg).catch((e) => setError(e.message));
    fetchSegmentContacts(id, 1000).then(setContacts).catch(() => setContacts([]));
    loadHistory();
  }, [id, loadHistory]);
  useEffect(() => { load(); fetchSegmentMeta().then(setMeta).catch(() => undefined); }, [load]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (contacts ?? []).filter((c) => !t || [nameOf(c), c.email, c.phone, c.district, c.area].filter(Boolean).join(" ").toLowerCase().includes(t));
  }, [contacts, q]);

  const run = async (key: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(key); setError("");
    try { await fn(); after?.(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(null); }
  };

  if (error && !seg) return <AppLayout><Alert variant="error">{error}</Alert></AppLayout>;
  if (!seg) return <AppLayout><div className="flex justify-center py-20"><Spinner size="lg" /></div></AppLayout>;
  const trashed = !!seg.deleted_at;
  const r = seg.reach;
  const tiles: [string, number | undefined, React.ReactNode][] = [
    ["People", seg.contact_count, <Users size={15} key="u" />], ["With email", r?.email, <Mail size={15} key="e" />],
    ["Agreed to SMS", r?.sms, <MessageSquare size={15} key="s" />], ["Agreed to WhatsApp", r?.whatsapp, <MessageCircle size={15} key="w" />], ["Map pinned", r?.located, <MapPin size={15} key="m" />],
  ];
  const back = seg.is_template ? "/segments?tab=templates" : trashed ? "/segments?tab=trash" : "/segments";

  if (seg.is_template && !trashed) {
    const sample = (contacts ?? []).slice(0, 6);
    return (
      <AppLayout>
        <nav className="flex items-center gap-1.5 text-sm text-surface-600 mb-3">
          <Link to={back} className="text-brand-600 hover:text-brand-700 font-medium">Templates</Link><ChevronRight size={14} className="text-surface-300" />
          <span className="text-surface-900 font-medium truncate">{seg.name}</span>
        </nav>
        {error && <Alert variant="error" className="mb-3" onDismiss={() => setError("")}>{error}</Alert>}
        {notice && <Alert variant="success" className="mb-3" onDismiss={() => setNotice("")}>{notice}</Alert>}

        <section className="bg-white border border-surface-200 rounded-sm p-4 sm:p-4 mb-4">
          <span className="inline-block text-[10px] font-semibold uppercase tracking-wide bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded-sm mb-2">Template</span>
          <h1 className="text-xl sm:text-2xl font-bold text-surface-900 tracking-tight">{seg.name}</h1>
          <p className="text-sm text-surface-600 mt-1 max-w-2xl">{seg.description || "A ready-made starting point for a segment."}</p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-4">
            <Button className="w-full sm:w-auto" icon={<FilePlus2 size={15} />} onClick={() => navigate("/segments/new", { state: { templateId: seg.id } })}>Use this template</Button>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1 sm:flex-none" icon={<Pencil size={14} />} onClick={() => navigate(`/segments/${seg.id}/edit`)}>Edit template</Button>
              <Button variant="ghost" className="flex-1 sm:flex-none" icon={<Trash2 size={14} />} onClick={() => setConfirm(true)}>Delete</Button>
            </div>
          </div>
          {confirm && (
            <div className="mt-3 flex items-center justify-between gap-2 flex-wrap bg-surface-50 border border-surface-200 px-3 py-2 text-sm rounded-sm">
              <span className="text-surface-700">Delete this template? It goes to the Trash tab and can be restored.</span>
              <span className="flex gap-3"><button className="font-semibold text-danger-dark" onClick={() => run("trash", () => trashSegment(seg.id), () => navigate(back, { replace: true }))}>Delete</button><button className="text-surface-600" onClick={() => setConfirm(false)}>Cancel</button></span>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 mb-4">
          <section className="bg-white border border-surface-200 rounded-sm p-4 sm:p-4">
            <h2 className="text-sm font-semibold text-surface-900">What it selects</h2>
            <p className="text-sm text-surface-600 mt-1">Contacts who match {seg.rules.length > 1 ? <strong>{seg.match_type === "all" ? "all" : "any"} of these</strong> : "this rule"}:</p>
            <ul className="mt-3 space-y-2">
              {seg.rules.map((rule, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-surface-800">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <span>{describeRule(rule, meta)}</span>
                </li>
              ))}
            </ul>
            <ol className="mt-5 pt-4 border-t border-surface-100 space-y-1.5 text-xs text-surface-600 list-decimal list-inside">
              <li>Press <strong>Use this template</strong> — it opens the segment builder with these rules filled in.</li>
              <li>Change anything you like and give it your own name.</li>
              <li>Save it. The template itself stays unchanged for next time.</li>
            </ol>
          </section>

          <section className="bg-white border border-surface-200 rounded-sm p-4 sm:p-4">
            <h2 className="text-sm font-semibold text-surface-900">If you used it today</h2>
            <p className="text-sm text-surface-600 mt-1"><strong>{seg.contact_count}</strong> contact{seg.contact_count === 1 ? "" : "s"} match right now.</p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {([["With email", r?.email, <Mail size={13} key="e" />], ["Agreed SMS", r?.sms, <MessageSquare size={13} key="s" />], ["Agreed WhatsApp", r?.whatsapp, <MessageCircle size={13} key="w" />]] as const).map(([l, n, ic]) => (
                <div key={l} className="border border-surface-200 rounded-sm px-2.5 py-2"><div className="flex items-center gap-1 text-[11px] text-surface-500">{ic}{l}</div><p className="text-lg font-bold text-surface-900 leading-tight">{n ?? "—"}</p></div>
              ))}
            </div>
            <div className="mt-3 divide-y divide-surface-100 border-t border-surface-100">
              {contacts === null ? <div className="flex justify-center py-4"><Spinner /></div> : sample.length === 0 ? <p className="py-4 text-center text-sm text-surface-500">Nobody matches yet — that is fine, it fills up as contacts come in.</p> : sample.map((c) => (
                <Link key={c.id} to={`/contacts/${c.id}`} className="flex items-center gap-2.5 py-2 hover:bg-surface-50">
                  <span className="w-7 h-7 rounded-full bg-brand-50 text-brand-600 text-[11px] font-bold flex items-center justify-center uppercase flex-shrink-0">{nameOf(c)[0]}</span>
                  <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium text-surface-900 truncate">{nameOf(c)}</span><span className="block text-[11px] text-surface-500 truncate">{c.phone ?? c.email}</span></span>
                </Link>
              ))}
              {contacts && contacts.length > sample.length && <p className="pt-2 text-xs text-surface-500">+ {contacts.length - sample.length} more</p>}
            </div>
          </section>
        </div>

        <details className="bg-white border border-surface-200 rounded-sm group">
          <summary className="cursor-pointer select-none list-none flex items-center justify-between px-4 py-3 text-sm font-semibold text-surface-900">
            Edit history <span className="text-xs font-normal text-surface-500">{history ? `${history.length} entr${history.length === 1 ? "y" : "ies"}` : ""}</span>
          </summary>
          <ol className="divide-y divide-surface-100 border-t border-surface-100">
            {(history ?? []).map((h) => {
              const a = ACTION[h.action] ?? { label: h.action, dot: "bg-surface-400" };
              const fields = Object.entries(h.changes).filter(([k]) => ["name", "description", "match_type", "rules"].includes(k));
              return (
                <li key={h.id} className="flex gap-3 px-4 py-3">
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${a.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-surface-900"><span className="font-medium">{a.label}</span> <span className="text-surface-500">by {h.changed_by_email ?? "the system"} · {ago(h.created_at)}</span></p>
                    {h.action !== "created" && fields.map(([k, v]) => <p key={k} className="text-xs text-surface-600 break-words">{describeChange(k, v, meta)}</p>)}
                  </div>
                  {(h.action === "updated" || h.action === "reverted") && fields.length > 0 && <Button size="xs" variant="secondary" icon={<RotateCcw size={12} />} loading={busy === h.id} onClick={() => run(h.id, () => revertSegment(seg.id, h.id), () => { setNotice("Went back to the earlier version."); load(); })}>Undo</Button>}
                </li>
              );
            })}
          </ol>
        </details>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <nav className="flex items-center gap-1.5 text-sm text-surface-600 mb-3">
        <Link to={back} className="text-brand-600 hover:text-brand-700 font-medium">{seg.is_template ? "Templates" : trashed ? "Trash" : "Segments"}</Link><ChevronRight size={14} className="text-surface-300" />
        <span className="text-surface-900 font-medium truncate">{seg.name}</span>
      </nav>

      {trashed && (
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap bg-warning-light border border-warning-base/30 px-4 py-2.5 rounded-sm text-sm text-warning-dark">
          <span>This {seg.is_template ? "template" : "segment"} is in the trash.</span>
          <Button size="xs" icon={<Undo2 size={13} />} loading={busy === "restore"} onClick={() => run("restore", () => restoreSegment(seg.id), load)}>Restore</Button>
        </div>
      )}
      {error && <Alert variant="error" className="mb-3" onDismiss={() => setError("")}>{error}</Alert>}
      {notice && <Alert variant="success" className="mb-3" onDismiss={() => setNotice("")}>{notice}</Alert>}

      <section className="bg-white border border-surface-200 rounded-sm p-4 sm:p-4 mb-4">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0 flex-1 basis-64">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-surface-900 tracking-tight">{seg.name}</h1>
              {seg.is_template && <span className="text-[10px] font-semibold uppercase tracking-wide bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded-sm">Template</span>}
            </div>
            {seg.description && <p className="text-sm text-surface-600 mt-0.5">{seg.description}</p>}
            <p className="text-xs text-surface-500 mt-1">Updated {ago(seg.updated_at ?? seg.created_at)}{seg.used_in ? ` · used in ${seg.used_in} campaign${seg.used_in > 1 ? "s" : ""}` : ""}</p>
          </div>
          {!trashed && (
            <div className="flex flex-wrap gap-2">
              {seg.is_template && <Button size="sm" icon={<FilePlus2 size={14} />} onClick={() => navigate("/segments/new", { state: { templateId: seg.id } })}>Use this template</Button>}
              <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={() => navigate(`/segments/${seg.id}/edit`)}>Edit</Button>
              <Button size="sm" variant="secondary" className="hidden sm:inline-flex" icon={<Copy size={14} />} loading={busy === "dup"} onClick={() => run("dup", () => duplicateSegment(seg.id), () => setNotice("A copy was added to your list."))}>Duplicate</Button>
              {!seg.is_template && <Button size="sm" variant="secondary" className="hidden sm:inline-flex" icon={<Bookmark size={14} />} loading={busy === "tpl"} onClick={() => run("tpl", () => duplicateSegment(seg.id, true), () => setNotice("Saved as a template (see the Templates tab)."))}>Save as template</Button>}
              <Button size="sm" variant="secondary" className="hidden sm:inline-flex" icon={<Download size={14} />} disabled={!contacts?.length} onClick={() => exportContacts(contacts ?? [], `${seg.name.replace(/[^\w]+/g, "-").toLowerCase()}.csv`)}>Export CSV</Button>
              <Button size="sm" variant="ghost" className="hidden sm:inline-flex" icon={<Trash2 size={14} />} onClick={() => setConfirm(true)}>Move to trash</Button>
              <div className="sm:hidden">
                <RowMenu items={[
                  { label: "Duplicate", icon: <Copy size={14} />, onClick: () => run("dup", () => duplicateSegment(seg.id), () => setNotice("A copy was added to your list.")) },
                  ...(seg.is_template ? [] : [{ label: "Save as template", icon: <Bookmark size={14} />, onClick: () => run("tpl", () => duplicateSegment(seg.id, true), () => setNotice("Saved as a template (see the Templates tab).")) }]),
                  { label: "Export CSV", icon: <Download size={14} />, onClick: () => exportContacts(contacts ?? [], `${seg.name.replace(/[^\w]+/g, "-").toLowerCase()}.csv`) },
                  { label: "Move to trash", icon: <Trash2 size={14} />, danger: true, onClick: () => setConfirm(true) },
                ]} />
              </div>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-surface-500 mr-1">{seg.match_type === "all" ? "Matches all of" : "Matches any of"}</span>
          {seg.rules.map((rule, i) => <span key={i} className="px-2 py-0.5 rounded-sm bg-surface-100 text-xs text-surface-700">{describeRule(rule, meta)}</span>)}
        </div>
        {confirm && (
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap bg-surface-50 border border-surface-200 px-3 py-2 text-sm rounded-sm">
            <span className="text-surface-700">Move to trash? You can restore it any time.{seg.used_in ? ` The ${seg.used_in} campaign${seg.used_in > 1 ? "s" : ""} using it keep working.` : ""}</span>
            <span className="flex gap-3 flex-shrink-0">
              <button className="font-semibold text-danger-dark" onClick={() => run("trash", () => trashSegment(seg.id), () => navigate(back + (seg.is_template ? "" : ""), { replace: true }))}>Move to trash</button>
              <button className="text-surface-600" onClick={() => setConfirm(false)}>Cancel</button>
            </span>
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {tiles.map(([label, n, icon]) => (
          <div key={label} className="bg-white border border-surface-200 rounded-sm px-3.5 py-3"><div className="flex items-center gap-1.5 text-surface-500 text-xs">{icon}{label}</div><p className="text-xl font-bold text-surface-900 mt-1 leading-none">{n ?? "—"}</p></div>
        ))}
      </div>

      <div className="flex gap-1 border-b border-surface-200 mb-3" role="tablist">
        {([["people", `People${contacts ? ` (${contacts.length})` : ""}`], ["history", `History${history ? ` (${history.length})` : ""}`]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-brand-500 text-brand-600" : "border-transparent text-surface-600 hover:text-surface-900"}`}>{l}</button>
        ))}
      </div>

      {tab === "people" && (
        <section className="md:bg-white md:border md:border-surface-200 rounded-sm overflow-hidden">
          <div className="flex items-center gap-3 px-0 md:px-4 py-3 md:border-b border-surface-100 flex-wrap">
            <p className="text-sm text-surface-600">Everyone who matches the rules right now.</p>
            <div className="relative w-full md:w-auto md:flex-1 md:min-w-[10rem] md:max-w-xs md:ml-auto"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search these people…" className="w-full border border-surface-200 rounded-sm pl-8 pr-2.5 py-1.5 text-sm" /></div>
          </div>
          {contacts === null ? <div className="flex justify-center py-10"><Spinner /></div> : shown.length === 0 ? (
            <p className="text-center text-sm text-surface-500 py-12">{contacts.length ? "No one matches that search." : "Nobody matches this segment right now."}</p>
          ) : (
            <table className="w-full text-sm m-cards m-square">
              <thead><tr className="text-left text-xs text-surface-500 bg-surface-50 border-b border-surface-200"><th className="px-4 py-2 font-medium">Contact</th><th className="px-3 py-2 font-medium">Mobile</th><th className="px-3 py-2 font-medium">Email</th><th className="px-3 py-2 font-medium">Place</th><th className="px-3 py-2 font-medium">Agreed</th></tr></thead>
              <tbody>
                {shown.slice(0, 300).map((c) => (
                  <tr key={c.id} className="border-b border-surface-100 last:border-0 hover:bg-surface-50/60">
                    <td data-kind="primary" className="px-4 py-2.5"><Link to={`/contacts/${c.id}`} className="font-medium text-surface-900 hover:text-brand-600">{nameOf(c)}</Link>{c.company && c.company !== nameOf(c) && <span className="block text-xs text-surface-500">{c.company}</span>}</td>
                    <td data-label="Mobile" className="px-3 py-2.5 font-mono text-xs text-surface-600">{c.phone ?? "—"}</td>
                    <td data-label="Email" className="px-3 py-2.5 text-surface-600 truncate max-w-[16rem]">{c.email ?? "—"}</td>
                    <td data-label="Place" className="px-3 py-2.5 text-surface-600">{[c.area, c.district].filter(Boolean).join(", ") || "—"}{c.latitude != null && <MapPin size={11} className="inline ml-1 text-brand-500" />}</td>
                    <td data-label="Agreed" className="px-3 py-2.5"><div className="flex gap-1">{c.sms_opt_in && <span className="px-1.5 py-0.5 rounded-sm bg-success-light text-success-dark text-[11px]">SMS</span>}{c.whatsapp_opt_in && <span className="px-1.5 py-0.5 rounded-sm bg-success-light text-success-dark text-[11px]">WhatsApp</span>}{!c.sms_opt_in && !c.whatsapp_opt_in && <span className="text-surface-300">—</span>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {contacts && shown.length > 300 && <p className="px-4 py-2.5 text-xs text-surface-500 border-t border-surface-100">Showing the first 300 of {shown.length}. Export the CSV to get everyone.</p>}
        </section>
      )}

      {tab === "history" && (
        <section className="bg-white border border-surface-200 rounded-sm">
          {history === null ? <div className="flex justify-center py-10"><Spinner /></div> : history.length === 0 ? <p className="text-center text-sm text-surface-500 py-12">No history yet.</p> : (
            <ol className="divide-y divide-surface-100">
              {history.map((h) => {
                const a = ACTION[h.action] ?? { label: h.action, dot: "bg-surface-400" };
                const fields = Object.entries(h.changes).filter(([k]) => ["name", "description", "match_type", "rules", "copied_from"].includes(k));
                const canRevert = !trashed && (h.action === "updated" || h.action === "reverted") && fields.length > 0;
                return (
                  <li key={h.id} className="flex gap-3 px-4 py-3">
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${a.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-surface-900"><span className="font-medium">{a.label}</span> <span className="text-surface-500">by {h.changed_by_email ?? "the system"} · {ago(h.created_at)}</span></p>
                      {h.action !== "created" && fields.length > 0 && (
                        <ul className="mt-1 space-y-0.5">{fields.map(([k, v]) => <li key={k} className="text-xs text-surface-600 break-words">{describeChange(k, v, meta)}</li>)}</ul>
                      )}
                      {h.action === "created" && fields.length > 0 && <p className="text-xs text-surface-500 mt-0.5">{fields.some(([k]) => k === "copied_from") ? describeChange("copied_from", h.changes.copied_from, meta) : "First saved version."}</p>}
                    </div>
                    {canRevert && <Button size="xs" variant="secondary" icon={<RotateCcw size={12} />} loading={busy === h.id}
                      onClick={() => run(h.id, () => revertSegment(seg.id, h.id), () => { setNotice("Went back to the earlier version."); load(); })}>Undo this change</Button>}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
    </AppLayout>
  );
}
