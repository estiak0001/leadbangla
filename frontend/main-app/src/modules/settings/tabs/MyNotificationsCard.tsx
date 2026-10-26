import { useEffect, useState } from "react";
import Alert from "../../../components/Alert";
import Card from "../../../components/Card";
import Spinner from "../../../components/Spinner";
import { fetchNotificationPreferences, saveNotificationPreferences, type NotificationPref } from "../../../lib/inbox";

/** Which kinds of updates reach *me* in the bell and by email (each person sets their own). */
export default function MyNotificationsCard() {
  const [prefs, setPrefs] = useState<NotificationPref[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { fetchNotificationPreferences().then(setPrefs).catch((e) => setError(e.message)); }, []);

  const change = async (key: string, channel: "in_app" | "email", value: boolean) => {
    setPrefs((p) => p?.map((x) => (x.key === key ? { ...x, [channel]: value } : x)) ?? null);
    try { setPrefs(await saveNotificationPreferences({ [key]: { [channel]: value } })); }
    catch (e: any) { setError(e.message); fetchNotificationPreferences().then(setPrefs).catch(() => undefined); }
  };

  return (
    <Card className="mb-4">
      <h3 className="font-semibold text-surface-900 mb-1">My notifications</h3>
      <p className="text-xs text-surface-500 mb-3">Choose what appears in the bell and what is also emailed to you. This only affects you, not your teammates.</p>
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      {!prefs ? <div className="py-4 flex justify-center"><Spinner /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-surface-500 text-left"><th className="py-1.5 font-medium">Update</th><th className="py-1.5 px-3 font-medium text-center">In app</th><th className="py-1.5 px-3 font-medium text-center">Email</th></tr></thead>
            <tbody className="divide-y divide-surface-100">
              {prefs.map((p) => (
                <tr key={p.key}>
                  <td className="py-2.5 pr-3"><p className="font-medium text-surface-900">{p.label}</p><p className="text-xs text-surface-500">{p.description}</p></td>
                  <td className="py-2.5 px-3 text-center"><input type="checkbox" className="h-4 w-4" checked={p.in_app} onChange={(e) => change(p.key, "in_app", e.target.checked)} aria-label={`${p.label} in app`} /></td>
                  <td className="py-2.5 px-3 text-center"><input type="checkbox" className="h-4 w-4" checked={p.email} onChange={(e) => change(p.key, "email", e.target.checked)} aria-label={`${p.label} email`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
