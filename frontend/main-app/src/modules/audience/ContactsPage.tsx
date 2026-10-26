import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Archive, ChevronLeft, ChevronRight, Download, Globe, History, MessageCircle, MapPin, MessageSquare, MoreVertical, Pencil, Phone, Plus, RotateCcw, Search, Trash2, Upload, UserPlus, Users, X,
} from "lucide-react";
import AppLayout from "../../components/AppLayout";
import PlanUsageStrip from "../../components/PlanUsageStrip";
import Alert from "../../components/Alert";
import Badge from "../../components/Badge";
import Button from "../../components/Button";
import Card from "../../components/Card";
import EmptyState from "../../components/EmptyState";
import Select from "../../components/Select";
import Toggle from "../../components/Toggle";
import ContactHistoryModal from "./ContactHistoryModal";
import ImportContactsModal from "./ImportContactsModal";
import {
  bulkDeleteContacts, deleteContact, deleteContactsByTag, fetchContacts, fetchTagPresets, restoreContact,
  type Contact, type TagPreset,
} from "../../lib/audience";
import { exportContacts } from "../../lib/csv";
import { updateOptIn } from "../../lib/sms";
import { confirmText } from "../../components/ConfirmDialog";

type View = "all" | "sms" | "whatsapp" | "email" | "none";
type Sort = "newest" | "oldest" | "name";

const PAGE_SIZES = [25, 50, 100];

const SOFT_DELETE_NOTICE =
  "They'll also be removed from Segments, the CRM Pipeline board, and any in-progress Workflow sends. " +
  "Notes, activity history, and opt-in settings are kept and come back if you restore from Trash.";

const displayName = (c: Contact) => [c.first_name, c.last_name].filter(Boolean).join(" ");
const initials = (c: Contact) => (displayName(c) || c.email || c.phone || "?").trim()[0]?.toUpperCase() ?? "?";
const added = (ts: string) => new Date(ts).toLocaleDateString("en-BD", { month: "short", day: "numeric", year: "numeric" });

/** The "⋮" actions menu used on phones. */
function RowMenu({ onEdit, onHistory, onDelete }: { onEdit: () => void; onHistory: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const item = "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-left active:bg-surface-100";
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Actions" className="rounded-full p-2 text-surface-500 active:bg-surface-100"><MoreVertical size={17} /></button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-[6px] border border-surface-200 bg-white py-1 shadow-xl">
          <button type="button" className={`${item} text-surface-700`} onClick={() => { setOpen(false); onEdit(); }}><Pencil size={15} className="text-surface-400" /> Edit</button>
          <button type="button" className={`${item} text-surface-700`} onClick={() => { setOpen(false); onHistory(); }}><History size={15} className="text-surface-400" /> History</button>
          <button type="button" className={`${item} text-danger-dark`} onClick={() => { setOpen(false); onDelete(); }}><Trash2 size={15} /> Move to trash</button>
        </div>
      )}
    </div>
  );
}

