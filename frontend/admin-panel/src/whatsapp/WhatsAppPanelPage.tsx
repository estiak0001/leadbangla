import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, MessageCircle, Trash2, UserPlus } from "lucide-react";
import AppLayout from "../components/AppLayout";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { fetchTenants, type Tenant } from "../lib/admin";
import { assignWhatsAppNumber, checkOwnWaAccount, fetchWhatsAppHealth, runWhatsAppHealth, type WaHealth, fetchWaTemplateRequests, fetchWhatsAppNumbers, revokeWhatsAppNumber, type WhatsAppNumberRow } from "../lib/integrations";
import { IntegrationPanel } from "../integrations/IntegrationDetailPage";
import { VerificationQueue } from "../verifications/VerificationsPage";
import TemplateApprovals, { templatePendingCount } from "./TemplateApprovals";
import { listVerifications } from "../lib/verifications";

function WebhookHint() {
  const url = `${window.location.protocol}//${window.location.hostname}${window.location.port && window.location.port !== "5174" ? `:${window.location.port}` : ""}/api/v1/public/whatsapp/webhook`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-white border border-surface-200 rounded-[4px] px-3 py-2.5 mb-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium text-surface-800">Webhook callback URL</span>
      <code className="flex-1 min-w-0 truncate rounded-[3px] bg-surface-50 border border-surface-200 px-2 py-1 text-xs font-mono text-surface-700">{url}</code>
      <button type="button" onClick={() => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => undefined); }} className="text-xs font-medium text-brand-600 hover:underline">{copied ? "Copied" : "Copy"}</button>
      <span className="basis-full text-[11px] text-surface-500">Paste this into Meta (WhatsApp → Configuration) together with your verify token. It must be a public https address when you go live.</span>
    </div>
  );
}

/** Last scheduled check of the platform's Meta connection, with a button to run it now. */
function HealthBar() {
  const [h, setH] = useState<WaHealth | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { fetchWhatsAppHealth().then((r) => setH(r.platform)).catch(() => setH(null)); }, []);
  async function runNow() {
    setBusy(true); setNote(null);
    try {
      const r = await runWhatsAppHealth();
      setNote(r.platform ? null : "Nothing to check yet — save the credentials and switch the connection Live first.");
      const f = await fetchWhatsAppHealth(); setH(f.platform);
    } catch { setNote("Could not run the check."); } finally { setBusy(false); }
  }
  const bad = h && !h.ok;
  return (
    <div className={`border rounded-[4px] px-3 py-2.5 mb-3 flex flex-wrap items-center gap-2 text-sm ${bad ? "bg-danger-light border-danger-base/30" : "bg-white border-surface-200"}`}>
      <span className="font-medium text-surface-800">Connection health</span>
      {h === undefined ? <span className="text-surface-400 text-xs">Loading…</span> : h === null ? (
        <span className="text-xs text-surface-500">Not checked yet. Checks run automatically every 6 hours once the connection is Live.</span>
      ) : (
        <span className={`text-xs ${bad ? "text-danger-dark" : "text-surface-700"}`}>{h.ok ? "✓" : "✗"} {h.message} <span className="text-surface-400">· checked {new Date(h.checked_at).toLocaleString()}</span></span>
      )}
      {note && <span className="text-xs text-surface-500">{note}</span>}
      <button type="button" onClick={runNow} disabled={busy} className="ml-auto text-xs font-medium text-brand-600 hover:underline disabled:opacity-50">{busy ? "Checking…" : "Check now"}</button>
      <span className="basis-full text-[11px] text-surface-500">When the token breaks or the quality rating turns red, an email goes to the platform alert address (and to the customer for their own account).</span>
    </div>
  );
}

