import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Search, ShieldCheck, Trash2, X } from "lucide-react";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Card from "../components/Card";
import { fetchTenants, type Tenant } from "../lib/admin";
import { assignSenderId, fetchSenderIds, revokeSenderId, type SenderIdRow } from "../lib/smsGateway";

/** Every customer's masking Sender ID: who has one, its status, assign or remove. */
export default function SenderIdsTab({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<SenderIdRow[] | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "waiting">("all");
  const [assigning, setAssigning] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [senderId, setSenderId] = useState("");
  const [revoke, setRevoke] = useState<SenderIdRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => fetchSenderIds().then(setRows).catch(() => setError("Failed to load Sender IDs"));
  useEffect(() => { load(); fetchTenants().then(setTenants).catch(() => undefined); }, []);

  const shown = useMemo(() => (rows ?? []).filter((r) =>
    (filter === "all" || (filter === "active" ? r.approved : !r.approved)) &&
    (!q.trim() || `${r.org_name} ${r.sender_id}`.toLowerCase().includes(q.trim().toLowerCase()))), [rows, q, filter]);
  const active = (rows ?? []).filter((r) => r.approved).length;
  const withoutId = tenants.filter((t) => !(rows ?? []).some((r) => r.org_id === t.id));

  async function assign(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await assignSenderId(orgId, senderId.trim()); setAssigning(false); setOrgId(""); setSenderId(""); await load(); onChanged(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed"); } finally { setBusy(false); }
  }
  async function doRevoke() {
    if (!revoke) return; setBusy(true);
    try { await revokeSenderId(revoke.org_id); setRevoke(null); await load(); onChanged(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed"); setRevoke(null); } finally { setBusy(false); }
  }

  return (
    <div>
      {error && <Alert className="mb-3" onDismiss={() => setError(null)}>{error}</Alert>}

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="relative flex-1 min-w-[12rem] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company or Sender ID…"
              className="w-full rounded-md border border-surface-200 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
          </div>
          <div className="flex gap-1 bg-surface-100 p-0.5 rounded-md">
            {([["all", `All ${rows?.length ?? 0}`], ["active", `Active ${active}`], ["waiting", `Waiting ${(rows?.length ?? 0) - active}`]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className={`px-2.5 py-1 rounded text-xs font-medium ${filter === k ? "bg-white shadow-sm text-surface-900" : "text-surface-600 hover:text-surface-900"}`}>{label}</button>
            ))}
          </div>
        </div>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setAssigning(true)}>Assign a Sender ID</Button>
      </div>

      <Card padding={false} className="overflow-hidden">
        {!rows ? <p className="py-12 text-center text-sm text-surface-400">Loading…</p> : shown.length === 0 ? (
          <div className="py-12 text-center">
            <ShieldCheck size={28} className="mx-auto text-surface-300 mb-2" />
            <p className="text-sm font-medium text-surface-700">{rows.length === 0 ? "No customer has a masking Sender ID yet" : "No matches"}</p>
            <p className="text-xs text-surface-500">{rows.length === 0 ? "Everyone sends from the shared sender. Approve a request, or assign one directly." : "Try another search or filter."}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>{["Company", "Sender ID", "Status", ""].map((h) => <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-surface-400 text-left">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {shown.map((r) => (
                <tr key={r.org_id} className="hover:bg-surface-50">
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><span className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-xs font-bold uppercase">{r.org_name[0]}</span><span className="font-medium text-surface-900">{r.org_name}</span></div></td>
                  <td className="px-4 py-3"><span className="font-mono text-xs rounded bg-surface-100 px-1.5 py-0.5">{r.sender_id}</span></td>
                  <td className="px-4 py-3"><Badge variant={r.approved ? "success" : "warning"} size="sm" dot>{r.approved ? "Active" : "Waiting for approval"}</Badge></td>
                  <td className="px-4 py-3 text-right"><button onClick={() => setRevoke(r)} aria-label="Remove" className="p-1.5 rounded text-surface-400 hover:bg-danger-light hover:text-danger-base"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {assigning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4" onClick={() => !busy && setAssigning(false)}>
          <form onSubmit={assign} className="bg-white rounded-2xl shadow-2xl w-full max-w-md" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-surface-100"><div><h2 className="font-semibold text-surface-900">Assign a Sender ID</h2><p className="text-xs text-surface-500">For an ID you already registered with the provider.</p></div>
              <button type="button" onClick={() => setAssigning(false)} className="p-1 rounded text-surface-400 hover:bg-surface-100" aria-label="Close"><X size={18} /></button></div>
            <div className="p-4 space-y-3">
              <div><label className="block text-sm font-medium text-surface-700 mb-1">Customer</label>
                <select value={orgId} onChange={(e) => setOrgId(e.target.value)} required className="w-full rounded-md border border-surface-200 bg-white px-2.5 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                  <option value="">Choose a customer…</option>
                  {withoutId.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select></div>
              <div><label className="block text-sm font-medium text-surface-700 mb-1">Sender ID</label>
                <input value={senderId} onChange={(e) => setSenderId(e.target.value)} maxLength={20} required placeholder="BrandName" className="w-full rounded-md border border-surface-200 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" /></div>
              <p className="text-xs text-surface-500">It becomes active straight away. The customer's plan must allow masking for it to be used.</p>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3.5 border-t border-surface-100"><Button type="button" size="sm" variant="ghost" onClick={() => setAssigning(false)}>Cancel</Button><Button type="submit" size="sm" loading={busy} disabled={!orgId || !senderId.trim()}>Assign &amp; activate</Button></div>
          </form>
        </div>
      )}

      {revoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4" onClick={() => !busy && setRevoke(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3.5"><span className="w-10 h-10 rounded-full bg-danger-light text-danger-base flex items-center justify-center flex-shrink-0"><AlertTriangle size={18} /></span>
              <div><h2 className="font-semibold text-surface-900">Remove this Sender ID?</h2><p className="mt-1.5 text-sm text-surface-600"><b className="font-mono">{revoke.sender_id}</b> will be taken away from {revoke.org_name}. They go back to the shared sender.</p></div></div>
            <div className="mt-5 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setRevoke(null)} disabled={busy}>Cancel</Button><Button size="sm" variant="danger" loading={busy} onClick={doRevoke}>Remove</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