export default function ContactsPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tagPresets, setTagPresets] = useState<TagPreset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ label: string; ids: string[]; contacts: Contact[] } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [tagDeleting, setTagDeleting] = useState(false);
  const [historyContact, setHistoryContact] = useState<Contact | null>(null);

  // view
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 15000);
    return () => clearTimeout(t);
  }, [undo]);

  async function doUndo() {
    if (!undo) return;
    setUndoing(true);
    try {
      const results = await Promise.allSettled(undo.ids.map((id) => restoreContact(id)));
      const back = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      if (back.length) setContacts((p) => [...back, ...p]);
      const failed = results.length - back.length;
      if (failed) {
        const why = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
        setError(`${failed} contact${failed === 1 ? "" : "s"} couldn't be restored: ${why?.reason instanceof Error ? why.reason.message : "try again from Trash"}`);
      } else setNotice(`${back.length === 1 ? "Contact" : `${back.length} contacts`} restored.`);
    } finally { setUndoing(false); setUndo(null); }
  }

  const load = () => fetchContacts().then((c) => { setContacts(c); setLoaded(true); }).catch(() => { setError("Failed to load contacts"); setLoaded(true); });
  useEffect(() => { load(); fetchTagPresets().then(setTagPresets).catch(() => undefined); }, []);
  useEffect(() => { setPage(1); }, [view, search, tagFilter, sort, pageSize]);

  const counts = useMemo(() => ({
    all: contacts.length,
    sms: contacts.filter((c) => c.sms_opt_in).length,
    whatsapp: contacts.filter((c) => c.whatsapp_opt_in).length,
    email: contacts.filter((c) => c.email).length,
    none: contacts.filter((c) => !c.sms_opt_in && !c.whatsapp_opt_in).length,
  }), [contacts]);

  const allTags = useMemo(() => {
    const t = new Set<string>();
    tagPresets.forEach((p) => t.add(p.name));
    contacts.forEach((c) => c.tags.forEach((x) => t.add(x)));
    return Array.from(t).sort();
  }, [contacts, tagPresets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = contacts.filter((c) => {
      if (q && ![c.email, c.first_name, c.last_name, c.phone].filter(Boolean).join(" ").toLowerCase().includes(q)) return false;
      if (tagFilter && !c.tags.includes(tagFilter)) return false;
      if (view === "sms" && !c.sms_opt_in) return false;
      if (view === "whatsapp" && !c.whatsapp_opt_in) return false;
      if (view === "email" && !c.email) return false;
      if (view === "none" && (c.sms_opt_in || c.whatsapp_opt_in)) return false;
      return true;
    });
    return list.sort((a, b) =>
      sort === "name" ? (displayName(a) || a.email || "~").localeCompare(displayName(b) || b.email || "~")
        : sort === "oldest" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at));
  }, [contacts, search, tagFilter, view, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const pageRows = filtered.slice((current - 1) * pageSize, current * pageSize);
  const hasFilters = view !== "all" || !!search.trim() || !!tagFilter;
  const allPageSelected = pageRows.length > 0 && pageRows.every((c) => selectedIds.has(c.id));

  const clearFilters = () => { setView("all"); setSearch(""); setTagFilter(""); };
  const openAdd = () => navigate("/contacts/new");
  const openEdit = (c: Contact) => navigate(`/contacts/${c.id}/edit`);

  async function remove(c: Contact) {
    if (!(await confirmText(`Move ${c.email ?? c.phone ?? "this contact"} to trash?\n\n${SOFT_DELETE_NOTICE}`))) return;
    try {
      await deleteContact(c.id);
      setContacts((p) => p.filter((x) => x.id !== c.id));
      setSelectedIds((p) => { const n = new Set(p); n.delete(c.id); return n; });
      setUndo({ label: c.email ?? c.phone ?? "Contact", ids: [c.id], contacts: [c] });
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to delete contact"); }
  }

  async function removeSelected() {
    const ids = Array.from(selectedIds);
    if (!ids.length || !(await confirmText(`Move ${ids.length} selected contact${ids.length === 1 ? "" : "s"} to trash?\n\n${SOFT_DELETE_NOTICE}`))) return;
    setBulkDeleting(true);
    try {
      const gone = contacts.filter((c) => selectedIds.has(c.id));
      await bulkDeleteContacts(ids);
      setContacts((p) => p.filter((c) => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
      setUndo({ label: `${ids.length} contact${ids.length === 1 ? "" : "s"}`, ids, contacts: gone });
    }
    catch (err) { setError(err instanceof Error ? err.message : "Bulk delete failed"); }
    finally { setBulkDeleting(false); }
  }

  async function removeByTag() {
    if (!tagFilter || !(await confirmText(`Move every contact tagged "${tagFilter}" to trash?\n\n${SOFT_DELETE_NOTICE}`))) return;
    setTagDeleting(true);
    try { await deleteContactsByTag(tagFilter); setContacts((p) => p.filter((c) => !c.tags.includes(tagFilter))); setTagFilter(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Delete by tag failed"); }
    finally { setTagDeleting(false); }
  }

  function toggleOptIn(c: Contact, field: "sms_opt_in" | "whatsapp_opt_in", v: boolean) {
    setContacts((p) => p.map((x) => (x.id === c.id ? { ...x, [field]: v } : x)));
    updateOptIn(c.id, { [field]: v }).catch(() => {
      setContacts((p) => p.map((x) => (x.id === c.id ? { ...x, [field]: !v } : x)));
      setError("Couldn't save that change. Please try again.");
    });
  }

  const toggleSelect = (id: string) => setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const togglePage = () => setSelectedIds((p) => {
    const n = new Set(p);
    if (allPageSelected) pageRows.forEach((c) => n.delete(c.id)); else pageRows.forEach((c) => n.add(c.id));
    return n;
  });

  const tiles: { key: View; label: string; hint: string; icon: JSX.Element; tone: string }[] = [
    { key: "all", label: "All contacts", hint: "Everyone you have", icon: <Users size={14} />, tone: "text-brand-700 bg-brand-50" },
    { key: "sms", label: "Can get SMS", hint: "Opted in to SMS", icon: <MessageSquare size={14} />, tone: "text-sky-700 bg-sky-50" },
    { key: "whatsapp", label: "Can get WhatsApp", hint: "Opted in to WhatsApp", icon: <MessageCircle size={14} />, tone: "text-emerald-700 bg-emerald-50" },
    { key: "email", label: "Have an email", hint: "Can get email campaigns", icon: <Globe size={14} />, tone: "text-indigo-700 bg-indigo-50" },
    { key: "none", label: "No opt-in yet", hint: "Not reachable by SMS/WhatsApp", icon: <Phone size={14} />, tone: "text-surface-600 bg-surface-100" },
  ];

  return (
    <AppLayout>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-xl font-bold text-surface-900 tracking-tight">Contacts</h1>
          <p className="text-sm text-surface-500">The people you send campaigns to.</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link to="/contacts/trash" title="Trash" aria-label="Trash"><Button size="sm" variant="ghost" icon={<Archive size={15} />}><span className="hidden sm:inline">Trash</span></Button></Link>
          <Button size="sm" variant="ghost" icon={<Download size={15} />} disabled={!contacts.length} onClick={() => exportContacts(filtered, "contacts.csv")} title="Export" aria-label="Export"><span className="hidden sm:inline">Export{hasFilters ? " filtered" : ""}</span></Button>
          <Button size="sm" variant="secondary" icon={<Upload size={15} />} onClick={() => setShowImport(true)}>Import<span className="hidden sm:inline">&nbsp;CSV</span></Button>
          <Button size="sm" className="hidden sm:inline-flex" icon={<Plus size={15} />} onClick={openAdd}>Add contact</Button>
        </div>
      </div>
      <PlanUsageStrip items={["contacts"]} />

      {undo && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-[6px] border border-surface-200 bg-surface-900 px-4 py-2.5 text-sm text-white shadow-sm animate-slide-up">
          <span className="flex items-center gap-2 min-w-0"><Archive size={15} className="flex-shrink-0 text-white/70" /><span className="truncate">Moved <b>{undo.label}</b> to Trash.</span></span>
          <span className="flex items-center gap-3 flex-shrink-0">
            <button onClick={doUndo} disabled={undoing} className="inline-flex items-center gap-1 font-semibold text-brand-300 hover:text-white disabled:opacity-60"><RotateCcw size={14} />{undoing ? "Restoring…" : "Undo"}</button>
            <Link to="/contacts/trash" className="text-white/70 hover:text-white">View Trash</Link>
            <button onClick={() => setUndo(null)} className="text-white/50 hover:text-white" aria-label="Dismiss"><X size={15} /></button>
          </span>
        </div>
      )}
      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-3">{error}</Alert>}
      {notice && <Alert variant="success" onDismiss={() => setNotice(null)} className="mb-3">{notice}</Alert>}

      {loaded && contacts.length === 0 ? (
        <Card className="!py-10 !rounded-[6px]">
          <div className="text-center max-w-xl mx-auto">
            <span className="mx-auto w-14 h-14 rounded-[6px] bg-brand-50 text-brand-600 flex items-center justify-center"><Users size={28} /></span>
            <h2 className="mt-3 text-lg font-semibold text-surface-900">Add your first contacts</h2>
            <p className="mt-1 text-sm text-surface-500">Contacts are the people who receive your email, SMS and WhatsApp campaigns. Choose how to start:</p>
          </div>
          <div className="mt-6 grid sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {[
              { icon: <Upload size={20} />, title: "Import a file", body: "Upload a CSV from Excel or Google Sheets. We'll show you a sample.", action: () => setShowImport(true), cta: "Import CSV" },
              { icon: <UserPlus size={20} />, title: "Add one by one", body: "Type in a name, email and phone number.", action: openAdd, cta: "Add contact" },
              { icon: <Globe size={20} />, title: "Collect with a form", body: "Build a landing page; people who sign up appear here.", action: () => navigate("/landing-pages"), cta: "Open landing pages" },
            ].map((o) => (
              <button key={o.title} onClick={o.action} className="text-left rounded-[6px] border border-surface-200 p-4 hover:border-brand-300 hover:shadow-card-hover transition bg-white">
                <span className="w-9 h-9 rounded-[6px] bg-brand-50 text-brand-600 flex items-center justify-center">{o.icon}</span>
                <p className="mt-2 text-sm font-semibold text-surface-900">{o.title}</p>
                <p className="mt-0.5 text-xs text-surface-500">{o.body}</p>
                <p className="mt-2 text-xs font-medium text-brand-600">{o.cta} →</p>
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <>
          {/* Summary tiles double as filters */}
          <div className="-mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5">
            {tiles.map((t) => {
              const on = view === t.key;
              return (
                <button key={t.key} onClick={() => setView(on && t.key !== "all" ? "all" : t.key)} title={t.hint}
                  className={`flex flex-shrink-0 items-center gap-2.5 rounded-[6px] border bg-white py-1.5 pl-1.5 pr-4 text-left transition sm:px-2.5 ${on ? "border-brand-500 ring-2 ring-brand-500/15" : "border-surface-200 hover:border-surface-300"}`}>
                  <span className={`w-7 h-7 rounded-[6px] flex items-center justify-center flex-shrink-0 ${t.tone}`}>{t.icon}</span>
                  <span className="min-w-0 leading-tight">
                    <span className="block text-base font-bold text-surface-900 tabular-nums">{loaded ? counts[t.key].toLocaleString() : "–"}</span>
                    <span className="block text-[11px] text-surface-500 truncate">{t.label}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <div className="relative w-full flex-none sm:flex-1 sm:min-w-[14rem] sm:max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or phone…"
                className="w-full rounded-[6px] border border-surface-200 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
            </div>
            <div className="min-w-0 flex-1 sm:w-40 sm:flex-none"><Select selectSize="sm" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}><option value="">All tags</option>{allTags.map((t) => <option key={t} value={t}>{t}</option>)}</Select></div>
            <div className="min-w-0 flex-1 sm:w-40 sm:flex-none"><Select selectSize="sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option></Select></div>
            {tagFilter && <Button size="sm" variant="ghost" className="text-danger-base hover:bg-danger-light" icon={<Trash2 size={13} />} loading={tagDeleting} onClick={removeByTag}>Delete all tagged “{tagFilter}”</Button>}
            {hasFilters && <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>}
            <span className="ml-auto text-xs text-surface-500">{hasFilters ? `${filtered.length.toLocaleString()} of ${contacts.length.toLocaleString()} contacts` : `${contacts.length.toLocaleString()} contacts`}</span>
          </div>

          {filtered.length === 0 ? (
            <Card><EmptyState icon={<Search size={40} />} title="No matching contacts" description="Try a different search or clear your filters." action={<Button size="sm" variant="secondary" onClick={clearFilters}>Clear filters</Button>} /></Card>
          ) : (
            <Card padding={false} className="overflow-hidden !rounded-[6px]">
              {selectedIds.size > 0 && (
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-brand-50 border-b border-brand-100">
                  <span className="text-sm font-medium text-brand-800">{selectedIds.size} selected</span>
                  <div className="flex gap-2">
                    <Button size="xs" variant="secondary" icon={<Download size={12} />} onClick={() => exportContacts(contacts.filter((c) => selectedIds.has(c.id)), "selected-contacts.csv")}>Export</Button>
                    <Button size="xs" variant="danger" icon={<Trash2 size={12} />} loading={bulkDeleting} onClick={removeSelected}>Move to trash</Button>
                    <Button size="xs" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
                  </div>
                </div>
              )}

              {/* One table for every screen size: on phones the secondary columns fold away */}
              <div className="overflow-x-auto">
                <table data-no-cards className="w-full text-left text-sm">
                  <thead className="border-b border-surface-200 bg-surface-50">
                    <tr>
                      <th className="pl-3 pr-1 py-2.5 w-8 sm:px-4 sm:py-3"><input type="checkbox" checked={allPageSelected} onChange={togglePage} className="rounded border-surface-300" aria-label="Select all on this page" /></th>
                      <th className="px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-surface-500 sm:px-3 sm:py-3 sm:text-xs">Contact</th>
                      <th className="hidden px-3 py-3 text-xs font-semibold uppercase tracking-wide text-surface-500 md:table-cell">Phone</th>
                      <th className="hidden px-3 py-3 text-xs font-semibold uppercase tracking-wide text-surface-500 md:table-cell">Tags</th>
                      <th className="px-1.5 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-surface-500 sm:px-3 sm:py-3 sm:text-left sm:text-xs"><span className="sm:hidden">SMS</span><span className="hidden sm:inline">SMS</span></th>
                      <th className="px-1.5 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-surface-500 sm:px-3 sm:py-3 sm:text-left sm:text-xs"><span className="sm:hidden">WA</span><span className="hidden sm:inline">WhatsApp</span></th>
                      <th className="hidden px-3 py-3 text-xs font-semibold uppercase tracking-wide text-surface-500 md:table-cell">Added</th>
                      <th className="w-10 px-1 py-2.5 md:w-28 md:px-3 md:py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {pageRows.map((c) => (
                      <tr key={c.id} onClick={() => navigate(`/contacts/${c.id}`)} className={`group cursor-pointer transition-colors hover:bg-surface-50 active:bg-surface-100 ${selectedIds.has(c.id) ? "bg-brand-50/40" : ""}`}>
                        <td className="pl-3 pr-1 py-2.5 sm:px-4" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded border-surface-300" /></td>
                        <td className="px-2 py-2.5 sm:px-3 max-w-0 w-full md:max-w-none md:w-auto">
                          <div className="flex items-center gap-2.5 min-w-0 sm:gap-3">
                            <span className="w-9 h-9 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-sm font-bold flex-shrink-0">{initials(c)}</span>
                            <div className="min-w-0">
                              <p className="font-medium text-surface-900 truncate">{displayName(c) || <span className="text-surface-400 font-normal">No name</span>}</p>
                              <p className="text-xs text-surface-500 truncate">{c.email ?? "No email"}</p>
                              {c.phone && <p className="font-mono text-[11px] text-surface-400 truncate md:hidden">{c.phone}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-3 py-2.5 font-mono text-xs text-surface-600 whitespace-nowrap md:table-cell">{c.phone ?? <span className="text-surface-300">—</span>}{c.latitude != null && c.longitude != null && <a href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`} target="_blank" rel="noreferrer" title="Open exact location in Maps" aria-label="Open location" className="ml-1.5 inline-flex align-middle text-brand-500 hover:text-brand-700"><MapPin size={13} /></a>}</td>
                        <td className="hidden px-3 py-2.5 md:table-cell">
                          <div className="flex flex-wrap gap-1 max-w-[12rem]">
                            {c.tags.slice(0, 2).map((t) => <Badge key={t} size="sm">{t}</Badge>)}
                            {c.tags.length > 2 && <span className="text-[11px] text-surface-400 self-center" title={c.tags.slice(2).join(", ")}>+{c.tags.length - 2}</span>}
                            {c.tags.length === 0 && <span className="text-surface-300 text-xs">—</span>}
                          </div>
                        </td>
                        <td className="px-1.5 py-2.5 text-center sm:px-3 sm:text-left" onClick={(e) => e.stopPropagation()}>
                          {c.phone ? <Toggle value={c.sms_opt_in} size="sm" onChange={(v) => toggleOptIn(c, "sms_opt_in", v)} /> : <span className="text-xs text-surface-300" title="Add a phone number first">—</span>}
                        </td>
                        <td className="px-1.5 py-2.5 text-center sm:px-3 sm:text-left" onClick={(e) => e.stopPropagation()}>
                          {c.phone ? <Toggle value={c.whatsapp_opt_in} size="sm" onChange={(v) => toggleOptIn(c, "whatsapp_opt_in", v)} /> : <span className="text-xs text-surface-300" title="Add a phone number first">—</span>}
                        </td>
                        <td className="hidden px-3 py-2.5 text-xs text-surface-500 whitespace-nowrap md:table-cell">{added(c.created_at)}</td>
                        <td className="px-1 py-2.5 md:px-3" onClick={(e) => e.stopPropagation()}>
                          <div className="hidden items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity md:flex">
                            <button type="button" onClick={() => setHistoryContact(c)} className="p-1.5 rounded text-surface-400 hover:text-brand-600 hover:bg-brand-50" title="History"><History size={14} /></button>
                            <button type="button" onClick={() => openEdit(c)} className="p-1.5 rounded text-surface-400 hover:text-brand-600 hover:bg-brand-50" title="Edit"><Pencil size={14} /></button>
                            <button type="button" onClick={() => remove(c)} className="p-1.5 rounded text-surface-400 hover:text-danger-base hover:bg-danger-light" title="Move to trash"><Trash2 size={14} /></button>
                          </div>
                          <div className="md:hidden"><RowMenu onEdit={() => openEdit(c)} onHistory={() => setHistoryContact(c)} onDelete={() => remove(c)} /></div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-2.5 border-t border-surface-100 bg-surface-50 text-xs text-surface-600">
                <span>Showing {((current - 1) * pageSize + 1).toLocaleString()}–{Math.min(current * pageSize, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5">Per page
                    <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded border border-surface-200 bg-white px-1.5 py-0.5">{PAGE_SIZES.map((n) => <option key={n}>{n}</option>)}</select></label>
                  <div className="flex items-center gap-1">
                    <button disabled={current <= 1} onClick={() => setPage(current - 1)} className="p-1 rounded hover:bg-white disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={16} /></button>
                    <span className="tabular-nums">Page {current} of {pages}</span>
                    <button disabled={current >= pages} onClick={() => setPage(current + 1)} className="p-1 rounded hover:bg-white disabled:opacity-40" aria-label="Next page"><ChevronRight size={16} /></button>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      <button type="button" onClick={openAdd} aria-label="Add contact"
        className="sm:hidden fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-xl shadow-brand-600/30 active:scale-95 transition">
        <Plus size={26} />
      </button>

      {showImport && (
        <ImportContactsModal onClose={() => setShowImport(false)} onImported={() => { load(); fetchTagPresets().then(setTagPresets).catch(() => undefined); }} />
      )}

      {historyContact && (
        <ContactHistoryModal
          contactId={historyContact.id}
          contactLabel={historyContact.email ?? historyContact.phone ?? "Contact"}
          onClose={() => setHistoryContact(null)}
          onRestored={(u) => setContacts((p) => p.map((c) => (c.id === u.id ? u : c)))}
        />
      )}
    </AppLayout>
  );
}
