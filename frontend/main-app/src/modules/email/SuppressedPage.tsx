import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, MailX, Plus, Search, ShieldAlert } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Spinner from "../../components/Spinner";
import { addSuppression, fetchSuppressions, removeSuppression, type SuppressionList } from "../../lib/suppressions";

const FILTERS = [["", "All"], ["unsubscribe", "Unsubscribed"], ["bounce", "Bounced"], ["complaint", "Reported spam"], ["manual", "Added by you"]] as const;
const TONE: Record<string, string> = { unsubscribe: "bg-surface-100 text-surface-700", bounce: "bg-danger-light text-danger-dark", complaint: "bg-danger-light text-danger-dark", manual: "bg-brand-50 text-brand-700" };

export default function SuppressedPage() {
  const [data, setData] = useState<SuppressionList | null>(null);
  const [reason, setReason] = useState("");
  const [q, setQ] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => fetchSuppressions({ q: q.trim() || undefined, reason: reason || undefined }).then(setData).catch((e) => setError(e.message)), [q, reason]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const total = Object.values(data?.counts ?? {}).reduce((a, b) => a + b, 0);
  async function add(e: FormEvent) {
    e.preventDefault(); setBusy("add"); setError(null);
    try { const r = await addSuppression(email); setNotice(r.added ? `${email.trim().toLowerCase()} will not be emailed.` : "That address is already on the list."); setEmail(""); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not add"); } finally { setBusy(null); }
  }
  async function allow(id: string, addr: string) {
    setBusy(id); setError(null);
    try { await removeSuppression(id); setNotice(`${addr} can be emailed again. Only do this if the person asked to receive your emails again.`); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not remove"); } finally { setBusy(null); }
  }

  return (
    <AppLayout>
      <Link to="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium mb-3"><ArrowLeft size={14} /> Back to Email Campaigns</Link>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-surface-900 tracking-tight flex items-center gap-2"><MailX size={20} className="text-surface-500" /> Unsubscribed &amp; bounced</h1>
        <p className="text-sm text-surface-600">These addresses are skipped in every campaign. It protects your sender reputation and respects people's choice.</p>
      </div>
      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-3">{error}</Alert>}
      {notice && <Alert variant="success" onDismiss={() => setNotice(null)} className="mb-3">{notice}</Alert>}

      <div className="grid sm:grid-cols-4 gap-2.5 mb-4">
        {[["Unsubscribed", "unsubscribe"], ["Bounced", "bounce"], ["Reported spam", "complaint"], ["Added by you", "manual"]].map(([l, k]) => (
          <div key={k} className="rounded-xl border border-surface-200 bg-white px-3.5 py-2.5"><p className="text-[11px] text-surface-500">{l}</p><p className="text-xl font-bold text-surface-900">{data?.counts[k] ?? 0}</p></div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1 overflow-x-auto bg-surface-100 p-1 rounded-lg">
          {FILTERS.map(([k, l]) => <button key={k} onClick={() => setReason(k)} className={`whitespace-nowrap px-2.5 py-1 rounded-md text-xs font-medium ${reason === k ? "bg-white shadow-sm text-surface-900" : "text-surface-600 hover:text-surface-900"}`}>{l}</button>)}
        </div>
        <div className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search an address…" className="rounded-lg border border-surface-200 pl-8 pr-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" /></div>
        <form onSubmit={add} className="ml-auto flex gap-2">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Block an address…" className="rounded-lg border border-surface-200 px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
          <Button type="submit" size="sm" variant="secondary" icon={<Plus size={14} />} loading={busy === "add"}>Add</Button>
        </form>
      </div>

      {!data ? <div className="flex justify-center py-12"><Spinner /></div> : data.items.length === 0 ? (
        <div className="rounded-xl border border-surface-200 bg-white py-12 text-center"><ShieldAlert size={26} className="mx-auto text-surface-300 mb-2" />
          <p className="text-sm font-medium text-surface-700">{total === 0 ? "Nobody has unsubscribed or bounced yet" : "No addresses match"}</p>
          <p className="text-xs text-surface-500 mt-1">When someone clicks Unsubscribe in an email, or an address bounces, it shows up here automatically.</p></div>
      ) : (
        <div className="rounded-xl border border-surface-200 bg-white divide-y divide-surface-100 overflow-hidden">
          {data.items.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="text-sm text-surface-900 flex-1 min-w-[200px] break-all">{s.email}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[s.reason] ?? TONE.manual}`}>{s.label}</span>
              <span className="text-xs text-surface-500 w-28 text-right">{new Date(s.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              <Button size="xs" variant="ghost" disabled={!s.can_remove} loading={busy === s.id} title={s.can_remove ? "" : "Bounced or spam-reported addresses can't be emailed again"} onClick={() => allow(s.id, s.email)}>Allow again</Button>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
