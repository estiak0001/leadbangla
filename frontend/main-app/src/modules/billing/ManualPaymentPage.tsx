import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Input from "../../components/Input";
import Spinner from "../../components/Spinner";
import {
  fetchManualMethods, fetchPlans, submitManualPayment,
  type ManualMethod, type Plan,
} from "../../lib/billing";

export default function ManualPaymentPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [methods, setMethods] = useState<ManualMethod[]>([]);
  const [method, setMethod] = useState<string>("");
  const [sender, setSender] = useState("");
  const [trx, setTrx] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    Promise.all([fetchPlans(), fetchManualMethods()])
      .then(([plans, m]) => {
        setPlan(plans.find((p) => p.id === params.get("plan")) ?? null);
        setMethods(m);
        setMethod(m[0]?.method ?? "");
      })
      .catch(() => setError("Could not load payment options"))
      .finally(() => setLoading(false));
  }, [params]);

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
          <Card>
            <h1 className="text-xl font-bold text-surface-900">Payment submitted</h1>
            <p className="mt-2 text-sm text-surface-600">
              Our team will verify your payment and activate your plan. You'll be able to sign in to the dashboard once it is approved.
            </p>
            <Button className="mt-6" onClick={() => navigate("/pick-plan")}>Back to plans</Button>
          </Card>
        </div>
      </div>
    );
  }

  const selected = methods.find((m) => m.method === method);

  return (
    <div className="min-h-screen bg-surface-50 px-4 py-12">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold text-surface-900 text-center">Pay manually</h1>
        {error && <Alert variant="error" className="mt-4">{error}</Alert>}

        {!plan || methods.length === 0 ? (
          <Card className="mt-6 text-center">
            <p className="text-sm text-surface-600">
              {!plan ? "Plan not found." : "Manual payment is not available right now."}{" "}
              <Link to="/pick-plan" className="font-medium text-brand-600">Back to plans</Link>
            </p>
          </Card>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Card>
              <p className="text-sm text-surface-500">Plan</p>
              <p className="text-lg font-bold text-surface-900">{plan.name} — {plan.price_bdt} BDT/{plan.billing_interval}</p>
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
