import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Archive, Info, RotateCcw, Search, Trash2 } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import Badge from "../../components/Badge";
import Button from "../../components/Button";
import Card from "../../components/Card";
import EmptyState from "../../components/EmptyState";
import Select from "../../components/Select";
import { bulkPurgeContacts, bulkRestoreContacts, fetchTrashedContacts, type Contact } from "../../lib/audience";
import { confirmText } from "../../components/ConfirmDialog";

type Age = "any" | "7" | "30" | "older";
const dt = (ts: string) => new Date(ts).toLocaleString("en-BD", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const name = (c: Contact) => [c.first_name, c.last_name].filter(Boolean).join(" ");
const DAY = 86_400_000;

const PURGE_NOTICE =
  "This cannot be undone. It also permanently erases their notes, workflow history and SMS opt-out records. " +
  "Their email/SMS engagement stats are kept (anonymised) for campaign analytics.";

export default function TrashPage() {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [age, setAge] = useState<Age>("any");

  const load = () => fetchTrashedContacts().then(setContacts).catch(() => { setError("Failed to load trash"); setContacts([]); });
  useEffect(() => { load(); }, []);

  const tags = useMemo(() => Array.from(new Set((contacts ?? []).flatMap((c) => c.tags))).sort(), [contacts]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    return (contacts ?? []).filter((c) => {
      if (q && ![c.email, c.first_name, c.last_name, c.phone].filter(Boolean).join(" ").toLowerCase().includes(q)) return false;
      if (tag && !c.tags.includes(tag)) return false;
      const days = c.deleted_at ? (now - new Date(c.deleted_at).getTime()) / DAY : 0;
      if (age === "7" && days > 7) return false;
      if (age === "30" && days > 30) return false;
      if (age === "older" && days <= 30) return false;
      return true;
    });
  }, [contacts, search, tag, age]);

  const hasFilters = !!search.trim() || !!tag || age !== "any";
  const total = contacts?.length ?? 0;
  const selectedShown = shown.filter((c) => selected.has(c.id));
  const allShownSelected = shown.length > 0 && selectedShown.length === shown.length;
  // What a bulk action applies to: the ticked rows, otherwise everything the filters show.
  const targets = selectedShown.length > 0 ? selectedShown : shown;
  const scope = selectedShown.length > 0 ? `${selectedShown.length} selected` : hasFilters ? `${shown.length} matching` : `all ${shown.length}`;

  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((p) => { const n = new Set(p); allShownSelected ? shown.forEach((c) => n.delete(c.id)) : shown.forEach((c) => n.add(c.id)); return n; });
  const clearFilters = () => { setSearch(""); setTag(""); setAge("any"); };

  function drop(ids: string[]) {
    const gone = new Set(ids);
    setContacts((p) => (p ?? []).filter((c) => !gone.has(c.id)));
    setSelected((p) => { const n = new Set(p); ids.forEach((i) => n.delete(i)); return n; });
  }

  async function restore(list: Contact[]) {
    setBusy("restore"); setError(null); setNotice(null);
    try {
      const ids = list.map((c) => c.id);
      let restored: string[] = [], failed: { id: string; reason: string }[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const r = await bulkRestoreContacts(ids.slice(i, i + 200));
        restored = restored.concat(r.restored); failed = failed.concat(r.failed);
      }
      drop(restored);
      if (restored.length) setNotice(`${restored.length} contact${restored.length === 1 ? "" : "s"} restored.`);
      if (failed.length) setError(`${failed.length} couldn't be restored — ${failed[0].reason}${failed.length > 1 ? " (and others)" : ""}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Restore failed"); }
    finally { setBusy(null); }
  }

  async function purge(list: Contact[], label: string) {
    const n = list.length;
    const ok = await confirmText(
      `Permanently delete ${label}?\n\n${n === 1 ? (list[0].email ?? list[0].phone ?? "This contact") : `${n} contacts`} will be gone for good. ${PURGE_NOTICE}`,
      "Delete forever",
    );
    if (!ok) return;
    setBusy("purge"); setError(null); setNotice(null);
    try {
      const ids = list.map((c) => c.id);
      let deleted = 0;
      for (let i = 0; i < ids.length; i += 200) deleted += (await bulkPurgeContacts(ids.slice(i, i + 200))).deleted;
      drop(ids);
      setNotice(`${deleted} contact${deleted === 1 ? "" : "s"} permanently deleted.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Delete failed"); }
    finally { setBusy(null); }
  }

  return (
    <AppLayout>
      <Link to="/contacts" className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-brand-600 font-medium mb-2"><ArrowLeft size={14} /> Contacts</Link>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div><h1 className="text-xl font-bold text-surface-900 tracking-tight">Trash</h1>
          <p className="text-sm text-surface-500">{contacts ? `${total.toLocaleString()} removed contact${total === 1 ? "" : "s"}` : "Loading…"} — restore them, or delete forever.</p></div>
      </div>

      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-3">{error}</Alert>}
      {notice && <Alert variant="success" onDismiss={() => setNotice(null)} className="mb-3">{notice}</Alert>}

      {contacts && total === 0 ? (
        <Card><EmptyState icon={<Archive size={44} />} title="Trash is empty" description="Contacts you remove show up here until you restore them or delete them forever." /></Card>
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <div className="relative flex-1 min-w-[14rem] max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or phone…"
                className="w-full rounded-md border border-surface-200 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
            </div>
            <div className="w-40"><Select selectSize="sm" value={tag} onChange={(e) => setTag(e.target.value)}><option value="">All tags</option>{tags.map((t) => <option key={t} value={t}>{t}</option>)}</Select></div>
            <div className="w-48"><Select selectSize="sm" value={age} onChange={(e) => setAge(e.target.value as Age)}>
              <option value="any">Removed any time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="older">More than 30 days ago</option></Select></div>
            {hasFilters && <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>}
            <span className="ml-auto text-xs text-surface-500">{hasFilters ? `${shown.length.toLocaleString()} of ${total.toLocaleString()}` : `${total.toLocaleString()} in Trash`}</span>
          </div>

          <Card padding={false} className="overflow-hidden">
            {/* Action bar: acts on ticked rows, or on everything the filters show */}
            <div className={`flex items-center justify-between gap-3 flex-wrap px-4 py-2.5 border-b ${selectedShown.length ? "bg-brand-50 border-brand-100" : "bg-surface-50 border-surface-200"}`}>
              <span className="text-sm text-surface-700">
                {selectedShown.length > 0 ? <b>{selectedShown.length} selected</b> : shown.length ? <>Actions apply to <b>{hasFilters ? `the ${shown.length} matching` : `all ${shown.length}`}</b> contact{shown.length === 1 ? "" : "s"} — tick rows to choose specific ones.</> : "Nothing to act on."}
              </span>
              <div className="flex items-center gap-2">
                {selectedShown.length > 0 && <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>}
                <Button size="xs" variant="secondary" icon={<RotateCcw size={12} />} disabled={!targets.length} loading={busy === "restore"} onClick={() => restore(targets)}>Restore {scope}</Button>
                <Button size="xs" variant="danger" icon={<Trash2 size={12} />} disabled={!targets.length} loading={busy === "purge"} onClick={() => purge(targets, scope === `all ${shown.length}` ? "everything in Trash" : `${scope} contacts`)}>Delete forever · {scope}</Button>
              </div>
            </div>

            {shown.length === 0 ? (
              <EmptyState icon={<Search size={36} />} title="No matching contacts" description="Try a different search or clear the filters." action={<Button size="sm" variant="secondary" onClick={clearFilters}>Clear filters</Button>} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-surface-200 bg-white">
                    <tr>
                      <th className="px-4 py-3 w-8"><input type="checkbox" checked={allShownSelected} onChange={toggleAll} className="rounded border-surface-300" aria-label="Select all shown" /></th>
                      {["Contact", "Phone", "Tags", "Removed"].map((h) => <th key={h} className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-surface-500">{h}</th>)}
                      <th className="px-3 py-3 w-40" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {shown.map((c) => (
                      <tr key={c.id} className={`group hover:bg-surface-50 ${selected.has(c.id) ? "bg-brand-50/40" : ""}`}>
                        <td className="px-4 py-2.5"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="rounded border-surface-300" /></td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-8 h-8 rounded-full bg-surface-100 text-surface-500 flex items-center justify-center text-sm font-bold flex-shrink-0">{(name(c) || c.email || c.phone || "?")[0]?.toUpperCase()}</span>
                            <div className="min-w-0"><p className="font-medium text-surface-800 truncate">{name(c) || <span className="text-surface-400 font-normal">No name</span>}</p><p className="text-xs text-surface-500 truncate">{c.email ?? "No email"}</p></div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-surface-600 whitespace-nowrap">{c.phone ?? "—"}</td>
                        <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1 max-w-[12rem]">{c.tags.slice(0, 2).map((t) => <Badge key={t} size="sm">{t}</Badge>)}{c.tags.length > 2 && <span className="text-[11px] text-surface-400 self-center">+{c.tags.length - 2}</span>}{!c.tags.length && <span className="text-surface-300 text-xs">—</span>}</div></td>
                        <td className="px-3 py-2.5 text-xs text-surface-500 whitespace-nowrap">{c.deleted_at ? dt(c.deleted_at) : "—"}</td>
                        <td className="px-3 py-2.5"><div className="flex items-center justify-end gap-1.5 opacity-70 group-hover:opacity-100">
                          <Button size="xs" variant="secondary" icon={<RotateCcw size={12} />} disabled={busy !== null} onClick={() => restore([c])}>Restore</Button>
                          <button type="button" disabled={busy !== null} onClick={() => purge([c], "this contact")} title="Delete forever" className="p-1.5 rounded text-surface-400 hover:text-danger-base hover:bg-danger-light"><Trash2 size={14} /></button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="mt-3 flex items-start gap-2 text-xs text-surface-500"><Info size={14} className="mt-0.5 flex-shrink-0" /> Deleting forever can't be undone. If you're unsure, restore the contact instead — a restored contact keeps its history and opt-in settings.</p>
          {!hasFilters && total > 0 && selectedShown.length === 0 && (
            <p className="mt-1 flex items-start gap-2 text-xs text-warning-dark"><AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> With no filter or ticked rows, “Delete forever” empties the whole Trash.</p>
          )}
        </>
      )}
    </AppLayout>
  );
}
