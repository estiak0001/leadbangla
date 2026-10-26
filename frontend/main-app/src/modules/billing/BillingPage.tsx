import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CreditCard, TriangleAlert } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Badge from "../../components/Badge";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Input from "../../components/Input";
import PageHeader from "../../components/PageHeader";
import Spinner from "../../components/Spinner";
import EmptyState from "../../components/EmptyState";
import Alert from "../../components/Alert";
import {
  cancelMySubscription,
  fetchCreditRates,
  fetchMySubscription,
  fetchPlanUsage,
  fetchTransactions,
  fetchWalletBalance,
  initiateTopup,
  type CreditRate,
  type PlanUsage,
  type Subscription,
  type WalletBalance,
  type WalletTxn,
} from "../../lib/billing";

import UsageReportTab from "./UsageReportTab";
import { UsageMeter } from "../../components/UsageMeter";

type Tab = "plan" | "wallet" | "usage" | "history" | "invoices";

const TABS: { key: Tab; label: string }[] = [
  { key: "plan", label: "My Plan" },
  { key: "wallet", label: "Credit Wallet" },
  { key: "usage", label: "Usage Report" },
  { key: "history", label: "Transaction History" },
  { key: "invoices", label: "Invoices" },
];

function MyPlanTab() {
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    Promise.all([fetchPlanUsage(), fetchMySubscription()])
      .then(([u, s]) => { setUsage(u); setSubscription(s); setLoading(false); })
      .catch(() => { setError("Failed to load plan usage."); setLoading(false); });
  }, []);

  async function handleCancel() {
    setCancelling(true);
    try {
      const sub = await cancelMySubscription();
      setSubscription(sub);
      setConfirmingCancel(false);
    } catch {
      setError("Failed to cancel subscription.");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <div className="py-16 flex justify-center"><Spinner size="lg" /></div>;
  if (error || !usage) return <Alert variant="error">{error ?? "No usage data."}</Alert>;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-surface-900">{usage.plan_name}</h2>
            <p className="text-sm text-surface-500 mt-0.5">{usage.plan_price_bdt.toLocaleString()} BDT/month</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/pick-plan"><Button size="sm">Upgrade Plan</Button></Link>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
          <UsageMeter label="Contacts" used={usage.contacts.used} limit={usage.contacts.limit} />
          <UsageMeter label="Emails this month" used={usage.emails_monthly.used} limit={usage.emails_monthly.limit} resets={usage.period_resets_on} />
          {usage.sms_enabled !== false && usage.sms && <UsageMeter label="SMS this month" used={usage.sms.used} limit={usage.sms.limit} resets={usage.period_resets_on} />}
          {usage.whatsapp_enabled && usage.whatsapp && <UsageMeter label="WhatsApp this month" used={usage.whatsapp.used} limit={usage.whatsapp.limit} resets={usage.period_resets_on} />}
          <UsageMeter label="Workflows" used={usage.workflows.used} limit={usage.workflows.limit} />
          <UsageMeter label="Landing pages" used={usage.landing_pages.used} limit={usage.landing_pages.limit} />
          {usage.social_accounts && <UsageMeter label="Social accounts" used={usage.social_accounts.used} limit={usage.social_accounts.limit} />}
          <UsageMeter label="Team members" used={usage.team_members.used} limit={usage.team_members.limit} />
          <UsageMeter label="SEO checks this month" used={usage.seo_credits.used} limit={usage.seo_credits.limit} resets={usage.period_resets_on} />
        </div>

        <div className="flex flex-wrap gap-2 mt-6 pt-6 border-t border-surface-100">
          <Badge variant={usage.custom_domain ? "success" : "default"}>
            Custom Domain: {usage.custom_domain ? "✓ Included" : "✗ Not included"}
          </Badge>
          <Badge variant={usage.priority_support ? "success" : "default"}>
            Priority Support: {usage.priority_support ? "✓ Included" : "✗ Not included"}
          </Badge>
        </div>
      </Card>

      {subscription?.status === "active" && (
        <Card className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm font-medium text-surface-800">Cancel your subscription</p>
            <p className="text-xs text-surface-500 mt-0.5">You'll lose access to plan features at the end of the billing period.</p>
          </div>
          {confirmingCancel ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-surface-600">Are you sure?</span>
              <Button size="sm" variant="danger" loading={cancelling} onClick={handleCancel}>Yes, cancel</Button>
              <Button size="sm" variant="ghost" disabled={cancelling} onClick={() => setConfirmingCancel(false)}>Never mind</Button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingCancel(true)}
              className="text-sm font-medium text-danger-base hover:text-danger-dark transition-colors"
            >
              Cancel Subscription
            </button>
          )}
        </Card>
      )}
    </div>
  );
}

