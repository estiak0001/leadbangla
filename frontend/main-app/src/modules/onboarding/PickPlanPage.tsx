import { useEffect, useState } from "react";
import { Check, Clock, Minus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { COMPANY_LOGO_URL } from "../../lib/branding";
import Button from "../../components/Button";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import Steps from "../../components/Steps";
import { clearTokens, fetchCurrentUser } from "../../lib/auth";
import { fetchMyManualPayments, fetchMySubscription, fetchPlans, type ManualPayment, type Plan, type Subscription } from "../../lib/billing";
import { planFeatures } from "../../lib/planFeatures";
import { useFeatures } from "../../lib/features";

type CardState = "current" | "pending" | "choosable";

function PlanCard({ plan, featured, state, direction, onSubscribe, busy }: {
  plan: Plan; featured: boolean; state: CardState; direction: "up" | "down" | "same"; onSubscribe: () => void; busy: boolean;
}) {
  const { on } = useFeatures();
  return (
    <div className={`relative flex flex-col rounded-2xl bg-white p-5 ${featured ? "border-2 border-brand-500 shadow-xl lg:-translate-y-3" : "border border-surface-200 shadow-sm"} ${state === "current" ? "ring-2 ring-brand-500/20" : ""}`}>
      {featured && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-surface-900">{plan.name}</h2>
        {state === "current" && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Current</span>}
      </div>
      <div className="mt-3">
        {plan.price_bdt === 0 ? (
          <span className="text-4xl font-extrabold text-surface-900">Free</span>
        ) : (
          <>
            <span className="text-4xl font-extrabold text-surface-900">৳{plan.price_bdt.toLocaleString("en-US")}</span>
            <span className="ml-1 text-sm text-surface-500">/ {plan.billing_interval === "monthly" ? "month" : plan.billing_interval}</span>
          </>
        )}
      </div>
      <ul className="my-6 flex-1 space-y-2.5 text-sm">
        {planFeatures(plan, { whatsapp: on("whatsapp"), sms: on("sms") }).map((f) => (
          <li key={f.text} className={`flex gap-2 ${f.included ? "text-surface-700" : "text-surface-400"}`}>
            {f.included ? <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" /> : <Minus size={16} className="mt-0.5 shrink-0" />}
            <span className={f.included ? "" : "line-through decoration-surface-300"}>{f.text}</span>
          </li>
        ))}
      </ul>
      {state === "current" ? (
        <Button variant="secondary" className="w-full" disabled>Your current plan</Button>
      ) : state === "pending" ? (
        <Button variant="secondary" className="w-full gap-1.5" disabled>
          <Clock size={14} /> Verification pending
        </Button>
      ) : (
        <Button variant={featured ? "primary" : "secondary"} className="w-full" loading={busy} onClick={onSubscribe}>
          {plan.price_bdt === 0 ? "Start free" : direction === "up" ? `Upgrade to ${plan.name}` : direction === "down" ? `Switch to ${plan.name}` : `Choose ${plan.name}`}
        </Button>
      )}
    </div>
  );
}

export default function PickPlanPage() {
  const [plans, setPlans]             = useState<Plan[]>([]);
  const [error, setError]             = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [manual, setManual]           = useState<ManualPayment[]>([]);
  const [mySub, setMySub]             = useState<Subscription | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCurrentUser().catch(() => navigate("/login"));
    fetchPlans().then((p) => { setPlans(p); setLoading(false); }).catch(() => { setError("Could not load plans"); setLoading(false); });
    fetchMyManualPayments().then(setManual).catch(() => {});
    fetchMySubscription().then(setMySub).catch(() => {});
  }, [navigate]);

  function handleSubscribe(planId: string) {
    setSubmittingId(planId);
    navigate(`/checkout?plan=${planId}`);
  }

  return (
    <div className="min-h-screen bg-surface-50 px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <Steps step={1} labels={["Plan", "Payment method", "Confirm"]} />

        <div className="text-center mb-10">
          <img src={COMPANY_LOGO_URL} alt="LeadBangla" className="mx-auto h-9 w-auto" />
          <h1 className="mt-3 text-3xl font-bold text-surface-900">{mySub?.status === "active" ? "Change your plan" : "Choose your plan"}</h1>
          <p className="mt-2 text-surface-500">Simple pricing in BDT. No hidden charges. Cancel anytime.</p>
        </div>

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}
        {manual.filter((m) => m.status === "pending").map((m) => (
          <Alert key={m.id} variant="info" className="mb-4">
            Your {m.plan_name} payment ({m.amount_bdt} BDT via {m.method}, TrxID {m.trx_id}) is awaiting verification — usually within one business day. No need to submit again.
          </Alert>
        ))}
        {manual.filter((m) => m.status === "rejected").slice(0, 1).map((m) => (
          <Alert key={m.id} variant="error" className="mb-4">
            Your payment (TrxID {m.trx_id}) was rejected{m.admin_note ? `: ${m.admin_note}` : "."} You can submit again below.
          </Alert>
        ))}

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : (
          <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:items-stretch">
            {plans.map((plan) => {
              const hasPendingForPlan = manual.some((m) => m.status === "pending" && m.plan_name === plan.name);
              const isCurrent = mySub?.status === "active" && mySub.plan.id === plan.id;
              const state: CardState = isCurrent ? "current" : hasPendingForPlan ? "pending" : "choosable";
              const currentPrice = mySub?.status === "active" ? mySub.plan.price_bdt : null;
              const direction: "up" | "down" | "same" =
                currentPrice === null || currentPrice === plan.price_bdt ? "same" : plan.price_bdt > currentPrice ? "up" : "down";
              return (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  featured={plan.code === "growth"}
                  state={state}
                  direction={direction}
                  busy={submittingId === plan.id}
                  onSubscribe={() => handleSubscribe(plan.id)}
                />
              );
            })}
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