/** The WhatsApp panel: connection to the BSP + customers' business numbers. Separate from SMS. */
export default function WhatsAppPanelPage() {
  const [params, setParams] = useSearchParams();
  const t = params.get("tab");
  const tab = t === "numbers" || t === "requests" || t === "templates" ? t : "connection";
  const [waiting, setWaiting] = useState(0);
  const [tplWaiting, setTplWaiting] = useState(0);
  const [rows, setRows] = useState<WhatsAppNumberRow[] | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [orgId, setOrgId] = useState("");
  const [number, setNumber] = useState("");
  const [pid, setPid] = useState("");
  const [shared, setShared] = useState<boolean | null>(null);   // null = not chosen yet — the admin must decide
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  

  const load = () => { fetchWhatsAppNumbers().then(setRows).catch(() => setError("Failed to load numbers")); listVerifications("pending", "whatsapp_number").then((r) => setWaiting(r.length)).catch(() => undefined); fetchWaTemplateRequests().then((r) => setTplWaiting(templatePendingCount(r))).catch(() => undefined); };
  useEffect(() => { load(); fetchTenants().then(setTenants).catch(() => undefined); }, []);

  async function assign(e: FormEvent) {
    e.preventDefault(); setBusy("assign"); setError(null);
    try { await assignWhatsAppNumber(orgId, number.trim(), shared ? undefined : pid.trim(), !!shared); setOrgId(""); setNumber(""); setPid(""); setShared(null); load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed"); } finally { setBusy(null); }
  }
  const [checks, setChecks] = useState<Record<string, { ok: boolean; message: string }>>({});
  async function check(r: WhatsAppNumberRow) {
    setBusy(r.org_id);
    try { const res = await checkOwnWaAccount(r.org_id); setChecks((c) => ({ ...c, [r.org_id]: res })); if (res.ok) load(); } catch (err) { setError(err instanceof Error ? err.message : "Failed"); } finally { setBusy(null); }
  }
  async function revoke(r: WhatsAppNumberRow) {
    if (!window.confirm(`Remove ${r.number} from ${r.org_name}? They can't send WhatsApp until a number is approved again.`)) return;
    setBusy(r.org_id);
    try { await revokeWhatsAppNumber(r.org_id); load(); } catch (err) { setError(err instanceof Error ? err.message : "Failed"); } finally { setBusy(null); }
  }

  return (
    <AppLayout>
      <Link to="/integrations" className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-brand-600 font-medium mb-2"><ArrowLeft size={14} /> Integrations</Link>
      <div className="flex items-center gap-3 mb-4">
        <span className="w-10 h-10 rounded-[4px] flex items-center justify-center bg-emerald-50 text-emerald-700"><MessageCircle size={20} /></span>
        <div><h1 className="text-xl font-bold text-surface-900 tracking-tight">WhatsApp</h1><p className="text-sm text-surface-500">Connect your WhatsApp provider and approve customers' business numbers.</p></div>
      </div>

      <div className="flex gap-1 border-b border-surface-200 mb-4">
        {([["connection", "Connection", "Connection"], ["requests", "Number approvals", "Numbers"], ["templates", "Template approvals", "Templates"], ["numbers", "Business numbers", "Customers"]] as const).map(([k, label, short]) => (
          <button key={k} onClick={() => setParams(k === "connection" ? {} : { tab: k })}
            className={`flex items-center gap-1.5 px-2 sm:px-3.5 py-2.5 text-[13px] sm:text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-brand-500 text-brand-700" : "border-transparent text-surface-500 hover:text-surface-800"}`}>
            <span className="hidden sm:inline">{label}</span><span className="sm:hidden">{short}</span>{((k === "requests" && waiting > 0) || (k === "templates" && tplWaiting > 0)) && <span className="rounded-full bg-warning-base px-1.5 py-0.5 text-[10px] font-bold text-white">{k === "requests" ? waiting : tplWaiting}</span>}
            </button>
        ))}
      </div>

      {error && <Alert className="mb-3" onDismiss={() => setError(null)}>{error}</Alert>}

      {tab === "connection" ? <><HealthBar /><WebhookHint /><IntegrationPanel code="meta_whatsapp" embedded /></> : tab === "requests" ? <VerificationQueue kind="whatsapp_number" onChanged={load} /> : tab === "templates" ? <TemplateApprovals onChanged={() => fetchWaTemplateRequests().then((r) => setTplWaiting(templatePendingCount(r))).catch(() => undefined)} /> : (
        <div className="space-y-4">
          <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 items-start">
            <div className="bg-white border border-surface-200 rounded-[4px] overflow-hidden">
              <h2 className="px-4 py-2.5 border-b border-surface-100 text-sm font-semibold text-surface-800">Customers with a WhatsApp number{rows && <span className="ml-1.5 text-xs font-normal text-surface-400">{rows.length}</span>}</h2>
              {!rows ? <p className="py-6 text-center text-sm text-surface-400">Loading…</p> : rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-surface-500">No customer has set up WhatsApp yet.</p>
              ) : (
                <div className="divide-y divide-surface-100">
                  {rows.map((r) => (
                    <div key={r.org_id} className="px-4 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0"><p className="text-sm font-semibold text-surface-900 truncate">{r.org_name}</p><p className="font-mono text-xs text-surface-600">{r.number}{r.own_account && <span className="ml-2 font-sans rounded-[3px] bg-info-light text-info-dark px-1.5 py-0.5 text-[10px] font-semibold">Own Meta account</span>}</p>
                        {r.own_account && <p className="text-[11px] text-surface-500 mt-0.5">{r.verified_name || "Unnamed business"} · quality <span className={r.quality === "RED" ? "text-danger-dark font-semibold" : r.quality === "YELLOW" ? "text-warning-dark font-semibold" : ""}>{r.quality?.toLowerCase() || "unknown"}</span>{!r.has_waba && " · no WABA ID (templates unavailable)"}{checks[r.org_id] && <span className={checks[r.org_id].ok ? " text-success-dark" : " text-danger-dark"}> · {checks[r.org_id].message}</span>}</p>}</div>
                      <div className="flex items-center gap-2">
                        <Badge variant={r.approved ? "success" : "warning"} size="sm" dot>{r.approved ? "Active" : "Waiting for approval"}</Badge>
                        {r.approved && r.source && <span title={r.source === "shared" ? "Messages go out from the shared platform number" : r.source === "dedicated" ? "Messages go out from this customer's own registered number" : "Customer's own Meta account"} className={`rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold ${r.source === "shared" ? "bg-warning-light text-warning-dark" : "bg-info-light text-info-dark"}`}>{r.source === "shared" ? "Shared number" : r.source === "dedicated" ? "Dedicated number" : "Own account"}</span>}
                        {r.health && <span title={`${r.health.message ?? ""} — checked ${new Date(r.health.checked_at).toLocaleString()}`} className={`rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold ${!r.health.ok ? "bg-danger-light text-danger-dark" : r.health.quality === "YELLOW" ? "bg-warning-light text-warning-dark" : "bg-success-light text-success-dark"}`}>{!r.health.ok ? "Problem" : r.health.quality === "YELLOW" ? "Quality: yellow" : "Healthy"}</span>}
                        {r.own_account && <button onClick={() => check(r)} disabled={busy === r.org_id} className="text-xs font-medium text-brand-600 hover:underline">Check</button>}
                        <button onClick={() => revoke(r)} disabled={busy === r.org_id} aria-label="Remove" className="p-1.5 rounded-[3px] text-surface-400 hover:bg-danger-light hover:text-danger-base"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-surface-200 rounded-[4px] p-4">
              <h2 className="text-sm font-semibold text-surface-800 flex items-center gap-2"><UserPlus size={15} /> Set up a number directly</h2>
              <p className="text-xs text-surface-500 mb-3">For a number you already registered with the provider. It becomes active straight away.</p>
              <form onSubmit={assign} className="space-y-2.5">
                <div>
                  <label className="block text-xs font-semibold text-surface-600 mb-1">Customer</label>
                  <select value={orgId} onChange={(e) => setOrgId(e.target.value)} required className="w-full rounded-[3px] border border-surface-200 bg-white px-2.5 py-1.5 text-base sm:text-sm focus:border-brand-500 focus:outline-none">
                    <option value="">Choose a customer…</option>
                    {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-600 mb-1">WhatsApp number</label>
                  <input value={number} onChange={(e) => setNumber(e.target.value)} required placeholder="01XXXXXXXXX" className="w-full rounded-[3px] border border-surface-200 px-2.5 py-1.5 text-base sm:text-sm font-mono focus:border-brand-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-600 mb-1">Which number do their messages come from?</label>
                  <div className="space-y-1.5">
                    <label className={`flex items-start gap-2 rounded-[3px] border px-2.5 py-2 text-xs cursor-pointer ${shared === false ? "border-brand-500 bg-brand-50/40" : "border-surface-200"}`}>
                      <input type="radio" name="wa-source" checked={shared === false} onChange={() => setShared(false)} className="mt-0.5" />
                      <span><b className="text-surface-800">Their own dedicated number</b><br /><span className="text-surface-500">Already registered in your Meta account. Enter its Meta phone number ID.</span></span>
                    </label>
                    {shared === false && <input value={pid} onChange={(e) => setPid(e.target.value)} required inputMode="numeric" placeholder="Meta phone number ID (digits)" className="w-full rounded-[3px] border border-surface-200 px-2.5 py-1.5 text-base sm:text-sm font-mono focus:border-brand-500 focus:outline-none" />}
                    <label className={`flex items-start gap-2 rounded-[3px] border px-2.5 py-2 text-xs cursor-pointer ${shared === true ? "border-brand-500 bg-brand-50/40" : "border-surface-200"}`}>
                      <input type="radio" name="wa-source" checked={shared === true} onChange={() => setShared(true)} className="mt-0.5" />
                      <span><b className="text-surface-800">The shared platform number</b><br /><span className="text-surface-500">Their messages are sent from your platform number. The number above is only recorded, not used to send.</span></span>
                    </label>
                  </div>
                </div>
                <Button type="submit" size="sm" loading={busy === "assign"} disabled={!orgId || !number.trim() || shared === null || (shared === false && !pid.trim())}>Assign &amp; activate</Button>
              </form>
            </div>
          </section>
                  </div>
      )}
    </AppLayout>
  );
}
