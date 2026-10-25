import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import { clearTokens, fetchCurrentUser } from "../../lib/auth";
import { fetchPlans, subscribeToPlan, type Plan } from "../../lib/billing";

function PlanCard({ plan, onSubscribe, busy }: { plan: Plan; onSubscribe: () => void; busy: boolean }) {
  return (
    <Card hoverable className="flex flex-col items-center text-center">
      <h2 className="text-lg font-bold text-surface-900">{plan.name}</h2>
      <div className="mt-3 mb-6">
        <span className="text-3xl font-extrabold text-surface-900">{plan.price_bdt}</span>
        <span className="text-sm text-surface-600 ml-1">BDT/{plan.billing_interval}</span>
      </div>
      <Button className="w-full" loading={busy} onClick={onSubscribe}>
        Subscribe
      </Button>
    </Card>
  );
}

export default function PickPlanPage() {
  const [plans, setPlans]             = useState<Plan[]>([]);
  const [error, setError]             = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCurrentUser().catch(() => navigate("/login"));
    fetchPlans().then((p) => { setPlans(p); setLoading(false); }).catch(() => { setError("Could not load plans"); setLoading(false); });
  }, [navigate]);

  async function handleSubscribe(planId: string) {
    setError(null); setSubmittingId(planId);
    try { const { checkout_url } = await subscribeToPlan(planId); window.location.href = checkout_url; }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to start checkout"); setSubmittingId(null); }
  }

  return (
    <div className="min-h-screen bg-surface-50 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="text-center mb-10">
          <img src="/logo.png" alt="LeadBangla" className="mx-auto h-9 w-auto" />
          <h1 className="mt-3 text-3xl font-bold text-surface-900">Pick a plan</h1>
          <p className="mt-2 text-surface-500">Simple BDT pricing. Cancel anytime.</p>
        </div>

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                busy={submittingId === plan.id}
                onSubscribe={() => handleSubscribe(plan.id)}
              />
            ))}
          </div>
        )}

        <div className="mt-10 text-center">
          <Button variant="ghost" size="sm" onClick={() => { clearTokens(); navigate("/login"); }}>
            Log out
          </Button>
        </div>
      </div>
    </div>
  );
}
