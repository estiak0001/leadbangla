import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import { checkOnboardingGate, completeOnboarding, fetchMyOrganization } from "../../lib/onboarding";

// No form here — organization details were already collected at signup
// (SignupPage.tsx) and staged on the user's account. Once an active
// subscription is in place, this just finalizes the Organization from that
// staged data and drops the user straight into the dashboard.
export default function OnboardingPage() {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function run() {
      const allowed = await checkOnboardingGate();
      if (!allowed) { navigate("/pick-plan"); return; }
      try {
        const org = await fetchMyOrganization();
        if (org) { navigate("/dashboard"); return; }
      } catch { navigate("/login"); return; }

      try {
        await completeOnboarding();
        navigate("/dashboard");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to set up your organization");
      }
    }
    run();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 px-4">
      <div className="flex flex-col items-center gap-3 max-w-sm text-center">
        {error ? (
          <Alert variant="error">{error}</Alert>
        ) : (
          <>
            <Spinner size="lg" />
            <p className="text-sm text-surface-500">Setting up your organization…</p>
          </>
        )}
      </div>
    </div>
  );
}