const TOPUP_PRESETS = [100, 250, 500, 1000];

function CreditWalletTab() {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [rates, setRates] = useState<CreditRate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [customAmount, setCustomAmount] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    Promise.all([fetchWalletBalance(), fetchCreditRates()])
      .then(([b, r]) => { setBalance(b); setRates(r); setLoading(false); })
      .catch(() => { setError("Failed to load wallet."); setLoading(false); });
  }
  useEffect(load, []);

  async function handleTopup(amountBdt: number) {
    if (amountBdt < 100) { setError("Minimum top-up is 100 BDT."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const { checkout_url } = await initiateTopup(amountBdt);
      window.location.href = checkout_url;
    } catch {
      setError("Failed to start top-up.");
      setSubmitting(false);
    }
  }

  if (loading) return <div className="py-16 flex justify-center"><Spinner size="lg" /></div>;
  if (error && !balance) return <Alert variant="error">{error}</Alert>;
  if (!balance) return null;

  const isLow = balance.balance_paisa < 5000;

  return (
    <div className="space-y-6">
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-1">Wallet Balance</p>
        <p className="text-3xl font-bold text-surface-900">BDT {balance.balance_bdt.toFixed(2)}</p>
      </Card>

      {isLow && (
        <div className="flex items-center justify-between gap-4 flex-wrap rounded-md border border-warning-base/30 bg-warning-light px-4 py-3">
          <div className="flex items-center gap-3">
            <TriangleAlert size={18} className="text-warning-base flex-shrink-0" />
            <p className="text-sm text-warning-dark">Your balance is low. Top up to keep SMS and email sends uninterrupted.</p>
          </div>
          <Button size="sm" variant="primary" loading={submitting} onClick={() => handleTopup(100)}>Top Up Now</Button>
        </div>
      )}

      <Card>
        <p className="section-label mb-3">Top Up</p>
        <div className="flex flex-wrap gap-2">
          {TOPUP_PRESETS.map((amt) => (
            <Button key={amt} size="sm" variant="secondary" loading={submitting} onClick={() => handleTopup(amt)}>
              {amt.toLocaleString()} BDT
            </Button>
          ))}
          <Button size="sm" variant="secondary" onClick={() => setShowCustom((v) => !v)}>Custom</Button>
        </div>
        {showCustom && (
          <div className="flex items-end gap-2 mt-3 max-w-xs">
            <Input
              label="Amount (BDT)"
              type="number"
              min={100}
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="e.g. 750"
            />
            <Button
              size="sm"
              loading={submitting}
              disabled={!customAmount}
              onClick={() => handleTopup(Number(customAmount))}
            >
              Top Up
            </Button>
          </div>
        )}
      </Card>

      <Card padding={false} className="overflow-hidden">
        <p className="section-label px-6 pt-5 mb-3">Credit Rates</p>
        <table className="w-full text-sm">
          <thead className="border-y border-surface-200 bg-surface-50">
            <tr>
              {["Service", "Rate", "Unit", "Description"].map((h) => (
                <th key={h} className="px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-surface-500 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {rates.map((r) => (
              <tr key={r.id}>
                <td className="px-6 py-3 font-medium text-surface-800 capitalize">{r.service.replace("_", " ")}</td>
                <td className="px-6 py-3 text-surface-700">{Number(r.rate_bdt).toFixed(2)} BDT</td>
                <td className="px-6 py-3 text-surface-500">{r.unit_label}</td>
                <td className="px-6 py-3 text-surface-500">{r.description ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="h-5" />
      </Card>
    </div>
  );
}

const TYPE_BADGE: Record<string, { label: string; variant: "success" | "info" | "primary" | "warning" | "default" }> = {
  topup: { label: "Top-up", variant: "success" },
  admin_adjustment: { label: "Admin", variant: "default" },
  refund: { label: "Refund", variant: "info" },
};

const SERVICE_BADGE: Record<string, { label: string; variant: "info" | "primary" | "warning" | "default" }> = {
  sms: { label: "SMS", variant: "info" },
  whatsapp: { label: "WhatsApp", variant: "primary" },
  email_overage: { label: "Email", variant: "warning" },
  seo_query: { label: "SEO", variant: "default" },
};

function txnBadge(t: WalletTxn) {
  if (t.type === "deduction" && t.service && SERVICE_BADGE[t.service]) {
    const b = SERVICE_BADGE[t.service];
    return <Badge variant={b.variant}>{b.label}</Badge>;
  }
  const b = TYPE_BADGE[t.type] ?? { label: t.type, variant: "default" as const };
  return <Badge variant={b.variant}>{b.label}</Badge>;
}

function txnDescription(t: WalletTxn): string {
  if (t.note) return t.note;
  if (t.type === "topup") return "Wallet top-up";
  if (t.service) return `${t.service.replace("_", " ")} (${t.units_consumed ?? 1} unit${(t.units_consumed ?? 1) === 1 ? "" : "s"})`;
  return t.type;
}

function TransactionHistoryTab() {
  const [txns, setTxns] = useState<WalletTxn[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const PAGE = 20;

  useEffect(() => {
    fetchTransactions(PAGE, 0)
      .then((rows) => { setTxns(rows); setHasMore(rows.length === PAGE); setLoading(false); })
      .catch(() => { setError("Failed to load transactions."); setLoading(false); });
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const nextOffset = offset + PAGE;
      const rows = await fetchTransactions(PAGE, nextOffset);
      setTxns((prev) => [...prev, ...rows]);
      setOffset(nextOffset);
      setHasMore(rows.length === PAGE);
    } catch {
      setError("Failed to load more transactions.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) return <div className="py-16 flex justify-center"><Spinner size="lg" /></div>;
  if (error && txns.length === 0) return <Alert variant="error">{error}</Alert>;

  if (txns.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<CreditCard size={40} />}
          title="No transactions yet"
          description="Top up your wallet to get started."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      <Card padding={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-surface-200 bg-surface-50">
              <tr>
                {["Date", "Type", "Description", "Amount (BDT)", "Balance After (BDT)"].map((h) => (
                  <th key={h} className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-surface-500 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {txns.map((t) => (
                <tr key={t.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-5 py-3 text-surface-500 whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
                  <td className="px-5 py-3">{txnBadge(t)}</td>
                  <td className="px-5 py-3 text-surface-700 capitalize">{txnDescription(t)}</td>
                  <td className={`px-5 py-3 font-medium ${t.amount_bdt >= 0 ? "text-success-dark" : "text-danger-dark"}`}>
                    {t.amount_bdt >= 0 ? "+" : ""}{t.amount_bdt.toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-surface-600">{t.balance_after_bdt.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" loading={loadingMore} onClick={loadMore}>Load more</Button>
        </div>
      )}
    </div>
  );
}

const SUB_STATUS_BADGE: Record<string, { label: string; variant: "success" | "warning" | "danger" | "default" }> = {
  active: { label: "Active", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  failed: { label: "Failed", variant: "danger" },
  cancelled: { label: "Cancelled", variant: "default" },
};

function InvoicesTab() {
  const [subscription, setSubscription] = useState<Subscription | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMySubscription()
      .then(setSubscription)
      .catch(() => setError("Failed to load subscription."));
  }, []);

  if (error) return <Alert variant="error">{error}</Alert>;
  if (subscription === undefined) return <div className="py-16 flex justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-4">
      {subscription ? (
        <Card className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="font-semibold text-surface-900">{subscription.plan.name} plan</p>
            <p className="text-sm text-surface-500 mt-0.5">{subscription.plan.price_bdt.toLocaleString()} BDT/{subscription.plan.billing_interval}</p>
          </div>
          <Badge variant={SUB_STATUS_BADGE[subscription.status]?.variant ?? "default"}>
            {SUB_STATUS_BADGE[subscription.status]?.label ?? subscription.status}
          </Badge>
        </Card>
      ) : (
        <Card>
          <EmptyState icon={<CreditCard size={40} />} title="No subscription found" />
        </Card>
      )}
      <p className="text-xs text-surface-500">
        Full invoice PDF generation coming soon — contact support for a VAT invoice.
      </p>
    </div>
  );
}

export default function BillingPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) ?? "plan";
  const activeTab: Tab = TABS.some((t) => t.key === tab) ? tab : "plan";

  function setTab(next: Tab) {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("tab", next);
      p.delete("topup");
      return p;
    });
  }

  return (
    <AppLayout>
      <PageHeader title="Billing" description="Plan, credit wallet, and payment history." />

      {params.get("topup") === "success" && (
        <Alert variant="success" className="mb-4">Top-up successful — your balance has been updated.</Alert>
      )}
      {(params.get("topup") === "failed" || params.get("topup") === "cancelled") && (
        <Alert variant="warning" className="mb-4">Top-up was not completed.</Alert>
      )}

      <div className="flex gap-1 border-b border-surface-200 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-surface-500 hover:text-surface-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "plan" && <MyPlanTab />}
      {activeTab === "wallet" && <CreditWalletTab />}
      {activeTab === "usage" && <UsageReportTab />}
      {activeTab === "history" && <TransactionHistoryTab />}
      {activeTab === "invoices" && <InvoicesTab />}
    </AppLayout>
  );
}
