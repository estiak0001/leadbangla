import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Mail, Lock } from "lucide-react";
import Button from "../../components/Button";
import Input from "../../components/Input";
import Select from "../../components/Select";
import Alert from "../../components/Alert";
import SplitAuthLayout from "../../components/SplitAuthLayout";
import { signup, storeTokens } from "../../lib/auth";
import {
  COMPANY_SIZE_OPTIONS,
  INDUSTRY_OPTIONS,
  type CompanySize,
  type Industry,
} from "../../lib/onboarding";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [language, setLanguage] = useState<"bn" | "en">("en");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState<Industry>(INDUSTRY_OPTIONS[0].value);
  const [companySize, setCompanySize] = useState<CompanySize>(COMPANY_SIZE_OPTIONS[0]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselectedPlanId = params.get("plan");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await signup({ email, password, orgName, language, phone, industry, companySize, website });
      if (!r.verification_required && r.access_token && r.refresh_token) {
        storeTokens({ access_token: r.access_token, refresh_token: r.refresh_token, token_type: "bearer" });
        navigate(preselectedPlanId ? `/checkout?plan=${preselectedPlanId}` : "/pick-plan");
        return;
      }
      navigate(`/verify-email?email=${encodeURIComponent(email)}${preselectedPlanId ? `&plan=${preselectedPlanId}` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
      setSubmitting(false);
    }
  }

  return (
    <SplitAuthLayout
      title="Create your account"
      subtitle={preselectedPlanId ? "One step away from your selected plan." : "Create your account, then choose a plan."}
    >
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
          placeholder="Min. 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          prefixIcon={<Lock size={15} />}
          required
          minLength={8}
          helperText="At least 8 characters"
        />

        <Input
          label="Organization name"
          placeholder="e.g. Acme Corp"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          required
          minLength={2}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Default language" value={language} onChange={(e) => setLanguage(e.target.value as "bn" | "en")}>
            <option value="en">English</option>
            <option value="bn">বাংলা (Bangla)</option>
          </Select>
          <Input
            label="Phone number"
            type="tel"
            placeholder="e.g. +8801XXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <Input
          label="Website (optional)"
          type="url"
          placeholder="https://acme.com"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Industry" value={industry} onChange={(e) => setIndustry(e.target.value as Industry)}>
            {INDUSTRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
          <Select label="Company size" value={companySize} onChange={(e) => setCompanySize(e.target.value as CompanySize)}>
            {COMPANY_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size} employees</option>
            ))}
          </Select>
        </div>

        <Button type="submit" loading={submitting} className="w-full" size="lg">
          Create account
        </Button>

        <p className="text-center text-sm text-surface-500">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Log in
          </Link>
        </p>
      </form>
    </SplitAuthLayout>
  );
}
