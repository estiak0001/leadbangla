import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Input from "../../components/Input";
import SplitAuthLayout from "../../components/SplitAuthLayout";
import { changePassword, fetchCurrentUser } from "../../lib/auth";

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const [forced, setForced] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchCurrentUser().then((u) => setForced(!!u.must_change_password)).catch(() => navigate("/login")); }, [navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== again) { setError("The two new passwords don't match."); return; }
    setBusy(true); setError(null);
    try { await changePassword(current, next); navigate("/dashboard"); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not change the password"); setBusy(false); }
  }

  return (
    <SplitAuthLayout title={forced ? "Choose your own password" : "Change password"}
      subtitle={forced ? "Your company set a temporary password for you. Replace it before you continue." : "Use a password you don't use anywhere else."}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
        <Input label={forced ? "Temporary password" : "Current password"} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} prefixIcon={<Lock size={15} />} required autoComplete="current-password" />
        <Input label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} prefixIcon={<Lock size={15} />} required minLength={8} helperText="At least 8 characters" autoComplete="new-password" />
        <Input label="Repeat new password" type="password" value={again} onChange={(e) => setAgain(e.target.value)} prefixIcon={<Lock size={15} />} required minLength={8} autoComplete="new-password" />
        <Button type="submit" loading={busy} className="w-full" size="lg">Save password</Button>
        {!forced && <p className="text-center text-sm"><Link to="/profile" className="text-brand-600 hover:underline">Back to profile</Link></p>}
      </form>
    </SplitAuthLayout>
  );
}
