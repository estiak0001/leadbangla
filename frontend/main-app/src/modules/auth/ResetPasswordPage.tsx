import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, ShieldCheck } from "lucide-react";
import Button from "../../components/Button";
import Input from "../../components/Input";
import Alert from "../../components/Alert";
import SplitAuthLayout from "../../components/SplitAuthLayout";
import { forgotPassword, resetPassword, storeTokens } from "../../lib/auth";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
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
      const tokens = await resetPassword(email, code, newPassword);
      storeTokens(tokens);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the password");
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      await forgotPassword(email);
      setInfo("A new code has been sent to your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the code");
    } finally {
      setResending(false);
    }
  }

  return (
    <SplitAuthLayout
      title="Reset your password"
      subtitle={email ? `Enter the code we sent to ${email} and choose a new password.` : "Enter the code we emailed you and choose a new password."}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
        {info && <Alert variant="success" onDismiss={() => setInfo(null)}>{info}</Alert>}

        <Input
          label="Reset code"
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
        <Input
          label="New password"
          type="password"
          placeholder="Min. 8 characters"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          prefixIcon={<Lock size={15} />}
          required
          minLength={8}
        />

        <Button type="submit" loading={submitting} disabled={code.length !== 6} className="w-full" size="lg">
          Reset password and log in
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
        <p className="text-center text-sm text-surface-500">
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">Back to login</Link>
        </p>
      </form>
    </SplitAuthLayout>
  );
}
