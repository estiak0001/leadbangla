import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Check, History, Repeat, X } from "lucide-react";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Card from "../components/Card";
import {
  cancelTenantSubscription, changeTenantPlan, fetchTenantSubscription, type TenantPlan, type TenantSubscription, type TenantUsage,
} from "../lib/admin";
import { listAdminPlans, type PlanFull } from "../lib/plans";

const lim = (n: number) => (n < 0 ? "Unlimited" : n.toLocaleString());
const fmt = (ts: string) => new Date(ts).toLocaleString("en-BD", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** [label, usage key, plan limit key] — the things a plan caps. */
const METERS: { label: string; use: keyof TenantUsage; limit: keyof TenantPlan }[] = [
  { label: "Contacts", use: "contacts", limit: "contacts_limit" },
  { label: "Emails this month", use: "emails_monthly", limit: "emails_monthly_limit" },
  { label: "SMS this month", use: "sms_monthly", limit: "sms_monthly_limit" },
  { label: "WhatsApp this month", use: "whatsapp_monthly", limit: "whatsapp_monthly_limit" },
  { label: "Workflows", use: "workflows", limit: "workflows_limit" },
  { label: "Landing pages", use: "landing_pages", limit: "landing_pages_limit" },
  { label: "Team members", use: "team_members", limit: "team_members_limit" },
  { label: "Social accounts", use: "social_accounts", limit: "social_accounts_limit" },
];

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit < 0 ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  const over = limit >= 0 && used > limit;
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="text-surface-600">{label}</span><span className={`tabular-nums ${over ? "text-danger-dark font-semibold" : "text-surface-800"}`}>{used.toLocaleString()} / {lim(limit)}</span></div>
      <div className="mt-1 h-1.5 rounded-full bg-surface-100 overflow-hidden"><div className={`h-full rounded-full ${over ? "bg-danger-base" : pct >= 80 ? "bg-warning-base" : "bg-brand-500"}`} style={{ width: `${limit < 0 ? 8 : pct}%` }} /></div>
    </div>
  );
}

