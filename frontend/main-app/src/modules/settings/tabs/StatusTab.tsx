import { useEffect, useState } from "react";
import Alert from "../../../components/Alert";
import Card from "../../../components/Card";
import Spinner from "../../../components/Spinner";
import { fetchPlatformStatus, type PlatformStatusItem } from "../../../lib/platform";

const STATUS_DOT: Record<string, string> = {
  live: "bg-success-base",
  sandbox: "bg-warning-base",
  disabled: "bg-surface-300",
};
const STATUS_LABEL: Record<string, string> = { live: "Live", sandbox: "Sandbox", disabled: "Not configured" };

export default function StatusTab() {
  const [platformStatus, setPlatformStatus] = useState<PlatformStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlatformStatus()
      .then((p) => { setPlatformStatus(p); setLoading(false); })
      .catch(() => { setError("Failed to load platform status"); setLoading(false); });
  }, []);

  if (loading) {
    return <div className="py-16 flex justify-center"><Spinner size="lg" /></div>;
  }

  return (
    <div>
      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-4">{error}</Alert>}
      <Card className="p-0 overflow-hidden">
        <div className="divide-y divide-surface-100">
          {platformStatus.map((s) => (
            <div key={s.name} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-surface-800">{s.name}</p>
                {s.note && <p className="text-xs text-surface-400 mt-0.5">{s.note}</p>}
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-surface-600">
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s.status]}`} />
                {STATUS_LABEL[s.status]}
              </span>
            </div>
          ))}
        </div>
      </Card>
      <p className="text-xs text-surface-400 mt-3">To enable a service, contact your platform admin.</p>
    </div>
  );
}
