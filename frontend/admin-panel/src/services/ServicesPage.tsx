import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Alert from "../components/Alert";
import AppLayout from "../components/AppLayout";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import Spinner from "../components/Spinner";
import Toggle from "../components/Toggle";
import { listFeatures, setFeature, type Feature } from "../lib/features";

const COST_NOTE: Record<string, string> = {
  whatsapp: "Costs you per conversation (Meta pricing). Turn on only when your rate and plan prices are settled.",
  sms: "Costs you per message. Customers pay from their wallet.",
};

export default function ServicesPage() {
  const [items, setItems] = useState<Feature[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    listFeatures().then(setItems).catch((e) => {
      if (e instanceof Error && e.message === "UNAUTHORIZED") { navigate("/login"); return; }
      setError("Could not load services");
    });
  }, [navigate]);

  async function flip(f: Feature, on: boolean) {
    setError(null); setBusy(f.code);
    try { const u = await setFeature(f.code, on); setItems((cur) => cur?.map((x) => (x.code === u.code ? u : x)) ?? cur); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  }

  return (
    <AppLayout>
      <PageHeader title="Services" description="Switch customer-facing services on or off. A service that's off disappears from the menu, plans and marketing site, and can't be used." />
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      {!items ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : (
        <Card padding={false}>
          <ul className="divide-y divide-surface-100">
            {items.map((f) => (
              <li key={f.code} className="flex items-start justify-between gap-4 p-4 sm:p-5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-surface-900">
                    {f.name}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${f.is_enabled ? "bg-success-light text-success-dark" : "bg-surface-100 text-surface-600"}`}>{f.is_enabled ? "On" : "Off"}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-surface-600">{f.description}</p>
                  {COST_NOTE[f.code] && <p className="mt-1 text-xs text-surface-500">{COST_NOTE[f.code]}</p>}
                  {f.updated_by && <p className="mt-1 text-[11px] text-surface-400">Last changed by {f.updated_by}</p>}
                </div>
                <Toggle value={f.is_enabled} disabled={busy === f.code} onChange={(v) => flip(f, v)} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="mt-4 text-xs text-surface-500">Plan limits are kept when a service is off, so turning it back on restores everything as it was.</p>
    </AppLayout>
  );
}
