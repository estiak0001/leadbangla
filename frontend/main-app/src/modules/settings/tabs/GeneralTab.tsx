import { useEffect, useState } from "react";
import Alert from "../../../components/Alert";
import Card from "../../../components/Card";
import Spinner from "../../../components/Spinner";
import Toggle from "../../../components/Toggle";
import MyNotificationsCard from "./MyNotificationsCard";
import { fetchNotificationPrefs, updateNotificationPrefs, type NotificationPrefs } from "../../../lib/notifications";

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void | Promise<void>;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium text-surface-800">{label}</p>
        <p className="text-xs text-surface-500 mt-0.5">{description}</p>
      </div>
      <Toggle value={checked} onChange={onChange} />
    </div>
  );
}

export default function GeneralTab() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [thresholdInput, setThresholdInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotificationPrefs()
      .then((p) => { setPrefs(p); setThresholdInput(p.low_balance_threshold_bdt); setLoading(false); })
      .catch(() => { setError("Failed to load notification preferences."); setLoading(false); });
  }, []);

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function savePref(patch: Partial<{ low_balance_alert: boolean; usage_limit_alert: boolean; low_balance_threshold_bdt: number }>) {
    try {
      const updated = await updateNotificationPrefs(patch);
      setPrefs(updated);
      flashSaved();
    } catch {
      setError("Failed to save preference.");
    }
  }

  async function handleThresholdBlur() {
    const parsed = Number(thresholdInput);
    if (!prefs || Number.isNaN(parsed) || parsed < 0 || String(parsed) === prefs.low_balance_threshold_bdt) return;
    await savePref({ low_balance_threshold_bdt: parsed });
  }

  if (loading) {
    return <div className="py-16 flex justify-center"><Spinner size="lg" /></div>;
  }

  return (
    <>
      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-4">{error}</Alert>}
      {saved && <Alert variant="success" className="mb-4">Saved.</Alert>}

      <MyNotificationsCard />

      {prefs && (
        <Card>
          <h3 className="font-semibold text-surface-900 mb-1">Wallet & plan alert levels (company-wide)</h3>
          <p className="text-xs text-surface-500 mb-2">Daily low-balance and plan-limit emails go to the company owner.</p>
          <div className="divide-y divide-surface-100">
            <ToggleRow
              label="Low balance warning"
              description="Email me when my credit balance drops below threshold"
              checked={prefs.low_balance_alert}
              onChange={(v) => savePref({ low_balance_alert: v })}
            />
            <ToggleRow
              label="Usage limit warnings"
              description="Email me when I've used 90% of a plan limit"
              checked={prefs.usage_limit_alert}
              onChange={(v) => savePref({ usage_limit_alert: v })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-surface-600 pt-3 border-t border-surface-100 mt-1">
            Low balance alert threshold (BDT)
            <input
              type="number"
              min="0"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              onBlur={handleThresholdBlur}
              className="w-24 border border-surface-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </label>
        </Card>
      )}
    </>
  );
}
