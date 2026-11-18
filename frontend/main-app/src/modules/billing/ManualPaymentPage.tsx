import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Minus } from "lucide-react";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Input from "../../components/Input";
import Spinner from "../../components/Spinner";
import Steps from "../../components/Steps";
import {
  fetchPaymentOptions, fetchPlans, submitManualPayment,
  type ManualMethod, type Plan,
} from "../../lib/billing";
import { planFeatures } from "../../lib/planFeatures";
import { useFeatures } from "../../lib/features";

export default function ManualPaymentPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [methods, setMethods] = useState<ManualMethod[]>([]);
  const [payNote, setPayNote] = useState("");
  const [method, setMethod] = useState<string>("");
  const [sender, setSender] = useState("");
  const [trx, setTrx] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const { on } = useFeatures();

  useEffect(() => {
    Promise.all([fetchPlans(), fetchPaymentOptions()])
      .then(([plans, o]) => {
        setPlan(plans.find((p) => p.id === params.get("plan")) ?? null);
        const m = o.manual.available ? o.manual.methods : [];
        setMethods(m);
        setPayNote(o.manual.note);
        setMethod(m[0]?.method ?? "");
      })
      .catch(() => setError("Could not load payment options"))
      .finally(() => setLoading(false));
  }, [params]);

  const invoiceId = params.get("invoice");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!plan) return;
    setError(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("plan_id", plan.id);
      form.set("method", method);
      form.set("sender_account", sender);
      form.set("trx_id", trx);
      if (note) form.set("note", note);
      if (invoiceId) form.set("invoice_id", invoiceId);
      files.forEach((f) => form.append("files", f));
      await submitManualPayment(form);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the payment");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner size="lg" /></div>;

  if (done) {
    return (
      <div className="min-h-screen bg-surface-50 px-4 py-12">
        <div className="mx-auto max-w-lg text-center">
          <Steps step={3} labels={["Plan", "Payment method", "Confirm"]} />
          <Card>
            <h1 className="text-xl font-bold text-surface-900">Payment submitted</h1>
            <p className="mt-2 text-sm text-surface-600">
              Our team will verify your payment and activate your plan — usually within one business day. You can check the status anytime from Billing → My Plan.
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Button variant="secondary" onClick={() => navigate("/pick-plan")}>Back to plans</Button>
              <Button onClick={() => navigate("/billing?tab=plan")}>Go to My Plan</Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const selected = methods.find((m) => m.method === method);

  return (
    <div className="min-h-screen bg-surface-50 px-4 py-12">
      <div className="mx-auto max-w-lg">
        <button onClick={() => navigate(`/checkout?plan=${params.get("plan") ?? ""}${invoiceId ? `&invoice=${invoiceId}` : ""}`)} className="mb-4 flex items-center gap-1.5 text-sm font-medium text-surface-500 hover:text-brand-600">
          <ArrowLeft size={15} /> Back to payment method
        </button>
        <Steps step={3} labels={["Plan", "Payment method", "Confirm"]} />
        <h1 className="text-2xl font-bold text-surface-900 text-center">{invoiceId ? "Renew by transfer" : "Pay manually"}</h1>
        {error && <Alert variant="error" className="mt-4">{error}</Alert>}

        {!plan || methods.length === 0 ? (
          <Card className="mt-6 text-center">
            <p className="text-sm text-surface-600 mb-4">
              {!plan ? "We couldn't find that plan — it may have changed." : "Manual payment is not available right now."}
            </p>
            <Button size="sm" onClick={() => navigate("/pick-plan")}>Back to plans</Button>
          </Card>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Card>
              <div className="flex items-center justify-between">
                <p className="text-sm text-surface-500">Selected plan</p>
                <Link to="/pick-plan" className="text-xs font-medium text-brand-600 hover:underline">Choose a different plan</Link>
              </div>
              <p className="text-lg font-bold text-surface-900">{plan.name} — {plan.price_bdt.toLocaleString()} BDT/{plan.billing_interval}</p>
              <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 border-t border-surface-100 pt-3 sm:grid-cols-2">
                {planFeatures(plan, { whatsapp: on("whatsapp"), sms: on("sms") }).map((f) => (
                  <li key={f.text} className={`flex gap-1.5 text-xs ${f.included ? "text-surface-600" : "text-surface-400"}`}>
                    {f.included ? <Check size={13} className="mt-0.5 shrink-0 text-emerald-600" /> : <Minus size={13} className="mt-0.5 shrink-0" />}
                    <span className={f.included ? "" : "line-through decoration-surface-300"}>{f.text}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <p className="text-sm font-medium text-surface-700 mb-2">1. Send {plan.price_bdt} BDT to one of these accounts</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {methods.map((m) => (
                  <button
                    type="button" key={m.method} onClick={() => setMethod(m.method)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${method === m.method ? "border-brand-600 bg-brand-50 text-brand-700" : "border-surface-200 text-surface-600"}`}
                  >{m.label}</button>
                ))}
              </div>
              {selected && <pre className="whitespace-pre-wrap rounded-lg bg-surface-100 p-3 text-sm text-surface-800">{selected.details}</pre>}
              {payNote && <p className="mt-2 text-xs text-surface-500">{payNote}</p>}
            </Card>

            <Card className="space-y-4">
              <p className="text-sm font-medium text-surface-700">2. Submit your payment details</p>
              <Input label="Number or account you paid from" value={sender} onChange={(e) => setSender(e.target.value)} required minLength={3} placeholder="The number or account you paid from" />
              <Input label="Transaction ID (TrxID)" value={trx} onChange={(e) => setTrx(e.target.value)} required minLength={3} />
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">
                  Payment proof <span className="text-danger-base">*</span>
                </label>
                <input
                  type="file" multiple required accept="image/jpeg,image/png,application/pdf"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  className="block w-full text-sm text-surface-600"
                />
                <p className="mt-1 text-xs text-surface-500">Screenshot or receipt (JPG, PNG or PDF, up to 5 files, 5 MB each). For bank transfers attach the deposit slip.</p>
              </div>
              <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" className="w-full" loading={submitting}>Submit for verification</Button>
            </Card>
          </form>
        )}
        <div className="mt-6 text-center"><Link to="/pick-plan" className="text-sm text-surface-500">← Back to plans</Link></div>
      </div>
    </div>
  );
}
