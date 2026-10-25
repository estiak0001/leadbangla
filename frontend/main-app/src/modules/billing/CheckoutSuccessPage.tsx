import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../../components/AuthLayout";
import Button from "../../components/Button";
import Spinner from "../../components/Spinner";
import { fetchMySubscription, type Subscription } from "../../lib/billing";

export default function CheckoutSuccessPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let attempts = 0;
    let cancelled = false;

    const poll = async () => {
      attempts += 1;
      try {
        const sub = await fetchMySubscription();
        if (cancelled) return;
        if (sub?.status === "active") { setSubscription(sub); setChecking(false); return; }
      } catch { /* retry */ }
      if (cancelled) return;
      if (attempts < 5) { setTimeout(poll, 1000); }
      else { setChecking(false); }
    };

    poll();
    return () => { cancelled = true; };
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-50">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm text-surface-500">Confirming your payment…</p>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <AuthLayout title="Still confirming…">
        <p className="text-sm text-surface-600">
          This can take a moment. Refresh, or go back to{" "}
          <Link to="/pick-plan" className="font-medium text-brand-600 hover:text-brand-700">pick a plan</Link>.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Subscribed 🎉">
      <p className="text-sm text-surface-600 mb-4">
        You're on the <span className="font-semibold text-surface-900">{subscription.plan.name}</span> plan (
        {subscription.plan.price_bdt} BDT/{subscription.plan.billing_interval}).
      </p>
      <Link to="/onboarding" className="block">
        <Button className="w-full">Continue to onboarding</Button>
      </Link>
    </AuthLayout>
  );
}
