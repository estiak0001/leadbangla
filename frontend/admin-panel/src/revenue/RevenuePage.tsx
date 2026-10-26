import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import Alert from "../components/Alert";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { listAdminPlans, type PlanFull } from "../lib/plans";
import { fetchRecentTransactions, fetchRevenueSummary, type RevenueSummary, type TransactionFeedItem } from "../lib/revenue";

const SERVICE_LABELS: Record<string, string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  email_overage: "Email Overage",
  seo_query: "SEO",
};

const TYPE_LABELS: Record<string, string> = {
  topup: "Wallet Top-up",
  deduction: "Deduction",
  admin_adjustment: "Admin Adjustment",
  refund: "Refund",
};

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-surface-400">{label}</p>
      <p className="text-2xl font-bold text-surface-900 mt-1">{value}</p>
    </Card>
  );
}

function Bar({ label, sub, pct, color }: { label: string; sub: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-sm">
        <span className="font-medium text-surface-700">{label}</span>
        <span className="text-surface-500">{sub}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}

export default function RevenuePage() {
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [plans, setPlans] = useState<PlanFull[]>([]);
  const [txns, setTxns] = useState<TransactionFeedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([fetchRevenueSummary(), listAdminPlans(), fetchRecentTransactions(50)])
      .then(([s, p, t]) => { setSummary(s); setPlans(p); setTxns(t); setLoading(false); })
      .catch((err) => {
        if (err instanceof Error && err.message === "UNAUTHORIZED") { navigate("/login"); return; }
        setError("Failed to load revenue data"); setLoading(false);
      });
  }, [navigate]);

  if (loading) return <AppLayout><div className="py-16 text-center text-surface-400 text-sm">Loading revenue…</div></AppLayout>;
  if (error || !summary) return <AppLayout><Alert className="max-w-lg">{error ?? "No data"}</Alert></AppLayout>;

  const maxTenants = Math.max(1, ...plans.map((p) => p.tenant_count));
  const consumptionEntries = Object.entries(summary.credit_consumption_bdt);
  const maxConsumption = Math.max(1, ...consumptionEntries.map(([, v]) => v));

  return (
    <AppLayout>
      <PageHeader title="Revenue" description="Subscription MRR, credit wallet economics, and recent activity." />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="MRR" value={`BDT ${summary.mrr_bdt.toLocaleString()}`} />
        <KpiCard label="Credit revenue this month" value={`BDT ${summary.credit_topup_revenue_bdt.toLocaleString()}`} />
        <KpiCard label="Total float held" value={`BDT ${summary.total_float_bdt.toLocaleString()}`} />
        <KpiCard label="Active subscriptions" value={summary.active_subscriptions.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <p className="section-label mb-4">Plan Distribution</p>
          <div className="space-y-4">
            {plans.map((p) => (
              <Bar
                key={p.id}
                label={p.name}
                sub={`${p.tenant_count} tenant${p.tenant_count === 1 ? "" : "s"} · BDT ${(p.tenant_count * p.price_bdt).toLocaleString()} MRR`}
                pct={(p.tenant_count / maxTenants) * 100}
                color="bg-brand-500"
              />
            ))}
            {plans.length === 0 && <p className="text-sm text-surface-400">No plans found.</p>}
          </div>
        </Card>

        <Card>
          <p className="section-label mb-4">Credit Consumption This Month</p>
          <div className="space-y-4">
            {consumptionEntries.map(([service, bdt]) => (
              <Bar
                key={service}
                label={SERVICE_LABELS[service] ?? service}
                sub={`BDT ${bdt.toFixed(2)}`}
                pct={(bdt / maxConsumption) * 100}
                color="bg-emerald-500"
              />
            ))}
            {consumptionEntries.length === 0 && <p className="text-sm text-surface-400">No credit consumption yet this month.</p>}
          </div>
        </Card>
      </div>

      <p className="section-label mb-3">Recent Transactions</p>

      {txns.length === 0 ? (
        <Card>
          <div className="py-12 text-center text-surface-400 text-sm">No transactions yet.</div>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card padding={false} className="hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-surface-200 bg-surface-50">
                  <tr>
                    {["Date", "Org", "Type", "Amount (BDT)", "Service"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-surface-400 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {txns.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-4 py-3 text-surface-500 whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 font-medium text-surface-800">{t.org_name}</td>
                      <td className="px-4 py-3 text-surface-600">{TYPE_LABELS[t.type] ?? t.type}</td>
                      <td className={`px-4 py-3 font-medium ${t.amount_bdt >= 0 ? "text-emerald-700" : "text-danger-dark"}`}>
                        {t.amount_bdt >= 0 ? "+" : ""}{t.amount_bdt.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-surface-500">{t.service ? (SERVICE_LABELS[t.service] ?? t.service) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="h-3" />
          </Card>

          {/* Mobile card list */}
          <div className="space-y-2 md:hidden">
            {txns.map((t) => (
              <Card key={t.id} className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-surface-800 truncate">{t.org_name}</p>
                    <p className="text-xs text-surface-500 mt-0.5">{TYPE_LABELS[t.type] ?? t.type} · {t.service ? (SERVICE_LABELS[t.service] ?? t.service) : "—"}</p>
                  </div>
                  <span className={`font-medium whitespace-nowrap ${t.amount_bdt >= 0 ? "text-emerald-700" : "text-danger-dark"}`}>
                    {t.amount_bdt >= 0 ? "+" : ""}{t.amount_bdt.toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-surface-400 mt-2">{new Date(t.created_at).toLocaleString()}</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </AppLayout>
  );
}
