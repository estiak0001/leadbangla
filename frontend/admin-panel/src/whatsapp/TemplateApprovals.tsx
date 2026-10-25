import { useEffect, useMemo, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { decideWaTemplate, fetchWaTemplateRequests, syncWaTemplate, type WaTemplateRequestAdmin, type WaTplStatus } from "../lib/integrations";

const VARIANT: Record<WaTplStatus, "warning" | "info" | "success" | "danger" | "default"> = { pending: "warning", with_meta: "info", approved: "success", rejected: "danger", meta_rejected: "danger", cancelled: "default" };
const FILTERS: [string, string, WaTplStatus[]][] = [
  ["pending", "Needs review", ["pending"]], ["with_meta", "With Meta", ["with_meta"]], ["approved", "Approved", ["approved"]],
  ["rejected", "Rejected", ["rejected", "meta_rejected", "cancelled"]],
];
const ago = (ts: string) => { const m = Math.max(1, Math.round((Date.now() - new Date(ts).getTime()) / 60000)); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export function templatePendingCount(rows: WaTemplateRequestAdmin[]) { return rows.filter((r) => r.status === "pending").length; }

export default function TemplateApprovals({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<WaTemplateRequestAdmin[] | null>(null);
  const [filter, setFilter] = useState("pending");
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => fetchWaTemplateRequests().then((r) => { setRows(r); onChanged?.(); }).catch((e) => setError(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const shown = useMemo(() => (rows ?? []).filter((r) => FILTERS.find((f) => f[0] === filter)![2].includes(r.status)), [rows, filter]);
  const count = (statuses: WaTplStatus[]) => (rows ?? []).filter((r) => statuses.includes(r.status)).length;

  async function act(r: WaTemplateRequestAdmin, kind: "approve" | "reject" | "sync") {
    setBusy(`${kind}${r.id}`); setError(null);
    try {
      const upd = kind === "sync" ? await syncWaTemplate(r.id) : await decideWaTemplate(r.id, kind, note);
      setRows((p) => (p ?? []).map((x) => (x.id === upd.id ? { ...upd, organization_name: x.organization_name } : x))); setNote(""); setOpenId(null); onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }

  return (
    <div>
      {error && <Alert className="mb-3" onDismiss={() => setError(null)}>{error}</Alert>}
      <div className="bg-white border border-surface-200 rounded-[4px] p-2.5 mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(([k, l, st]) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-2.5 py-1 text-xs font-medium border rounded-[3px] ${filter === k ? "bg-brand-500 text-white border-brand-500" : "bg-white text-surface-600 border-surface-200 hover:bg-surface-50"}`}>
            {l} <span className={filter === k ? "text-white/80" : k === "pending" && count(st) ? "font-bold text-warning-dark" : "text-surface-400"}>{rows ? count(st) : "–"}</span>
          </button>
        ))}
        <span className="ml-auto text-[11px] text-surface-500 self-center hidden sm:block">Approving sends the template to Meta. Meta’s own review then decides.</span>
      </div>

      <div className="bg-white border border-surface-200 rounded-[4px] overflow-hidden">
        {!rows ? <p className="py-10 text-center text-sm text-surface-400">Loading…</p> : shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-surface-500">{filter === "pending" ? "You’re all caught up. New template requests will show up here." : "Nothing here."}</p>
        ) : (
          <ul className="divide-y divide-surface-100">
            {shown.map((r) => {
              const open = openId === r.id;
              return (
                <li key={r.id}>
                  <button onClick={() => { setOpenId(open ? null : r.id); setNote(""); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-surface-50">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-surface-900 truncate">{r.label} <span className="font-normal text-surface-500">· {r.organization_name}</span></p>
                      <p className="text-xs text-surface-500 truncate">{r.body}</p>
                    </div>
                    <span className="hidden sm:block text-[11px] text-surface-500">{r.language} · {r.category}</span>
                    <span className="hidden md:block text-[11px] text-surface-400 w-20 text-right">{ago(r.created_at)}</span>
                    <Badge variant={VARIANT[r.status]} size="sm" dot>{r.status_label}</Badge>
                    <ChevronDown size={15} className={`text-surface-300 transition ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <div className="px-4 pb-4 pt-1 bg-surface-50/60 space-y-3">
                      <div className="rounded-[3px] bg-white border border-surface-200 px-3 py-2 text-sm whitespace-pre-wrap">{r.body}</div>
                      <div className="text-xs text-surface-600 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                        <p><b>Name sent to Meta:</b> <span className="font-mono">{r.meta_name}</span></p>
                        <p><b>Examples:</b> {r.examples.length ? r.examples.map((e, i) => `{{${i + 1}}} = ${e}`).join(" · ") : "none"}</p>
                        {r.admin_note && <p className="sm:col-span-2"><b>Your note:</b> {r.admin_note} <span className="text-surface-400">({r.reviewed_by})</span></p>}
                        {r.meta_reason && <p className="sm:col-span-2 text-danger-dark"><b>Meta says:</b> {r.meta_reason.replace(/_/g, " ").toLowerCase()}</p>}
                      </div>
                      {r.status === "pending" && (
                        <>
                          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note to the customer (required to reject)" className="w-full rounded-[3px] border border-surface-200 bg-white px-3 py-2 text-base sm:text-sm focus:border-brand-500 focus:outline-none" />
                          <div className="flex gap-2 justify-end flex-wrap">
                            <Button size="sm" variant="danger" loading={busy === `reject${r.id}`} disabled={!!busy || !note.trim()} onClick={() => act(r, "reject")}>Reject</Button>
                            <Button size="sm" variant="success" loading={busy === `approve${r.id}`} disabled={!!busy} onClick={() => act(r, "approve")}>Approve &amp; send to Meta</Button>
                          </div>
                        </>
                      )}
                      {r.status === "with_meta" && (
                        <div className="flex justify-end"><Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} loading={busy === `sync${r.id}`} disabled={!!busy} onClick={() => act(r, "sync")}>Check Meta status</Button></div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
