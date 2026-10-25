import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import Button from "../components/Button";
import Input from "../components/Input";
import { login, storeAccessToken } from "../lib/auth";

export default function LoginPage() {
  const [email, setEmail]       = useState("admin@leadbangla.com");
  const [password, setPassword] = useState("adminpass123");
  const [error, setError]       = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(null); setSubmitting(true);
    try {
      const token = await login(email, password);
      storeAccessToken(token);
      navigate("/tenants");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Staff login">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-danger-base/20 border border-danger-base/40 px-3 py-2 text-sm text-rose-300" role="alert">
            {error}
          </div>
        )}
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="!bg-slate-700 !border-slate-600 !text-white placeholder:!text-slate-400 focus:!border-emerald-500 focus:!ring-emerald-500/20"
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="!bg-slate-700 !border-slate-600 !text-white placeholder:!text-slate-400 focus:!border-emerald-500 focus:!ring-emerald-500/20"
        />
        <Button type="submit" variant="success" loading={submitting} className="w-full justify-center">
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
