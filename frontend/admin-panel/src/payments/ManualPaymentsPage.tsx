import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Alert from "../components/Alert";
import AppLayout from "../components/AppLayout";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import Toggle from "../components/Toggle";
import { Link } from "react-router-dom";
import { decideManualPayment, getPaymentSettings, listManualPayments, openProof, savePaymentSettings, type ManualPaymentRow, type PaymentSettings } from "../lib/manualPayments";

const FILTERS = ["pending", "approved", "rejected"] as const;
const VARIANT = { pending: "warning", approved: "success", rejected: "danger" } as const;

const ACCOUNT_FIELDS: { key: keyof PaymentSettings["accounts"]; label: string; placeholder: string; area?: boolean }[] = [
  { key: "bkash", label: "bKash", placeholder: "01XXXXXXXXX (Personal) — use Send Money" },
  { key: "nagad", label: "Nagad", placeholder: "01XXXXXXXXX (Personal) — use Send Money" },
  { key: "rocket", label: "Rocket", placeholder: "01XXXXXXXXX-X (Personal)" },
  { key: "bank", label: "Bank transfer", placeholder: "Bank, account name, account number, branch", area: true },
  { key: "note", label: "Note shown to customers", placeholder: "e.g. Use your registered email as the payment reference.", area: true },
];

function PaymentMethods() {
  const [s, setS] = useState<PaymentSettings | null>(null);
  const [accounts, setAccounts] = useState<PaymentSettings["accounts"] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { getPaymentSettings().then((v) => { setS(v); setAccounts(v.accounts); }).catch(() => setMsg({ ok: false, text: "Could not load payment settings" })); }, []);
  if (!s || !accounts) return null;

  async function apply(body: Parameters<typeof savePaymentSettings>[0], okText?: string) {
    setMsg(null); setSaving(true);
    try { const v = await savePaymentSettings(body); setS(v); setAccounts(v.accounts); if (okText) setMsg({ ok: true, text: okText }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" }); }
    finally { setSaving(false); }
  }

  return (
    <Card className="mb-6">
      <h2 className="text-sm font-semibold text-surface-900">Payment methods at checkout</h2>
      <p className="mt-0.5 text-xs text-surface-500">Customers choose between these when they pick a plan. Turn either one on or off.</p>

      <div className="mt-4 divide-y divide-surface-100 rounded-lg border border-surface-200">
        <div className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-medium text-surface-900">Online payment (SSLCommerz)</p>
            <p className="text-xs text-surface-500">
              {s.online.configured ? "bKash, Nagad, Rocket, cards and banking. Plan starts immediately after payment."
                : <>Not configured yet. <Link to="/integrations/sslcommerz" className="font-medium text-brand-600">Add the SSLCommerz credentials</Link> — it switches on automatically once saved.</>}
            </p>
          </div>
          <Toggle value={s.online.enabled && s.online.configured} disabled={!s.online.configured || saving} onChange={(v) => apply({ online_enabled: v })} />
        </div>
        <div className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-medium text-surface-900">Manual payment (bKash / Nagad / Rocket / bank)</p>
            <p className="text-xs text-surface-500">{s.manual.available ? "Customers send money, upload proof, and you approve below." : "Add at least one account below to offer this."}</p>
          </div>
          <Toggle value={s.manual.enabled} disabled={saving} onChange={(v) => apply({ manual_enabled: v })} />
        </div>
      </div>

      <form className="mt-5 space-y-3" onSubmit={(e) => { e.preventDefault(); apply({ accounts }, "Accounts saved."); }}>
        <p className="text-sm font-medium text-surface-900">Accounts customers pay to</p>
        <div className="grid gap-3 md:grid-cols-2">
          {ACCOUNT_FIELDS.map((f) => (
            <label key={f.key} className={`block ${f.area ? "md:col-span-2" : ""}`}>
              <span className="mb-1 block text-xs font-medium text-surface-600">{f.label}</span>
              {f.area
                ? <textarea rows={2} value={accounts[f.key]} placeholder={f.placeholder} onChange={(e) => setAccounts({ ...accounts, [f.key]: e.target.value })} className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
                : <input value={accounts[f.key]} placeholder={f.placeholder} onChange={(e) => setAccounts({ ...accounts, [f.key]: e.target.value })} className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />}
            </label>
          ))}
        </div>
        <p className="text-xs text-surface-500">Leave a method empty to hide it from customers.</p>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" loading={saving}>Save accounts</Button>
          {msg && <span className={`text-sm ${msg.ok ? "text-success-dark" : "text-danger-dark"}`}>{msg.text}</span>}
        </div>
      </form>
    </Card>
  );
}

export default function ManualPaymentsPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending");
  const [rows, setRows] = useState<ManualPaymentRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    listManualPayments(filter).then(setRows).catch((err) => {
      if (err instanceof Error && err.message === "UNAUTHORIZED") { navigate("/login"); return; }
      setError("Failed to load payments");
    });
  }, [filter, navigate]);
  useEffect(load, [load]);

  async function decide(id: string, decision: "approve" | "reject") {
    setError(null); setBusy(id);
    try { await decideManualPayment(id, decision, notes[id] ?? ""); load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setBusy(null); }
  }

  return (
    <AppLayout>
      <PageHeader title="Payments" description="Choose how customers can pay, and review manual payments." />
      <PaymentMethods />
      <h2 className="mb-3 text-sm font-semibold text-surface-900">Manual payments to review</h2>
      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "primary" : "secondary"} onClick={() => setFilter(f)}>{f}</Button>
        ))}
      </div>
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      <div className="space-y-4">
        {rows.length === 0 && <p className="text-sm text-surface-500">No {filter} payments.</p>}
        {rows.map((p) => (
          <Card key={p.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-surface-900">{p.customer_email} — {p.plan_name}</p>
                <p className="text-sm text-surface-600">
                  {p.amount_bdt} BDT via {p.method} · from {p.sender_account} · TrxID <span className="font-mono">{p.trx_id}</span>
                </p>
                <p className="text-xs text-surface-400">{new Date(p.created_at).toLocaleString()}</p>
                {p.customer_note && <p className="mt-1 text-sm text-surface-600">Note: {p.customer_note}</p>}
                {p.admin_note && <p className="mt-1 text-sm text-surface-600">Staff note: {p.admin_note}</p>}
              </div>
              <Badge variant={VARIANT[p.status]}>{p.status}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.documents.map((d) => (
                <Button key={d.id} size="sm" variant="secondary" onClick={() => openProof(p.id, d).catch((e) => setError(e.message))}>
                  {d.filename}
                </Button>
              ))}
            </div>
            {p.status === "pending" && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-surface-200 px-3 py-2 text-sm"
                  placeholder="Note (required when rejecting)" value={notes[p.id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })}
                />
                <Button size="sm" loading={busy === p.id} onClick={() => decide(p.id, "approve")}>Approve</Button>
                <Button size="sm" variant="danger" loading={busy === p.id} onClick={() => decide(p.id, "reject")}>Reject</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </AppLayout>
  );
}
