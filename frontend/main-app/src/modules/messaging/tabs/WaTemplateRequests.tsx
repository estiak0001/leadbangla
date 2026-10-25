import { FormEvent, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import Alert from "../../../components/Alert";
import Badge from "../../../components/Badge";
import Button from "../../../components/Button";
import Spinner from "../../../components/Spinner";
import { cancelWaTemplateRequest, createWaTemplateRequest, fetchWaTemplateRequests, type WaRequestStatus, type WaTemplateRequest } from "../../../lib/sms";

const VARIANT: Record<WaRequestStatus, "warning" | "info" | "success" | "danger" | "default"> = {
  pending: "warning", with_meta: "info", approved: "success", rejected: "danger", meta_rejected: "danger", cancelled: "default",
};
const CATEGORY_HELP: Record<string, string> = {
  utility: "Order updates, receipts, reminders, confirmations. Cheapest.",
  marketing: "Offers, promotions, announcements. Costs the most.",
  authentication: "One-time passwords and login codes.",
};
const STEPS = ["You send the request", "Our team reviews it", "Meta approves it", "Use it in campaigns"];
const field = "w-full border border-surface-300 rounded-[3px] px-2.5 py-2 text-base sm:text-sm bg-white focus:border-brand-500 focus:outline-none";

export default function WaTemplateRequests() {
  const [items, setItems] = useState<WaTemplateRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ label: "", language: "en", category: "utility", body: "", examples: [] as string[] });
  const load = () => fetchWaTemplateRequests().then(setItems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const blanks = new Set([...f.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))).size;

  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try { await createWaTemplateRequest({ ...f, examples: f.examples.slice(0, blanks) }); setOpen(false); setF({ label: "", language: "en", category: "utility", body: "", examples: [] }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not send"); } finally { setSaving(false); }
  }
  async function cancel(t: WaTemplateRequest) {
    if (!window.confirm(`Cancel the request “${t.label}”?`)) return;
    try { await cancelWaTemplateRequest(t.id); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
  }

  if (!items) return error ? <Alert variant="error">{error}</Alert> : <div className="py-12 flex justify-center"><Spinner /></div>;
  return (
    <div className="space-y-3">
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-600">{STEPS.map((s, i) => <li key={s} className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded-full bg-brand-50 text-brand-700 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>{s}</li>)}</ol>
        {!open && <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> Request a template</Button>}
      </div>

      {open && (
        <form onSubmit={submit} className="bg-white border border-surface-200 rounded-[4px] p-4 space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-surface-900">New template request</h2>
            <button type="button" onClick={() => setOpen(false)} className="p-1 text-surface-400 hover:text-surface-700" aria-label="Close"><X size={16} /></button></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1"><label className="block text-xs font-semibold text-surface-600 mb-1">Name</label>
              <input className={field} value={f.label} maxLength={100} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. Order ready" required /></div>
            <div><label className="block text-xs font-semibold text-surface-600 mb-1">Language</label>
              <select className={field} value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}><option value="en">English</option><option value="bn">Bangla</option><option value="en_US">English (US)</option></select></div>
            <div><label className="block text-xs font-semibold text-surface-600 mb-1">Type</label>
              <select className={field} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="utility">Utility</option><option value="marketing">Marketing</option><option value="authentication">Authentication</option></select></div>
          </div>
          <p className="text-[11px] text-surface-500 -mt-1">{CATEGORY_HELP[f.category]} Meta may change the type if the text looks like something else.</p>
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1">Message <span className="font-normal text-surface-400">— use {"{{1}}"}, {"{{2}}"} for blanks such as name or order number</span></label>
            <textarea className={`${field} h-28 resize-none`} value={f.body} maxLength={1024} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Hi {{1}}, your order {{2}} is ready for pickup." required />
            <p className="text-[11px] text-surface-500 mt-1">Don’t start or end with a blank. {f.body.length}/1024</p>
          </div>
          {blanks > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-surface-600">Example for each blank <span className="font-normal text-surface-400">— Meta reads these to review it</span></p>
              {Array.from({ length: blanks }, (_, i) => (
                <div key={i} className="flex items-center gap-2"><span className="w-10 text-xs font-mono text-surface-500">{`{{${i + 1}}}`}</span>
                  <input className={field} value={f.examples[i] ?? ""} onChange={(e) => { const ex = [...f.examples]; ex[i] = e.target.value; setF({ ...f, examples: ex }); }} placeholder={i === 0 ? "Rahim" : "#1042"} required /></div>
              ))}
            </div>
          )}
          <div className="flex gap-2"><Button type="submit" size="sm" loading={saving}>Send for approval</Button><Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      )}

      {items.length === 0 && !open ? (
        <p className="bg-white border border-surface-200 rounded-[4px] p-10 text-center text-sm text-surface-500">No template requests yet. WhatsApp only lets you start a conversation with an approved template, so request one first.</p>
      ) : (
        <ul className="bg-white border border-surface-200 rounded-[4px] divide-y divide-surface-100">
          {items.map((t) => (
            <li key={t.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-surface-900 flex items-center gap-2 flex-wrap">{t.label}<span className="text-[11px] font-normal text-surface-500">{t.language} · {t.category}</span></p>
                  <p className="text-sm text-surface-700 whitespace-pre-wrap mt-1">{t.body}</p>
                  {(t.status === "rejected" && t.admin_note) && <p className="mt-1.5 text-xs text-danger-dark"><b>Our note:</b> {t.admin_note}</p>}
                  {(t.status === "meta_rejected" && t.meta_reason) && <p className="mt-1.5 text-xs text-danger-dark"><b>Meta says:</b> {t.meta_reason.replace(/_/g, " ").toLowerCase()}. Request a new one with the fix.</p>}
                  <p className="mt-1 text-[11px] text-surface-400">Requested {new Date(t.created_at).toLocaleDateString("en-BD", { day: "numeric", month: "short" })}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <Badge variant={VARIANT[t.status]} size="sm" dot>{t.status_label}</Badge>
                  {t.status === "pending" && <button onClick={() => cancel(t)} className="text-[11px] text-surface-500 hover:text-danger-dark">Cancel request</button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
