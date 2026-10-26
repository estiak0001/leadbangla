import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CreditCard, Landmark } from "lucide-react";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Spinner from "../../components/Spinner";
import { fetchPaymentOptions, fetchPlans, subscribeToPlan, type PaymentOptions, type Plan } from "../../lib/billing";

type Choice = "online" | "manual";

export default function CheckoutPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [options, setOptions] = useState<PaymentOptions | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchPlans(), fetchPaymentOptions()])
      .then(([plans, o]) => {
        setPlan(plans.find((p) => p.id === params.get("plan")) ?? null);
        setOptions(o);
        setChoice(o.online.available ? "online" : o.manual.available ? "manual" : null);
      })
      .catch(() => setError("Could not load payment options"))
      .finally(() => setLoading(false));
  }, [params]);

  async function proceed() {
    if (!plan || !choice) return;
    if (choice === "manual") { navigate(`/pay-manually?plan=${plan.id}`); return; }
    setBusy(true); setError(null);
    try { const { checkout_url } = await subscribeToPlan(plan.id); window.location.href = checkout_url; }
    catch (err) { setError(err instanceof Error ? err.message : "Could not start the payment"); setBusy(false); }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner size="lg" /></div>;

  const methods: { key: Choice; title: string; text: string; icon: typeof CreditCard; available: boolean; why?: string }[] = [
    { key: "online", title: "Pay online", text: "bKash, Nagad, Rocket, cards and internet banking through SSLCommerz. Your plan starts right away.", icon: CreditCard,
      available: !!options?.online.available, why: "Not available right now" },
    { key: "manual", title: "Pay by transfer", text: "Send money by bKash, Nagad, Rocket or bank transfer, then upload the receipt. We activate your plan after we verify it.", icon: Landmark,
      available: !!options?.manual.available, why: "Not available right now" },
  ];
  const none = !methods.some((m) => m.available);

  return (
    <div className="min-h-screen bg-surface-50 px-4 py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 text-center">
          <img src="/logo.png" alt="LeadBangla" className="mx-auto h-9 w-auto" />
          <h1 className="mt-4 text-2xl font-bold text-surface-900">Choose how to pay</h1>
        </div>

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        {!plan ? (
          <p className="text-center text-sm text-surface-600">We couldn't find that plan. <Link to="/pick-plan" className="font-medium text-brand-600">Choose a plan</Link></p>
        ) : (
          <>
            <div className="mb-5 flex items-center justify-between rounded-xl border border-surface-200 bg-white px-4 py-4">
              <div><p className="text-xs text-surface-500">Plan</p><p className="text-base font-semibold text-surface-900">{plan.name}</p></div>
              <p className="text-right"><span className="text-xl font-bold text-surface-900">{plan.price_bdt.toLocaleString()}</span><span className="ml-1 text-sm text-surface-500">BDT / {plan.billing_interval}</span></p>
            </div>

            <div className="space-y-3">
              {methods.map((m) => (
                <button key={m.key} type="button" disabled={!m.available} onClick={() => setChoice(m.key)}
                  className={`flex w-full items-start gap-3 rounded-xl border bg-white p-4 text-left transition ${choice === m.key ? "border-brand-600 ring-2 ring-brand-600/10" : "border-surface-200"} ${m.available ? "hover:border-brand-300" : "cursor-not-allowed opacity-50"}`}>
                  <m.icon size={20} className="mt-0.5 shrink-0 text-surface-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-surface-900">{m.title}{!m.available && <span className="ml-2 text-xs font-normal text-surface-500">{m.why}</span>}</span>
                    <span className="mt-0.5 block text-xs text-surface-600">{m.text}</span>
                  </span>
                  <span className={`mt-1 h-4 w-4 shrink-0 rounded-full border ${choice === m.key ? "border-[5px] border-brand-600" : "border-surface-300"}`} />
                </button>
              ))}
            </div>

            {none ? (
              <Alert variant="warning" className="mt-4">Payments are temporarily unavailable. Please try again later or contact support.</Alert>
            ) : (
              <Button className="mt-6 w-full" loading={busy} disabled={!choice} onClick={proceed}>Continue</Button>
            )}
            <div className="mt-6 text-center"><Link to="/pick-plan" className="text-sm text-surface-500">← Choose a different plan</Link></div>
          </>
        )}
      </div>
    </div>
  );
}
