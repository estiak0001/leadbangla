import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, Circle, Download, ExternalLink, Inbox, Search, X } from "lucide-react";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Button from "../components/Button";
import {
  decideVerification, downloadBundle, listVerifications, openAdminDoc, type VRequest, type VerificationStatus,
} from "../lib/verifications";

const STATUS: Record<VerificationStatus, { label: string; variant: "warning" | "info" | "success" | "danger" | "default" }> = {
  pending: { label: "Needs review", variant: "warning" },
  needs_info: { label: "Waiting for customer", variant: "info" },
  submitted: { label: "With operator", variant: "info" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "danger" },
  cancelled: { label: "Cancelled", variant: "default" },
};
const KIND = { sms_sender_id: "SMS Sender ID", whatsapp_number: "WhatsApp number" } as const;
const fmt = (ts: string) => new Date(ts).toLocaleString("en-BD", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Review({ req, onClose, onDone }: { req: VRequest; onClose: () => void; onDone: (r: VRequest) => void }) {
  const [note, setNote] = useState(req.admin_note ?? "");
  const [revokeNote, setRevokeNote] = useState("");
  const [finalValue, setFinalValue] = useState(req.value);
  const [gatewayRef, setGatewayRef] = useState(req.gateway_ref ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = req.status === "pending" || req.status === "needs_info" || req.status === "submitted";

  const noDocs = req.missing_required.length > 0;
  async function decide(d: "approved" | "rejected" | "needs_info" | "submitted") {
    const skip = noDocs && (d === "approved" || d === "submitted");
    if (skip && !confirm("The customer hasn't uploaded all the required documents. Continue without them? This will be recorded in the request.")) return;
    setBusy(d); setError(null);
    try { onDone(await decideVerification(req.id, d, note, d === "approved" && req.kind === "sms_sender_id" ? finalValue : undefined, d === "submitted" ? gatewayRef : undefined, skip)); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-surface-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-surface-100">
          <div className="min-w-0">
            <p className="text-xs text-surface-500">{KIND[req.kind]} · {req.organization_name ?? "Tenant"}</p>
            <h2 className="text-lg font-bold text-surface-900 font-mono break-all">{req.value}</h2>
            <div className="mt-1 flex items-center gap-2"><Badge variant={STATUS[req.status].variant} size="sm" dot>{STATUS[req.status].label}</Badge><span className="text-xs text-surface-400">Submitted {fmt(req.created_at)}</span></div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-surface-400 hover:bg-surface-100" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
          {req.customer_note && (
            <div className="rounded-lg bg-surface-50 border border-surface-200 p-3 text-sm"><p className="text-xs font-semibold text-surface-500 mb-0.5">Customer note</p><p className="whitespace-pre-line text-surface-800">{req.customer_note}</p></div>
          )}

          {req.kind === "sms_sender_id" && open && (
            <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-3 text-xs text-surface-700">
              <p className="font-semibold text-surface-900 mb-1">How to process this request</p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>Check the documents below.</li>
                <li>Download the bundle and send it to your SMS provider (Alpha SMS or SSL Wireless, whichever is live) to register the Sender ID <span className="font-mono font-semibold">{req.value}</span>.</li>
                <li>Click <b>Mark as submitted</b> and keep their ticket number.</li>
                <li>When the provider confirms, click <b>Approve</b> — it activates for this customer.</li>
              </ol>
            </div>
          )}
          {req.submitted_at && (
            <div className="rounded-lg bg-info-light border border-info-base/30 p-3 text-sm"><p className="text-xs font-semibold text-surface-600">Submitted to provider {fmt(req.submitted_at)}</p>{req.gateway_ref && <p className="text-surface-800">Reference: <span className="font-mono">{req.gateway_ref}</span></p>}</div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-surface-700">Documents</h3>
              {req.documents.length > 0 && <button onClick={() => downloadBundle(req.id).catch((e) => setError(e.message))} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"><Download size={12} /> Download all (.zip)</button>}
            </div>
            <div className="rounded-lg border border-surface-200 divide-y divide-surface-100">
              {req.requirements.map((r) => {
                const docs = r.type === "other" ? req.documents.filter((d) => d.doc_type === "other") : r.uploaded ? [r.uploaded] : [];
                return (
                  <div key={r.type} className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {docs.length ? <CheckCircle2 size={15} className="text-success-base" /> : <Circle size={15} className={r.required ? "text-danger-base" : "text-surface-300"} />}
                      <span className="text-sm font-medium text-surface-900">{r.label}{r.required && <span className="text-danger-base"> *</span>}</span>
                      {r.group && <span className="text-[10px] font-semibold uppercase tracking-wide text-surface-400 border border-surface-200 rounded px-1">one of</span>}
                      {!docs.length && r.required && <span className="text-xs text-danger-base">missing</span>}
                    </div>
                    {r.group && <p className="ml-6 text-[11px] text-surface-500">{r.hint}</p>}
                    {docs.map((d) => (
                      <button key={d.id} onClick={() => openAdminDoc(req.id, d).catch((e) => setError(e.message))} className="mt-1.5 ml-6 flex items-center gap-1.5 text-xs text-brand-700 hover:underline">
                        <ExternalLink size={12} /> {d.filename} <span className="text-surface-400">· {size(d.size)}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {open ? (
            <div className="space-y-3">
              {req.kind === "sms_sender_id" && (
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Sender ID to activate</label>
                  <input value={finalValue} onChange={(e) => setFinalValue(e.target.value)} maxLength={20} className="w-full rounded-md border border-surface-200 px-3 py-1.5 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
                  <p className="mt-1 text-xs text-surface-500">Register this name with SSL Wireless / BTRC first, then approve. You can adjust it if the operator assigned a different one.</p>
                </div>
              )}
              {req.status !== "submitted" && (
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Provider reference <span className="font-normal text-surface-400">(ticket / request number, optional)</span></label>
                  <input value={gatewayRef} onChange={(e) => setGatewayRef(e.target.value)} maxLength={100} className="w-full rounded-md border border-surface-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Message to customer <span className="font-normal text-surface-400">(required to reject or ask for more)</span></label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className="w-full rounded-md border border-surface-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
              </div>
            </div>
          ) : req.admin_note ? (
            <div className="rounded-lg bg-surface-50 border border-surface-200 p-3 text-sm"><p className="text-xs font-semibold text-surface-500 mb-0.5">Your note · {req.reviewed_by} · {req.reviewed_at && fmt(req.reviewed_at)}</p><p className="whitespace-pre-line">{req.admin_note}</p></div>
          ) : null}
          {req.status === "approved" && (
            <div className="border border-danger-base/30 rounded-[4px] p-3 bg-danger-light/40">
              <p className="text-sm font-semibold text-surface-900">Revoke approval</p>
              <p className="text-xs text-surface-600 mb-2">The customer can no longer use this {req.kind === "sms_sender_id" ? "Sender ID" : "number"}. They are told why.</p>
              <textarea value={revokeNote} onChange={(e) => setRevokeNote(e.target.value)} rows={2} maxLength={2000} placeholder="Reason (required)" className="w-full rounded-[3px] border border-surface-200 bg-white px-3 py-2 text-base sm:text-sm focus:border-brand-500 focus:outline-none" />
              <Button size="sm" variant="danger" className="mt-2" loading={busy === "revoked"} disabled={!!busy || !revokeNote.trim()}
                onClick={() => { if (confirm(`Revoke approval of ${req.value}?`)) { setBusy("revoked"); setError(null); decideVerification(req.id, "revoked", revokeNote).then(onDone).catch((e) => setError(e instanceof Error ? e.message : "Failed")).finally(() => setBusy(null)); } }}>Revoke approval</Button>
            </div>
          )}
        </div>

        {open && (
          <div className="px-4 py-3 border-t border-surface-100 flex flex-wrap gap-2 justify-end">
            <Button size="sm" variant="danger" loading={busy === "rejected"} disabled={!!busy} onClick={() => decide("rejected")}>Reject</Button>
            <Button size="sm" variant="secondary" loading={busy === "needs_info"} disabled={!!busy} onClick={() => decide("needs_info")}>Ask for more info</Button>
            {req.status !== "submitted" && <Button size="sm" variant="secondary" loading={busy === "submitted"} disabled={!!busy} onClick={() => decide("submitted")}>Mark as submitted</Button>}
            <Button size="sm" variant="success" loading={busy === "approved"} disabled={!!busy} onClick={() => decide("approved")}>{noDocs ? "Approve without documents" : "Approve"}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

const ago = (ts: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

/** Required documents received: [have, total] (a "one of" group counts as one). */
const docProgress = (r: VRequest): [number, number] => {
  const groups = new Set(r.requirements.filter((x) => x.group).map((x) => x.group));
  const total = r.requirements.filter((x) => x.required && !x.group).length + groups.size;
  return [Math.max(0, total - r.missing_required.length), total];
};

const TILES: { key: string; label: string; hint: string; tone: string; statuses: VerificationStatus[] }[] = [
  { key: "pending", label: "Needs review", hint: "Waiting for you", tone: "text-warning-dark bg-warning-light", statuses: ["pending"] },
  { key: "submitted", label: "With operator", hint: "Sent to the SMS provider", tone: "text-info-dark bg-info-light", statuses: ["submitted"] },
  { key: "needs_info", label: "Waiting on customer", hint: "You asked for more", tone: "text-brand-700 bg-brand-50", statuses: ["needs_info"] },
  { key: "approved", label: "Approved", hint: "Done", tone: "text-success-dark bg-success-light", statuses: ["approved"] },
  { key: "rejected", label: "Rejected", hint: "Closed", tone: "text-danger-dark bg-danger-light", statuses: ["rejected", "cancelled"] },
];

/** The request queue: status tiles that double as filters, search, and clear rows. */
export function VerificationQueue({ kind, onChanged }: { kind: "sms_sender_id" | "whatsapp_number"; onChanged?: () => void }) {
  const [all, setAll] = useState<VRequest[] | null>(null);
  const [filter, setFilter] = useState<string>("pending");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<VRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = () => listVerifications(undefined, kind).then(setAll).catch((e) => {
    if (e instanceof Error && e.message === "UNAUTHORIZED") { navigate("/login"); return; }
    setError("Failed to load requests");
  });
  useEffect(() => { setAll(null); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind]);

  const count = (statuses: VerificationStatus[]) => (all ?? []).filter((r) => statuses.includes(r.status)).length;
  const tile = TILES.find((t) => t.key === filter);
  const rows = (all ?? [])
    .filter((r) => (!tile ? true : tile.statuses.includes(r.status)))
    .filter((r) => !q.trim() || `${r.organization_name} ${r.value}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div>
      {error && <Alert className="mb-3">{error}</Alert>}

      <div className="bg-white border border-surface-200 rounded-[4px] p-2.5 mb-3 flex flex-col lg:flex-row lg:items-center gap-2">
        <div className="flex flex-wrap gap-1.5 flex-1">
          {TILES.map((t) => {
            const on = filter === t.key, n = all ? count(t.statuses) : null;
            return (
              <button key={t.key} onClick={() => setFilter(on ? "" : t.key)} title={t.hint}
                className={`px-2.5 py-1 text-xs font-medium border rounded-[3px] whitespace-nowrap ${on ? "bg-brand-500 text-white border-brand-500" : "bg-white text-surface-600 border-surface-200 hover:bg-surface-50"}`}>
                {t.label} <span className={on ? "text-white/80" : n ? `font-bold ${t.tone.split(" ")[0]}` : "text-surface-400"}>{n ?? "–"}</span>
              </button>
            );
          })}
          {filter && <button onClick={() => setFilter("")} className="px-2 py-1 text-xs font-medium text-brand-600 hover:underline">Show all</button>}
        </div>
        <div className="relative lg:w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === "sms_sender_id" ? "Search company or Sender ID" : "Search company or number"}
            className="w-full rounded-[3px] border border-surface-200 bg-white py-1.5 pl-8 pr-3 text-base sm:text-sm focus:border-brand-500 focus:outline-none" />
        </div>
      </div>

      <div className="bg-white border border-surface-200 rounded-[4px] overflow-hidden">
        {!all ? <p className="py-12 text-center text-sm text-surface-400">Loading…</p> : rows.length === 0 ? (
          <div className="py-4 text-center">
            <Inbox size={22} className="mx-auto text-surface-300 mb-1.5" />
            <p className="text-sm font-medium text-surface-700">{filter === "pending" ? "You're all caught up" : "Nothing here"}</p>
            <p className="text-xs text-surface-500">{filter === "pending" ? "New requests from customers will show up here." : "Try another status above or clear the search."}</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {rows.map((r) => {
              const [have, total] = docProgress(r);
              const st = STATUS[r.status];
              return (
                <button key={r.id} onClick={() => setSelected(r)} className="group w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-surface-50">
                  <span className="w-8 h-8 rounded-[4px] bg-brand-50 text-brand-700 flex items-center justify-center text-sm font-bold uppercase flex-shrink-0">{(r.organization_name ?? "?")[0]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-surface-900 truncate">{r.organization_name}</p>
                      <span className="font-mono text-xs rounded-[3px] bg-surface-100 px-1.5 py-0.5 text-surface-700">{r.value}</span>
                    </div>
                    <p className="text-xs text-surface-500 mt-0.5">Submitted {ago(r.created_at)}{r.submitted_at && ` · sent to provider ${ago(r.submitted_at)}`}</p>
                  </div>
                  <div className="hidden sm:flex flex-col items-end gap-1 w-28 flex-shrink-0">
                    <span className={`text-[11px] font-medium ${have === total ? "text-success-dark" : "text-warning-dark"}`}>{have}/{total} documents</span>
                    <div className="h-1.5 w-full rounded-full bg-surface-100 overflow-hidden"><div className={`h-full rounded-full ${have === total ? "bg-success-base" : "bg-warning-base"}`} style={{ width: `${total ? (have / total) * 100 : 0}%` }} /></div>
                  </div>
                  <Badge variant={st.variant} size="sm" dot>{st.label}</Badge>
                  <ChevronRight size={16} className="text-surface-300 group-hover:text-surface-500 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <Review req={selected} onClose={() => setSelected(null)}
          onDone={(r) => { setSelected(null); setAll((p) => (p ?? []).map((x) => (x.id === r.id ? r : x))); window.dispatchEvent(new Event("verifications-changed")); onChanged?.(); }} />
      )}
    </div>
  );
}