export default function TenantPlanCard({ orgId, onChanged }: { orgId: string; onChanged?: () => void }) {
  const [sub, setSub] = useState<TenantSubscription | null>(null);
  const [plans, setPlans] = useState<PlanFull[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [choice, setChoice] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetchTenantSubscription(orgId).then(setSub).catch((e) => setError(e instanceof Error ? e.message : "Failed to load plan"));
    listAdminPlans().then((p) => setPlans(p.filter((x) => x.is_active))).catch(() => undefined);
  }, [orgId]);

  if (!sub) return <Card className="mb-6 text-sm text-surface-400">{error ?? "Loading plan…"}</Card>;

  const cur = sub.plan;
  const target = plans.find((p) => p.id === choice);
  const direction = !target || !cur ? null : target.price_bdt > cur.price_bdt ? "up" : "down";
  const overLimit = target
    ? METERS.filter((m) => { const l = target[m.limit as keyof PlanFull] as number; return l >= 0 && sub.usage[m.use] > l; })
    : [];

  async function apply(kind: "change" | "cancel") {
    setBusy(true); setError(null);
    try {
      setSub(kind === "change" ? await changeTenantPlan(orgId, choice, note) : await cancelTenantSubscription(orgId, note));
      setPicking(false); setCancelling(false); setNote(""); setChoice("");
      onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  const features = (p: PlanFull | TenantPlan) => [
    `${lim(p.contacts_limit)} contacts`, `${lim(p.emails_monthly_limit)} emails/mo`,
    p.sms_enabled ? `${lim(p.sms_monthly_limit)} SMS/mo` : "No SMS",
    p.masking_allowed ? "Masking Sender ID" : null, p.whatsapp_enabled ? "WhatsApp" : null,
    p.custom_domain ? "Custom domain" : null, p.priority_support ? "Priority support" : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <Card className="mb-6 !p-0 overflow-hidden">
        <div className="p-4 sm:p-5 flex items-start justify-between gap-4 flex-wrap border-b border-surface-100">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-surface-500">Plan &amp; subscription</p>
            {cur ? (
              <>
                <div className="mt-1 flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-2xl font-bold text-surface-900">{cur.name}</h2>
                  <Badge variant="success" dot>Active</Badge>
                  <span className="text-sm text-surface-600">৳{cur.price_bdt.toLocaleString()} / {cur.billing_interval === "monthly" ? "month" : cur.billing_interval}</span>
                </div>
                <p className="mt-1 text-xs text-surface-500">
                  {sub.source === "admin" ? "Set by staff" : "Paid by the customer"}{sub.since && ` · since ${fmt(sub.since)}`}{sub.note && ` · “${sub.note}”`}
                </p>
              </>
            ) : (
              <div className="mt-1"><h2 className="text-xl font-bold text-surface-900">No active plan</h2><p className="text-xs text-surface-500">This tenant has no plan, so plan features such as SMS are off. Choose one to restore access.</p></div>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" icon={<Repeat size={14} />} onClick={() => { setChoice(""); setNote(""); setPicking(true); }}>{cur ? "Change plan" : "Set a plan"}</Button>
            {cur && <Button size="sm" variant="ghost" className="text-danger-base hover:bg-danger-light" onClick={() => { setNote(""); setCancelling(true); }}>Cancel plan</Button>}
          </div>
        </div>

        {error && <div className="px-5 pt-3"><Alert onDismiss={() => setError(null)}>{error}</Alert></div>}

        {cur && (
          <div className="p-4 sm:p-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            {METERS.map((m) => <Meter key={m.label} label={m.label} used={sub.usage[m.use]} limit={cur[m.limit] as number} />)}
          </div>
        )}

        <button onClick={() => setShowHistory((v) => !v)} className="w-full flex items-center justify-between px-5 py-2.5 text-xs font-medium text-surface-600 hover:bg-surface-50 border-t border-surface-100">
          <span className="inline-flex items-center gap-1.5"><History size={13} /> Plan history ({sub.history.length})</span><span>{showHistory ? "Hide" : "Show"}</span>
        </button>
        {showHistory && (
          <div className="divide-y divide-surface-100 border-t border-surface-100 max-h-72 overflow-y-auto">
            {sub.history.map((h) => (
              <div key={h.id} className="px-5 py-2.5 text-sm flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-surface-900">{h.plan_name} <span className="font-normal text-surface-400">· ৳{h.price_bdt.toLocaleString()}</span></p>
                  <p className="text-xs text-surface-500">{fmt(h.created_at)} · {h.source === "admin" ? `set by ${h.changed_by ?? "staff"}` : "paid by customer"}{h.note && ` · ${h.note}`}</p>
                </div>
                <Badge variant={h.status === "active" ? "success" : "default"} size="sm">{h.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {picking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4" onClick={() => !busy && setPicking(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-100">
              <div><h2 className="font-semibold text-surface-900">{cur ? "Change plan" : "Set a plan"}</h2><p className="text-xs text-surface-500">Takes effect immediately. No payment is taken.</p></div>
              <button onClick={() => setPicking(false)} className="p-1 rounded text-surface-400 hover:bg-surface-100" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4">
              <div className="grid sm:grid-cols-3 gap-3">
                {plans.map((p) => {
                  const isCur = cur?.id === p.id;
                  const selected = choice === p.id;
                  const dir = cur ? (p.price_bdt > cur.price_bdt ? "up" : p.price_bdt < cur.price_bdt ? "down" : null) : null;
                  return (
                    <button key={p.id} disabled={isCur} onClick={() => setChoice(p.id)}
                      className={`text-left rounded-xl border p-3.5 transition ${isCur ? "bg-surface-50 border-surface-200 opacity-70 cursor-default" : selected ? "border-brand-500 ring-2 ring-brand-500/20 bg-brand-50/30" : "border-surface-200 hover:border-brand-300"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-surface-900">{p.name}</span>
                        {isCur ? <Badge size="sm">Current</Badge> : selected ? <Check size={16} className="text-brand-600" /> : dir === "up" ? <ArrowUpRight size={15} className="text-success-dark" /> : dir === "down" ? <ArrowDownRight size={15} className="text-warning-dark" /> : null}
                      </div>
                      <p className="text-lg font-bold text-surface-900 mt-0.5">৳{p.price_bdt.toLocaleString()}<span className="text-xs font-normal text-surface-500"> /mo</span></p>
                      <ul className="mt-2 space-y-0.5 text-xs text-surface-600">{features(p).map((f) => <li key={f} className="flex gap-1.5"><Check size={12} className="mt-0.5 text-success-base flex-shrink-0" />{f}</li>)}</ul>
                    </button>
                  );
                })}
              </div>

              {target && direction === "down" && overLimit.length > 0 && (
                <div className="rounded-lg border border-warning-base/40 bg-warning-light p-3 text-sm">
                  <p className="font-semibold text-warning-dark flex items-center gap-1.5"><AlertTriangle size={15} /> Downgrading puts this tenant over some limits</p>
                  <ul className="mt-1 text-xs text-surface-700 list-disc pl-5">
                    {overLimit.map((m) => <li key={m.label}>{m.label}: using {sub.usage[m.use].toLocaleString()}, {target.name} allows {lim(target[m.limit as keyof PlanFull] as number)}</li>)}
                  </ul>
                  <p className="mt-1 text-xs text-surface-600">Nothing is deleted, but they can't add more until they're under the limit.</p>
                </div>
              )}
              {target && !target.masking_allowed && cur?.masking_allowed && <p className="text-xs text-warning-dark">This plan has no masking Sender ID, so their own Sender ID stops being used and they send from the shared sender.</p>}

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Note <span className="font-normal text-surface-400">(optional, saved in the history)</span></label>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Paid by bKash outside the app, promo, goodwill upgrade" className="w-full rounded-md border border-surface-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-surface-100">
              <Button size="sm" variant="ghost" onClick={() => setPicking(false)} disabled={busy}>Cancel</Button>
              <Button size="sm" loading={busy} disabled={!choice} onClick={() => apply("change")}>
                {target ? `${direction === "up" ? "Upgrade" : direction === "down" ? "Downgrade" : "Set"} to ${target.name}` : "Choose a plan"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {cancelling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4" onClick={() => !busy && setCancelling(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3.5">
              <span className="w-10 h-10 rounded-full flex items-center justify-center bg-danger-light text-danger-base flex-shrink-0"><AlertTriangle size={18} /></span>
              <div><h2 className="font-semibold text-surface-900">Cancel this tenant's plan?</h2><p className="mt-1.5 text-sm text-surface-600">They keep their data but lose plan features (including SMS) until you set a plan again.</p></div>
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Reason (optional)" className="mt-3 w-full rounded-md border border-surface-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
            <div className="mt-4 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setCancelling(false)} disabled={busy}>Keep plan</Button><Button size="sm" variant="danger" loading={busy} onClick={() => apply("cancel")}>Cancel plan</Button></div>
          </div>
        </div>
      )}
    </>
  );
}
