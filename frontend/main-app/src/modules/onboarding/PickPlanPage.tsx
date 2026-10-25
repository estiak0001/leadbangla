import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import { clearTokens, fetchCurrentUser } from "../../lib/auth";
import { fetchMyManualPayments, fetchPlans, subscribeToPlan, type ManualPayment, type Plan } from "../../lib/billing";

function PlanCard({ plan, onSubscribe, onManual, busy }: { plan: Plan; onSubscribe: () => void; onManual: () => void; busy: boolean }) {
  return (
    <Card hoverable className="flex flex-col items-center text-center">
      <h2 className="text-lg font-bold text-surface-900">{plan.name}</h2>
      <div className="mt-3 mb-6">
        {plan.price_bdt === 0 ? (
          <span className="text-3xl font-extrabold text-surface-900">Free</span>
        ) : (
          <>
            <span className="text-3xl font-extrabold text-surface-900">{plan.price_bdt}</span>
            <span className="text-sm text-surface-600 ml-1">BDT/{plan.billing_interval}</span>
          </>
        )}
      </div>
      <Button className="w-full" loading={busy} onClick={onSubscribe}>
        {plan.price_bdt === 0 ? "Start free" : "Subscribe"}
      </Button>
      {plan.price_bdt > 0 && (
        <button type="button" onClick={onManual} className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700">
          Pay with bKash / Nagad / Rocket / Bank
        </button>
      )}
    </Card>
  );
}

export default function PickPlanPage() {
  const [plans, setPlans]             = useState<Plan[]>([]);
  const [error, setError]             = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [manual, setManual]           = useState<ManualPayment[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCurrentUser().catch(() => navigate("/login"));
    fetchPlans().then((p) => { setPlans(p); setLoading(false); }).catch(() => { setError("Could not load plans"); setLoading(false); });
    fetchMyManualPayments().then(setManual).catch(() => {});
  }, [navigate]);

  async function handleSubscribe(planId: string) {
    setError(null); setSubmittingId(planId);
    try { const { checkout_url } = await subscribeToPlan(planId); window.location.href = checkout_url; }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to start checkout"); setSubmittingId(null); }
  }

  return (
    <div className="min-h-screen bg-surface-50 px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-10">
          <img src="/logo.png" alt="LeadBangla" className="mx-auto h-9 w-auto" />
          <h1 className="mt-3 text-3xl font-bold text-surface-900">Pick a plan</h1>
          <p className="mt-2 text-surface-500">Simple BDT pricing. Cancel anytime.</p>
        </div>

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}
        {manual.filter((m) => m.status === "pending").map((m) => (
          <Alert key={m.id} variant="info" className="mb-4">
            Your {m.plan_name} payment ({m.amount_bdt} BDT via {m.method}, TrxID {m.trx_id}) is awaiting verification.
          </Alert>
        ))}
        {manual.filter((m) => m.status === "rejected").slice(0, 1).map((m) => (
          <Alert key={m.id} variant="error" className="mb-4">
            Your payment (TrxID {m.trx_id}) was rejected{m.admin_note ? `: ${m.admin_note}` : "."} You can submit again.
          </Alert>
        ))}

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                busy={submittingId === plan.id}
                onSubscribe={() => handleSubscribe(plan.id)}
                onManual={() => navigate(`/pay-manually?plan=${plan.id}`)}
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
