import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import Button from "../../components/Button";
import Input from "../../components/Input";
import Alert from "../../components/Alert";
import SplitAuthLayout from "../../components/SplitAuthLayout";
import { forgotPassword } from "../../lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(email);
      navigate(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <SplitAuthLayout title="Forgot your password?" subtitle="Enter your email and we'll send you a reset code.">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}

        <Input
          label="Email"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          prefixIcon={<Mail size={15} />}
          required
        />

        <Button type="submit" loading={submitting} className="w-full" size="lg">
          Send reset code
        </Button>

        <p className="text-center text-sm text-surface-500">
          Remembered it?{" "}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Log in
          </Link>
        </p>
      </form>
    </SplitAuthLayout>
  );
}
