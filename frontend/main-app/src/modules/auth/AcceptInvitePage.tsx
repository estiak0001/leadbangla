import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import Button from "../../components/Button";
import Input from "../../components/Input";
import Alert from "../../components/Alert";
import SplitAuthLayout from "../../components/SplitAuthLayout";
import { acceptInvite, storeTokens } from "../../lib/auth";

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const tokens = await acceptInvite(token, password);
      storeTokens(tokens);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set password");
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <SplitAuthLayout title="Invite link invalid" subtitle="This invite link is missing its token.">
        <Alert variant="error">Please use the link from your invite email.</Alert>
      </SplitAuthLayout>
    );
  }

  return (
    <SplitAuthLayout title="Set your password" subtitle="Finish setting up your LeadBangla account.">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
        <Input
          label="Password"
          type="password"
          placeholder="Min. 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          prefixIcon={<Lock size={15} />}
          required
          minLength={8}
          helperText="At least 8 characters"
        />
        <Button type="submit" loading={submitting} className="w-full" size="lg">
          Set password &amp; continue
        </Button>
      </form>
    </SplitAuthLayout>
  );
}
