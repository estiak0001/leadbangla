import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "../../../components/Alert";
import Button from "../../../components/Button";
import Card from "../../../components/Card";
import Spinner from "../../../components/Spinner";
import { INDUSTRY_OPTIONS, COMPANY_SIZE_OPTIONS } from "../../../lib/onboarding";
import { fetchOrganizationProfile, updateOrganizationProfile, type OrganizationProfile } from "../../../lib/organization";

const inputCls =
  "block w-full rounded-md border border-surface-200 bg-white px-3 py-2 text-sm text-surface-800 placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-surface-50 disabled:text-surface-500";

function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-medium text-surface-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-surface-500 mt-1">{hint}</span>}
    </label>
  );
}

type FormState = Record<string, string>;

function toForm(p: OrganizationProfile): FormState {
  return {
    name: p.name, display_name: p.display_name ?? "", language: p.language, industry: p.industry ?? "",
    company_size: p.company_size ?? "", phone: p.phone ?? "", contact_email: p.contact_email ?? "", website: p.website ?? "",
    address: p.address ?? "", city: p.city ?? "", country: p.country ?? "", trade_license_no: p.trade_license_no ?? "", tin: p.tin ?? "",
  };
}

export default function CompanyTab() {
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchOrganizationProfile()
      .then((p) => { setProfile(p); setForm(toForm(p)); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const dirty = profile ? JSON.stringify(form) !== JSON.stringify(toForm(profile)) : false;
  const readOnly = profile ? !profile.can_edit : true;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile || !dirty) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      const p = await updateOrganizationProfile(form as never);
      setProfile(p); setForm(toForm(p)); setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="py-16 flex justify-center"><Spinner size="lg" /></div>;
  if (!profile) return <Alert variant="error">{error ?? "Could not load the company profile."}</Alert>;

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-3xl">
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {saved && <Alert variant="success">Company profile saved.</Alert>}
      {readOnly && <Alert variant="info">Only the owner or an admin can edit these details. You can view them on your <Link to="/profile" className="underline font-medium">profile page</Link>.</Alert>}

      <Card>
        <h3 className="font-semibold text-surface-900 mb-4">Company</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Company name" className="sm:col-span-2">
            <input className={inputCls} value={form.name} onChange={set("name")} required minLength={2} disabled={readOnly} />
          </Field>
          <Field label="Branch / trading name (optional)" hint="Shown next to your company name, e.g. “Gulshan Branch”. Leave empty if you have one location." className="sm:col-span-2">
            <input className={inputCls} value={form.display_name} onChange={set("display_name")} placeholder="e.g. Gulshan Branch" disabled={readOnly} />
          </Field>
          <Field label="Industry">
            <select className={inputCls} value={form.industry} onChange={set("industry")} disabled={readOnly}>
              <option value="">Select…</option>
              {INDUSTRY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Company size">
            <select className={inputCls} value={form.company_size} onChange={set("company_size")} disabled={readOnly}>
              <option value="">Select…</option>
              {COMPANY_SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o} employees</option>)}
            </select>
          </Field>
          <Field label="Language">
            <select className={inputCls} value={form.language} onChange={set("language")} disabled={readOnly}>
              <option value="en">English</option>
              <option value="bn">বাংলা (Bangla)</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold text-surface-900 mb-4">Contact details</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Phone"><input className={inputCls} value={form.phone} onChange={set("phone")} placeholder="+8801XXXXXXXXX" disabled={readOnly} /></Field>
          <Field label="Contact email" hint="Public/business address — separate from your login email."><input type="email" className={inputCls} value={form.contact_email} onChange={set("contact_email")} placeholder="info@yourbrand.com" disabled={readOnly} /></Field>
          <Field label="Website" className="sm:col-span-2"><input className={inputCls} value={form.website} onChange={set("website")} placeholder="https://yourbrand.com" disabled={readOnly} /></Field>
          <Field label="Address" className="sm:col-span-2"><input className={inputCls} value={form.address} onChange={set("address")} placeholder="House, road, area" disabled={readOnly} /></Field>
          <Field label="City"><input className={inputCls} value={form.city} onChange={set("city")} disabled={readOnly} /></Field>
          <Field label="Country"><input className={inputCls} value={form.country} onChange={set("country")} placeholder="Bangladesh" disabled={readOnly} /></Field>
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold text-surface-900 mb-1">Business registration</h3>
        <p className="text-xs text-surface-500 mb-4">Optional. Needed later for SMS Sender ID (BTRC) and invoices.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Trade license no."><input className={inputCls} value={form.trade_license_no} onChange={set("trade_license_no")} disabled={readOnly} /></Field>
          <Field label="TIN"><input className={inputCls} value={form.tin} onChange={set("tin")} disabled={readOnly} /></Field>
        </div>
      </Card>

      {!readOnly && (
        <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-white/80 backdrop-blur py-3">
          {dirty && <span className="text-xs text-surface-500">You have unsaved changes</span>}
          <Button type="button" variant="ghost" size="sm" disabled={!dirty} onClick={() => setForm(toForm(profile))}>Discard</Button>
          <Button type="submit" size="sm" loading={saving} disabled={!dirty}>Save changes</Button>
        </div>
      )}
    </form>
  );
}
