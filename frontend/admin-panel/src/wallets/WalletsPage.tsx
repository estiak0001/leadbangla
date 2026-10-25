import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import PageHeader from "../components/PageHeader";
import { fetchRevenueSummary } from "../lib/revenue";
import {
  adjustWallet,
  listWalletTransactions,
  listWallets,
  type WalletAdmin,
  type WalletTransaction,
} from "../lib/wallets";

type Filter = "all" | "low";

function AdjustModal({
  wallet,
  onClose,
  onSaved,
}: {
  wallet: WalletAdmin;
  onClose: () => void;
  onSaved: (orgId: string, balanceAfterBdt: number) => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const parsed = Number(amount);
    if (!amount || Number.isNaN(parsed) || parsed === 0) {
      setError("Enter a non-zero amount (positive to add, negative to deduct).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { balance_after_bdt } = await adjustWallet(wallet.org_id, parsed, note);
      onSaved(wallet.org_id, balance_after_bdt);
    } catch {
      setError("Failed to adjust wallet");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
        <h3 className="font-bold text-lg text-surface-900 mb-1">Adjust wallet</h3>
        <p className="text-sm text-surface-500 mb-4">{wallet.org_name} — current balance {wallet.balance_bdt.toFixed(2)} BDT</p>

        {error && <Alert className="mb-4">{error}</Alert>}

        <div className="space-y-3">
          <Input
            label="Amount (BDT) — positive to add, negative to deduct"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 50 or -20"
          />
          <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for adjustment" />
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-6">
          <Button variant="primary" className="flex-1" loading={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Apply adjustment"}
          </Button>
          <Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function HistoryTable({ txns }: { txns: WalletTransaction[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs font-semibold uppercase tracking-wide text-surface-400">
          <th className="text-left py-1.5">Date</th>
          <th className="text-left py-1.5">Type</th>
          <th className="text-left py-1.5">Service</th>
          <th className="text-left py-1.5">Note</th>
          <th className="text-right py-1.5">Amount (BDT)</th>
          <th className="text-right py-1.5">Balance After</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-200">
        {txns.map((t) => (
          <tr key={t.id}>
            <td className="py-1.5 text-surface-600 whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
            <td className="py-1.5 text-surface-700 capitalize">{t.type.replace("_", " ")}</td>
            <td className="py-1.5 text-surface-500 capitalize">{t.service?.replace("_", " ") ?? "—"}</td>
            <td className="py-1.5 text-surface-500">{t.note ?? "—"}</td>
            <td className={`py-1.5 text-right font-medium ${t.amount_bdt >= 0 ? "text-emerald-700" : "text-danger-dark"}`}>
              {t.amount_bdt >= 0 ? "+" : ""}{t.amount_bdt.toFixed(2)}
            </td>
            <td className="py-1.5 text-right text-surface-600">{t.balance_after_bdt.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HistoryContent({ orgId }: { orgId: string }) {
  const [txns, setTxns] = useState<WalletTransaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listWalletTransactions(orgId)
      .then(setTxns)
      .catch(() => setError("Failed to load history"));
  }, [orgId]);

  if (error) return <p className="text-sm text-danger-dark">{error}</p>;
  if (!txns) return <p className="text-sm text-surface-400">Loading…</p>;
  if (txns.length === 0) return <p className="text-sm text-surface-400">No transactions yet.</p>;
  return (
    <div className="overflow-x-auto">
      <HistoryTable txns={txns} />
    </div>
  );
}

function HistoryRow({ orgId }: { orgId: string }) {
  return (
    <tr>
      <td colSpan={6} className="bg-surface-50 px-5 py-4">
        <HistoryContent orgId={orgId} />
      </td>
    </tr>
  );
}

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletAdmin[]>([]);
  const [activeSubs, setActiveSubs] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [adjusting, setAdjusting] = useState<WalletAdmin | null>(null);
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([listWallets(), fetchRevenueSummary()])
      .then(([w, r]) => { setWallets(w); setActiveSubs(r.active_subscriptions); setLoading(false); })
      .catch((err) => {
        if (err instanceof Error && err.message === "UNAUTHORIZED") { navigate("/login"); return; }
        setError("Failed to load wallets"); setLoading(false);
      });
  }, [navigate]);

  function handleAdjusted(orgId: string, balanceAfterBdt: number) {
    setWallets((prev) =>
      prev.map((w) =>
        w.org_id === orgId
          ? { ...w, balance_bdt: balanceAfterBdt, balance_paisa: Math.round(balanceAfterBdt * 100), is_low: balanceAfterBdt * 100 < w.low_balance_threshold_bdt * 100 }
          : w,
      ),
    );
    setAdjusting(null);
  }

  const totalFloat = wallets.reduce((sum, w) => sum + w.balance_bdt, 0);
  const lowCount = wallets.filter((w) => w.is_low).length;
  const visible = filter === "low" ? wallets.filter((w) => w.is_low) : wallets;

  if (loading) return <AppLayout><div className="py-16 text-center text-surface-400 text-sm">Loading wallets…</div></AppLayout>;

  return (
    <AppLayout>
      <PageHeader title="Wallets" description="Tenant credit balances and adjustments." />

      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-surface-400">Total float held</p>
          <p className="text-2xl font-bold text-surface-900 mt-1">BDT {totalFloat.toFixed(2)}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-surface-400">Low-balance tenants</p>
          <p className="text-2xl font-bold text-surface-900 mt-1">{lowCount}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-surface-400">Active subscriptions</p>
          <p className="text-2xl font-bold text-surface-900 mt-1">{activeSubs ?? "—"}</p>
        </Card>
      </div>

      <div className="flex gap-2 mb-4">
        {(["all", "low"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === f ? "bg-brand-500 text-white" : "bg-surface-100 text-surface-600 hover:bg-surface-200"
            }`}
          >
            {f === "all" ? "All" : "Low Balance"}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card>
          <div className="py-16 text-center text-surface-400 text-sm">No wallets to show.</div>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card padding={false} className="hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-surface-200 bg-surface-50">
                  <tr>
                    {["Org Name", "Balance (BDT)", "Threshold (BDT)", "Status", "Last Updated", "Actions"].map((h) => (
                      <th key={h} className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-surface-400 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {visible.map((w) => (
                    <Fragment key={w.org_id}>
                      <tr className="hover:bg-surface-50 transition-colors">
                        <td className="px-5 py-3.5 font-semibold text-surface-900">{w.org_name}</td>
                        <td className="px-5 py-3.5 text-surface-700">{w.balance_bdt.toFixed(2)}</td>
                        <td className="px-5 py-3.5 text-surface-500">{w.low_balance_threshold_bdt.toFixed(2)}</td>
                        <td className="px-5 py-3.5">
                          <Badge variant={w.is_low ? "danger" : "success"}>{w.is_low ? "Low" : "OK"}</Badge>
                        </td>
                        <td className="px-5 py-3.5 text-surface-500">{w.updated_at ? new Date(w.updated_at).toLocaleString() : "—"}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex gap-3 items-center">
                            <Button size="xs" variant="secondary" onClick={() => setAdjusting(w)}>Adjust</Button>
                            <button
                              onClick={() => setExpandedOrgId(expandedOrgId === w.org_id ? null : w.org_id)}
                              className="text-xs font-medium text-brand-600 hover:text-brand-700"
                            >
                              {expandedOrgId === w.org_id ? "Hide History" : "View History"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedOrgId === w.org_id && <HistoryRow orgId={w.org_id} />}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile card list */}
          <div className="space-y-3 md:hidden">
            {visible.map((w) => (
              <Card key={w.org_id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-surface-900 truncate">{w.org_name}</p>
                    <p className="text-sm text-surface-600 mt-0.5">BDT {w.balance_bdt.toFixed(2)} <span className="text-surface-400">/ threshold {w.low_balance_threshold_bdt.toFixed(2)}</span></p>
                  </div>
                  <Badge variant={w.is_low ? "danger" : "success"}>{w.is_low ? "Low" : "OK"}</Badge>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-100">
                  <Button size="xs" variant="secondary" onClick={() => setAdjusting(w)}>Adjust</Button>
                  <button
                    onClick={() => setExpandedOrgId(expandedOrgId === w.org_id ? null : w.org_id)}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    {expandedOrgId === w.org_id ? "Hide History" : "View History"}
                  </button>
                </div>
                {expandedOrgId === w.org_id && (
                  <div className="mt-3 pt-3 border-t border-surface-100">
                    <HistoryContent orgId={w.org_id} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {adjusting && (
        <AdjustModal wallet={adjusting} onClose={() => setAdjusting(null)} onSaved={handleAdjusted} />
      )}
    </AppLayout>
  );
}
