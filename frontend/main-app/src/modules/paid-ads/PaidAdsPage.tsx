import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeDollarSign, ChevronDown, ChevronRight, ExternalLink,
  Plus, RefreshCw, Settings2, X,
} from "lucide-react";
import AppLayout from "../../components/AppLayout";
import PageHeader from "../../components/PageHeader";
import Badge from "../../components/Badge";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Input from "../../components/Input";
import Spinner from "../../components/Spinner";
import Card from "../../components/Card";
import {
  type AdCampaign,
  type PaidAdsAccount,
  type SpendRecord,
  createCampaign,
  listAccounts,
  listCampaigns,
  listSpend,
  syncCampaign,
} from "../../lib/paid_ads";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, currency = "USD") {
  return n.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 2 });
}

function ctr(clicks: number, impressions: number) {
  if (!impressions) return "0.00%";
  return `${((clicks / impressions) * 100).toFixed(2)}%`;
}

function platformBadge(p: string) {
  if (p === "google") return <Badge variant="info" size="sm">Google</Badge>;
  return <Badge variant="primary" size="sm">Meta</Badge>;
}

function statusBadge(s: string) {
  const map: Record<string, "success" | "warning" | "default"> = {
    active: "success", paused: "warning", completed: "default",
  };
  return <Badge variant={map[s] ?? "default"} size="sm">{s}</Badge>;
}


// ── Create Campaign Modal ─────────────────────────────────────────────────────

interface CreateCampaignModalProps {
  accounts: PaidAdsAccount[];
  onClose: () => void;
  onCreated: (c: AdCampaign) => void;
}

const META_OBJECTIVES = [
  "OUTCOME_AWARENESS", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS", "OUTCOME_APP_PROMOTION", "OUTCOME_SALES",
];

