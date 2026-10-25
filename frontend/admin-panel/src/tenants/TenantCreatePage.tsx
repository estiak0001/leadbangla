import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, FileText, KeyRound, StickyNote, UserRound, Wallet } from "lucide-react";
import AppLayout from "../components/AppLayout";
import Alert from "../components/Alert";
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import Select from "../components/Select";
import { createTenant } from "../lib/admin";
import { listAdminPlans, type PlanFull } from "../lib/plans";
import { COMPANY_SIZE_OPTIONS, INDUSTRY_OPTIONS } from "./tenantOptions";

function Section({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="!p-4 sm:!p-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">{icon}</span>
        <div><h2 className="text-sm font-semibold text-surface-900">{title}</h2>{hint && <p className="text-xs text-surface-500">{hint}</p>}</div>
      </div>
      {children}
    </Card>
  );
}

export default function TenantCreatePage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanFull[]>([]);
  const [f, setF] = useState({
    org_name: "", display_name: "", language: "bn" as "en" | "bn", industry: INDUSTRY_OPTIONS[0].value, company_size: COMPANY_SIZE_OPTIONS[0],
    phone: "", contact_email: "", website: "", address: "", city: "", country: "Bangladesh", trade_license_no: "", tin: "",
    owner_email: "", plan_id: "", starting_credit_bdt: "", send_invite: true, internal_notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => { listAdminPlans().then((p) => setPlans(p.filter((x) => x.is_active))).catch(() => undefined); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null); setSubmitting(true);
    try {
      const t = await createTenant({
        org_name: f.org_name, language: f.language, phone: f.phone, industry: f.industry, company_size: f.company_size,
        website: f.website || undefined, owner_email: f.owner_email, plan_id: f.plan_id || undefined,
        display_name: f.display_name || undefined, contact_email: f.contact_email || undefined, address: f.address || undefined,
        city: f.city || undefined, country: f.country || undefined, trade_license_no: f.trade_license_no || undefined, tin: f.tin || undefined,
        internal_notes: f.internal_notes || undefined, starting_credit_bdt: f.starting_credit_bdt ? Number(f.starting_credit_bdt) : 0, send_invite: f.send_invite,
      });
      navigate(`/tenants/${t.id}`);
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") { navigate("/login"); return; }
      setError(err instanceof Error ? err.message : "Failed to create the company");
      setSubmitting(false);
    }
  }

  const plan = plans.find((p) => p.id === f.plan_id);

  return (
    <AppLayout>
      <Link to="/tenants" className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-brand-600 font-medium mb-2"><ArrowLeft size={14} /> Tenants</Link>
      <div className="mb-5"><h1 className="text-xl font-bold text-surface-900 tracking-tight">Onboard a new company</h1>
        <p className="text-sm text-surface-500">For deals closed by phone, in person or outside the website. Everything here can be edited later.</p></div>

      {error && <Alert className="mb-4" onDismiss={() => setError(null)}>{error}</Alert>}

      <form onSubmit={submit} className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2 space-y-4 min-w-0">
          <Section icon={<Building2 size={16} />} title="Company" hint="Who the customer is">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input inputSize="sm" label="Company name *" value={f.org_name} onChange={(e) => set("org_name", e.target.value)} required minLength={2} placeholder="e.g. Dhaka Apparel Co." />
              <Input inputSize="sm" label="Trading / branch name" value={f.display_name} onChange={(e) => set("display_name", e.target.value)} placeholder="Optional" />
              <Select selectSize="sm" label="Industry *" value={f.industry} onChange={(e) => set("industry", e.target.value)}>{INDUSTRY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
              <Select selectSize="sm" label="Company size *" value={f.company_size} onChange={(e) => set("company_size", e.target.value)}>{COMPANY_SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o} people</option>)}</Select>
              <Select selectSize="sm" label="Language" value={f.language} onChange={(e) => set("language", e.target.value as "en" | "bn")}><option value="bn">বাংলা (Bangla)</option><option value="en">English</option></Select>
            </div>
          </Section>

          <Section icon={<FileText size={16} />} title="Contact & legal" hint="Used for invoices and for approving masking SMS">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input inputSize="sm" label="Phone *" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} required minLength={6} placeholder="01XXXXXXXXX" />
              <Input inputSize="sm" label="Contact email" type="email" value={f.contact_email} onChange={(e) => set("contact_email", e.target.value)} placeholder="hello@company.com" />
              <Input inputSize="sm" label="Website" value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
              <Input inputSize="sm" label="City" value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Dhaka" />
              <div className="sm:col-span-2"><Input inputSize="sm" label="Address" value={f.address} onChange={(e) => set("address", e.target.value)} /></div>
              <Input inputSize="sm" label="Country" value={f.country} onChange={(e) => set("country", e.target.value)} />
              <Input inputSize="sm" label="Trade license no." value={f.trade_license_no} onChange={(e) => set("trade_license_no", e.target.value)} />
              <Input inputSize="sm" label="TIN" value={f.tin} onChange={(e) => set("tin", e.target.value)} />
            </div>
          </Section>

          <Section icon={<StickyNote size={16} />} title="Private notes" hint="Only your team sees this — never the customer">
            <textarea value={f.internal_notes} onChange={(e) => set("internal_notes", e.target.value)} rows={3} maxLength={4000} placeholder="How you met, what was agreed, special terms…"
              className="block w-full rounded-md border border-surface-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
          </Section>
        </div>

        <div className="space-y-4 min-w-0">
          <Section icon={<UserRound size={16} />} title="Owner" hint="The person who will log in and manage the account">
            <Input inputSize="sm" label="Owner email *" type="email" value={f.owner_email} onChange={(e) => set("owner_email", e.target.value)} required placeholder="owner@company.com" />
            <label className="mt-3 flex items-start gap-2 text-sm text-surface-700 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={f.send_invite} onChange={(e) => set("send_invite", e.target.checked)} />
              <span>Email them a link to set their password<span className="block text-xs text-surface-500">Untick to set it up yourself first.</span></span>
            </label>
          </Section>

          <Section icon={<KeyRound size={16} />} title="Plan" hint="Starts immediately, no payment taken">
            <Select selectSize="sm" label="Plan" value={f.plan_id} onChange={(e) => set("plan_id", e.target.value)}>
              <option value="">No plan yet</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — ৳{p.price_bdt.toLocaleString()}/mo</option>)}
            </Select>
            {plan && <p className="mt-2 text-xs text-surface-500">{plan.contacts_limit < 0 ? "Unlimited" : plan.contacts_limit.toLocaleString()} contacts · {plan.sms_enabled ? `${plan.sms_monthly_limit < 0 ? "unlimited" : plan.sms_monthly_limit.toLocaleString()} SMS/mo` : "no SMS"}{plan.masking_allowed ? " · masking" : ""}{plan.whatsapp_enabled ? " · WhatsApp" : ""}</p>}
          </Section>

          <Section icon={<Wallet size={16} />} title="Starting credit" hint="Wallet balance for SMS and email overage">
            <Input inputSize="sm" label="Amount (৳)" type="number" min={0} step="1" value={f.starting_credit_bdt} onChange={(e) => set("starting_credit_bdt", e.target.value)} placeholder="0" />
          </Section>

          <div className="flex gap-2">
            <Button type="submit" loading={submitting} className="flex-1">Create company</Button>
            <Button type="button" variant="ghost" onClick={() => navigate("/tenants")} disabled={submitting}>Cancel</Button>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}
