import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Mail, ShieldCheck } from "lucide-react";
import Button from "../../components/Button";
import Input from "../../components/Input";
import Alert from "../../components/Alert";
import SplitAuthLayout from "../../components/SplitAuthLayout";
import { resendOtp, storeTokens, verifyOtp } from "../../lib/auth";

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const preselectedPlanId = params.get("plan");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const tokens = await verifyOtp(email, code);
      storeTokens(tokens);
      navigate(preselectedPlanId ? `/checkout?plan=${preselectedPlanId}` : "/pick-plan");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      await resendOtp(email);
      setInfo("A new code has been sent to your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the code");
    } finally {
      setResending(false);
    }
  }

  return (
    <SplitAuthLayout
      title="Verify your email"
      subtitle={email ? `We sent a 6-digit code to ${email}.` : "Enter the 6-digit code we emailed you."}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
        {info && <Alert variant="success" onDismiss={() => setInfo(null)}>{info}</Alert>}

        <Input
          label="Verification code"
          type="text"
          inputMode="numeric"
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          prefixIcon={<ShieldCheck size={15} />}
          required
          minLength={6}
          maxLength={6}
        />

        <Button type="submit" loading={submitting} disabled={code.length !== 6} className="w-full" size="lg">
          Verify and continue
        </Button>

        <p className="text-center text-sm text-surface-500">
          Didn't get the code?{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
          >
            {resending ? "Sending…" : "Resend code"}
          </button>
        </p>
        <p className="text-center text-xs text-surface-400 flex items-center justify-center gap-1">
          <Mail size={12} /> Check your spam folder if you don't see it within a minute.
        </p>
      </form>
    </SplitAuthLayout>
  );
}
