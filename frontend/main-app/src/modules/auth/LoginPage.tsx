import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock } from "lucide-react";
import Button from "../../components/Button";
import Input from "../../components/Input";
import Alert from "../../components/Alert";
import SplitAuthLayout from "../../components/SplitAuthLayout";
import { EMAIL_NOT_VERIFIED, login, storeTokens } from "../../lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("demo1@leadbangla.com");
  const [password, setPassword] = useState("demopass123");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const tokens = await login(email, password);
      storeTokens(tokens);
      navigate("/dashboard");
    } catch (err) {
      if (err instanceof Error && err.message === EMAIL_NOT_VERIFIED) {
        navigate(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      setError(err instanceof Error ? err.message : "Login failed");
      setSubmitting(false);
    }
  }

  return (
    <SplitAuthLayout title="Welcome back" subtitle="Log in to your LeadBangla workspace.">
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
        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          prefixIcon={<Lock size={15} />}
          required
        />
        <div className="text-right -mt-1">
          <Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" loading={submitting} className="w-full" size="lg">
          Log in
        </Button>

        <p className="text-center text-sm text-surface-500">
          Need an account?{" "}
          <Link to="/signup" className="font-medium text-brand-600 hover:text-brand-700">
            Sign up free
          </Link>
        </p>
      </form>
    </SplitAuthLayout>
  );
}