function CreateCampaignModal({ accounts, onClose, onCreated }: CreateCampaignModalProps) {
  const connectedAccounts = accounts.filter((a) => a.is_connected);
  const [form, setForm] = useState({
    account_id: connectedAccounts[0]?.id || "",
    name: "",
    objective: "OUTCOME_TRAFFIC",
    daily_budget: "5",
    currency: "USD",
    start_date: "",
    end_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const selectedAccount = accounts.find((a) => a.id === form.account_id);

  const submit = async () => {
    if (!form.account_id) { setError("Select an ad account."); return; }
    if (!form.name.trim()) { setError("Campaign name is required."); return; }
    if (!form.daily_budget || parseFloat(form.daily_budget) <= 0) { setError("Daily budget must be > 0."); return; }
    setSaving(true);
    setError(null);
    try {
      const c = await createCampaign({
        account_id: form.account_id,
        name: form.name.trim(),
        objective: form.objective || undefined,
        daily_budget: parseFloat(form.daily_budget),
        currency: form.currency,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
      });
      onCreated(c);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Campaign creation failed.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 animate-slide-up">
        <div className="flex items-center justify-between px-4 py-4 border-b border-surface-100">
          <h2 className="font-semibold text-surface-900">New Campaign</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600"><X size={18} /></button>
        </div>
        <div className="px-4 py-3.5 space-y-4">
          {error && <Alert variant="error">{error}</Alert>}

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Ad Account</label>
            <select
              className="w-full border border-surface-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.account_id}
              onChange={(e) => set("account_id", e.target.value)}
            >
              <option value="">Select account…</option>
              {connectedAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.label} ({a.platform})</option>
              ))}
            </select>
          </div>

          <Input label="Campaign Name" value={form.name}
            onChange={(e) => set("name", e.target.value)} placeholder="Dhaka Traffic – July" />

          {selectedAccount?.platform === "meta" && (
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Objective</label>
              <select
                className="w-full border border-surface-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={form.objective}
                onChange={(e) => set("objective", e.target.value)}
              >
                {META_OBJECTIVES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Daily Budget" type="number" value={form.daily_budget}
              onChange={(e) => set("daily_budget", e.target.value)} placeholder="5.00" />
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Currency</label>
              <select
                className="w-full border border-surface-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={form.currency}
                onChange={(e) => set("currency", e.target.value)}
              >
                {["USD", "BDT", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Start Date" type="date" value={form.start_date}
              onChange={(e) => set("start_date", e.target.value)} />
            <Input label="End Date" type="date" value={form.end_date}
              onChange={(e) => set("end_date", e.target.value)} />
          </div>

          <Alert variant="info">Campaign is created in PAUSED status. Activate it in the ad platform after review.</Alert>
        </div>
        <div className="flex justify-end gap-3 px-4 py-4 border-t border-surface-100">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Create Campaign</Button>
        </div>
      </div>
    </div>
  );
}

// ── Campaign Row ──────────────────────────────────────────────────────────────

interface CampaignRowProps {
  campaign: AdCampaign;
  onSync: (c: AdCampaign) => void;
  syncing: boolean;
}

function CampaignRow({ campaign: c, onSync, syncing }: CampaignRowProps) {
  const [open, setOpen] = useState(false);
  const [spend, setSpend] = useState<SpendRecord[]>([]);
  const [loadingSpend, setLoadingSpend] = useState(false);

  const loadSpend = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setLoadingSpend(true);
    try {
      setSpend(await listSpend(c.id));
    } finally {
      setLoadingSpend(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-surface-100 shadow-sm">
      <div
        className="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-surface-50 rounded-xl"
        onClick={loadSpend}
      >
        <div className="text-brand-500 flex-shrink-0">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-surface-900 truncate">{c.name}</p>
            {platformBadge(c.platform)}
            {statusBadge(c.status)}
          </div>
          <p className="text-xs text-surface-500 mt-0.5">
            {c.objective && <span className="mr-2">{c.objective}</span>}
            Budget: {fmt(c.daily_budget, c.currency)}/day
            {c.synced_at && (
              <span className="ml-2 text-surface-400">
                · Synced {new Date(c.synced_at).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4 text-right flex-shrink-0">
          <div>
            <p className="font-semibold text-surface-800">{fmt(c.total_spend, c.currency)}</p>
            <p className="text-xs text-surface-500">spend</p>
          </div>
          <div>
            <p className="font-semibold text-surface-800">{c.total_impressions.toLocaleString()}</p>
            <p className="text-xs text-surface-500">impr.</p>
          </div>
          <div>
            <p className="font-semibold text-surface-800">{ctr(c.total_clicks, c.total_impressions)}</p>
            <p className="text-xs text-surface-500">CTR</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onSync(c); }}
            disabled={syncing}
            className="p-1.5 rounded-md text-surface-400 hover:text-brand-600 hover:bg-brand-50 disabled:opacity-40"
            title="Sync performance"
          >
            {syncing ? <Spinner size="sm" /> : <RefreshCw size={14} />}
          </button>
          <a
            href={c.platform === "google"
              ? `https://ads.google.com/aw/campaigns?campaignId=${c.external_id}`
              : `https://business.facebook.com/adsmanager/manage/campaigns`}
            target="_blank" rel="noopener"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded-md text-surface-400 hover:text-brand-600 hover:bg-brand-50"
            title="Open in ad platform"
          >
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      {open && (
        <div className="border-t border-surface-100 px-4 py-4">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">
            Daily Spend (last 30 days)
          </p>
          {loadingSpend ? (
            <div className="flex justify-center py-4"><Spinner size="sm" /></div>
          ) : spend.length === 0 ? (
            <p className="text-sm text-surface-500 py-2">No spend data yet. Click sync to pull from {c.platform === "google" ? "Google" : "Meta"} Ads.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-100 text-xs text-surface-500">
                    <th className="pb-2 text-left font-medium">Date</th>
                    <th className="pb-2 text-right font-medium">Spend</th>
                    <th className="pb-2 text-right font-medium">Impressions</th>
                    <th className="pb-2 text-right font-medium">Clicks</th>
                    <th className="pb-2 text-right font-medium">CTR</th>
                    <th className="pb-2 text-right font-medium">Conv.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {spend.map((s) => (
                    <tr key={s.id}>
                      <td className="py-1.5 text-surface-700">{s.date}</td>
                      <td className="py-1.5 text-right font-medium">{fmt(s.spend, c.currency)}</td>
                      <td className="py-1.5 text-right text-surface-600">{s.impressions.toLocaleString()}</td>
                      <td className="py-1.5 text-right text-surface-600">{s.clicks.toLocaleString()}</td>
                      <td className="py-1.5 text-right text-surface-600">{ctr(s.clicks, s.impressions)}</td>
                      <td className="py-1.5 text-right text-surface-600">{s.conversions.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PaidAdsPage() {
  const [accounts, setAccounts] = useState<PaidAdsAccount[]>([]);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"accounts" | "campaigns">("accounts");

  useEffect(() => {
    Promise.all([listAccounts(), listCampaigns()])
      .then(([accts, camps]) => { setAccounts(accts); setCampaigns(camps); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const handleSync = async (c: AdCampaign) => {
    setSyncingId(c.id);
    try {
      const result = await syncCampaign(c.id);
      if (result.error) {
        setError(`Sync failed: ${result.error}`);
      } else {
        const fresh = await listCampaigns();
        setCampaigns(fresh);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncingId(null);
    }
  };

  const totalSpend = campaigns.reduce((s, c) => s + c.total_spend, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.total_clicks, 0);
  const totalImpr = campaigns.reduce((s, c) => s + c.total_impressions, 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="Paid Ads"
          description="Google Ads and Meta Ads — campaign creation, spend tracking, and cross-channel performance sync."
          actions={
            <div className="flex gap-2">
              <Link to="/settings?tab=ads">
                <Button variant="secondary">
                  <Settings2 size={15} className="mr-1.5" />
                  Manage Connections
                </Button>
              </Link>
              <Button onClick={() => setShowCreate(true)} disabled={!accounts.some((a) => a.is_connected)}>
                <Plus size={15} className="mr-1.5" />
                New Campaign
              </Button>
            </div>
          }
        />

        {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}

        {/* KPI strip */}
        {campaigns.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Spend (synced)", value: fmt(totalSpend) },
              { label: "Impressions", value: totalImpr.toLocaleString() },
              { label: "Overall CTR", value: ctr(totalClicks, totalImpr) },
            ].map((kpi) => (
              <Card key={kpi.label} className="text-center">
                <p className="text-2xl font-bold text-surface-900">{kpi.value}</p>
                <p className="text-xs text-surface-500 mt-1">{kpi.label}</p>
              </Card>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-surface-100">
          {(["accounts", "campaigns"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                tab === t
                  ? "border-brand-500 text-brand-700"
                  : "border-transparent text-surface-500 hover:text-surface-800"
              }`}
            >
              {t === "accounts" ? `Accounts (${accounts.length})` : `Campaigns (${campaigns.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : tab === "accounts" ? (
          accounts.length === 0 ? (
            <div className="text-center py-16">
              <BadgeDollarSign size={40} className="mx-auto text-surface-300 mb-3" />
              <p className="text-surface-500 font-medium">No ad accounts connected</p>
              <p className="text-sm text-surface-400 mt-1">Connect Google Ads or Meta Ads in Settings to start tracking campaigns.</p>
              <Link to="/settings?tab=ads">
                <Button className="mt-4">Connect Account in Settings</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between bg-white rounded-xl border border-surface-100 shadow-sm px-4 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-surface-900">{a.label}</p>
                      {platformBadge(a.platform)}
                      <Badge variant={a.is_connected ? "success" : "warning"} size="sm">
                        {a.is_connected ? "Connected" : "Invalid credentials"}
                      </Badge>
                    </div>
                    {a.last_synced_at && (
                      <p className="text-xs text-surface-500 mt-0.5">
                        Last synced: {new Date(a.last_synced_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              <Link to="/settings?tab=ads" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
                <Settings2 size={14} /> Manage in Settings
              </Link>
            </div>
          )
        ) : (
          campaigns.length === 0 ? (
            <div className="text-center py-16">
              <BadgeDollarSign size={40} className="mx-auto text-surface-300 mb-3" />
              <p className="text-surface-500 font-medium">No campaigns yet</p>
              <p className="text-sm text-surface-400 mt-1">Create a campaign to push it to Google or Meta Ads.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((c) => (
                <CampaignRow
                  key={c.id}
                  campaign={c}
                  onSync={handleSync}
                  syncing={syncingId === c.id}
                />
              ))}
            </div>
          )
        )}
      </div>

      {showCreate && (
        <CreateCampaignModal
          accounts={accounts}
          onClose={() => setShowCreate(false)}
          onCreated={(c) => { setCampaigns((p) => [c, ...p]); setShowCreate(false); setTab("campaigns"); }}
        />
      )}
    </AppLayout>
  );
}
