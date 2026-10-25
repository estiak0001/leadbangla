import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Alert from "../components/Alert";
import AppLayout from "../components/AppLayout";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { decideManualPayment, listManualPayments, openProof, type ManualPaymentRow } from "../lib/manualPayments";

const FILTERS = ["pending", "approved", "rejected"] as const;
const VARIANT = { pending: "warning", approved: "success", rejected: "danger" } as const;

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
      <PageHeader title="Manual payments" description="bKash / Nagad / Rocket / bank payments submitted by customers. Approving activates their plan." />
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
