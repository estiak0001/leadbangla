import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Alert from "../../../components/Alert";
import Badge from "../../../components/Badge";
import Button from "../../../components/Button";
import Card from "../../../components/Card";
import Input from "../../../components/Input";
import Spinner from "../../../components/Spinner";
import { connectAccount, deleteAccount, listAccounts, type PaidAdsAccount } from "../../../lib/paid_ads";
import { confirmText } from "../../../components/ConfirmDialog";

const AD_PLATFORM_LABELS: Record<string, string> = { google: "Google Ads", meta: "Meta Ads" };

const GOOGLE_FIELDS = [
  { key: "developer_token", label: "Developer Token" },
  { key: "client_id", label: "OAuth2 Client ID" },
  { key: "client_secret", label: "OAuth2 Client Secret" },
  { key: "refresh_token", label: "Refresh Token" },
  { key: "customer_id", label: "Customer ID (digits only)" },
  { key: "login_customer_id", label: "Manager Account ID (optional)" },
];

const META_FIELDS = [
  { key: "access_token", label: "Long-lived Access Token" },
  { key: "ad_account_id", label: "Ad Account ID (e.g. act_12345)" },
  { key: "app_id", label: "App ID (optional)" },
  { key: "app_secret", label: "App Secret (optional)" },
];

function ConnectForm({ onConnected, onCancel }: { onConnected: (a: PaidAdsAccount) => void; onCancel: () => void }) {
  const [platform, setPlatform] = useState<"google" | "meta">("google");
  const [label, setLabel] = useState("");
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = platform === "google" ? GOOGLE_FIELDS : META_FIELDS;
  const setField = (k: string, v: string) => setCreds((prev) => ({ ...prev, [k]: v }));

  async function submit() {
    if (!label.trim()) { setError("Label is required."); return; }
    const required = fields.filter((f) => !f.label.includes("optional") && !creds[f.key]);
    if (required.length) { setError(`Fill in: ${required.map((f) => f.label).join(", ")}`); return; }
    setSaving(true);
    setError(null);
    try {
      const acct = await connectAccount({ platform, label: label.trim(), credentials: creds });
      onConnected(acct);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-brand-100 bg-brand-50 p-4 animate-slide-up">
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}

      <div>
        <label className="block text-sm font-medium text-surface-700 mb-2">Platform</label>
        <div className="flex gap-3">
          {(["google", "meta"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                platform === p
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-surface-200 text-surface-600 hover:border-surface-300 bg-white"
              }`}
            >
              {p === "google" ? "Google Ads" : "Meta Ads"}
            </button>
          ))}
        </div>
      </div>

      <Input inputSize="sm" label="Account Label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Dhaka Apparel – Google" />

      {fields.map((f) => (
        <Input
          key={f.key}
          inputSize="sm"
          label={f.label}
          type={f.key.includes("secret") || f.key.includes("token") ? "password" : "text"}
          value={creds[f.key] || ""}
          onChange={(e) => setField(f.key, e.target.value)}
          placeholder={f.label.includes("optional") ? "(optional)" : ""}
        />
      ))}

      <p className="text-xs text-surface-500">
        Credentials are verified on save. Campaigns are created in PAUSED status — activate them in the ad platform after review.
      </p>

      <div className="flex gap-2">
        <Button type="button" size="xs" loading={saving} onClick={submit}>Connect</Button>
        <Button type="button" variant="ghost" size="xs" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export default function AdsTab() {
  const [accounts, setAccounts] = useState<PaidAdsAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    listAccounts()
      .then((a) => { setAccounts(a); setLoading(false); })
      .catch(() => { setError("Failed to load ad accounts"); setLoading(false); });
  }, []);

  async function handleDelete(id: string) {
    if (!(await confirmText("Disconnect this ad account? All campaigns and spend data will be deleted."))) return;
    setBusyId(id);
    try {
      await deleteAccount(id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disconnect account");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="py-16 flex justify-center"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-3">
      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-1">{error}</Alert>}

      <div className="flex justify-end">
        <Button size="sm" variant="secondary" icon={<Plus size={15} />} onClick={() => setShowConnect((v) => !v)}>
          Connect Account
        </Button>
      </div>

      {showConnect && (
        <ConnectForm
          onCancel={() => setShowConnect(false)}
          onConnected={(a) => { setAccounts((prev) => [...prev, a]); setShowConnect(false); }}
        />
      )}

      {accounts.length === 0 ? (
        <Card>
          <p className="text-sm text-surface-500">No ad accounts connected yet.</p>
        </Card>
      ) : (
        accounts.map((acc) => (
          <Card key={acc.id} className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={acc.platform === "google" ? "warning" : "info"} size="sm">
                  {AD_PLATFORM_LABELS[acc.platform] ?? acc.platform}
                </Badge>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${acc.is_connected ? "bg-success-light text-success-dark" : "bg-surface-100 text-surface-500"}`}>
                  {acc.is_connected ? "Connected" : "Invalid credentials"}
                </span>
              </div>
              <p className="font-medium text-surface-900">{acc.label}</p>
              {acc.last_synced_at && (
                <p className="text-xs text-surface-400 mt-0.5">Last synced {new Date(acc.last_synced_at).toLocaleString()}</p>
              )}
            </div>
            <Button size="sm" variant="danger" loading={busyId === acc.id} icon={<Trash2 size={14} />} onClick={() => handleDelete(acc.id)}>
              Disconnect
            </Button>
          </Card>
        ))
      )}

      <p className="text-xs text-surface-400 pt-2">
        Create and track campaigns from the Paid Ads page.
      </p>
    </div>
  );
}
