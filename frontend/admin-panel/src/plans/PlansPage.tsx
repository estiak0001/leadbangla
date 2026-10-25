import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import PageHeader from "../components/PageHeader";
import {
  createPlan,
  deletePlan,
  listAdminPlans,
  listCreditRates,
  updateCreditRate,
  updatePlan,
  type CreditRate,
  type PlanFull,
} from "../lib/plans";

function limitLabel(value: number): string {
  return value === -1 ? "Unlimited" : value.toLocaleString();
}

const LIMIT_FIELDS: { key: keyof PlanFull; label: string }[] = [
  { key: "contacts_limit", label: "Contacts" },
  { key: "emails_monthly_limit", label: "Emails/mo" },
  { key: "team_members_limit", label: "Team" },
  { key: "workflows_limit", label: "Workflows" },
  { key: "landing_pages_limit", label: "Landing Pages" },
  { key: "social_accounts_limit", label: "Social Acc." },
  { key: "seo_credits_monthly", label: "SEO Credits" },
  { key: "sms_monthly_limit", label: "SMS/mo" },
  { key: "whatsapp_monthly_limit", label: "WhatsApp/mo" },
];

interface PlanEditForm {
  code: string;
  name: string;
  price_bdt: string;
  contacts_limit: string;
  emails_monthly_limit: string;
  team_members_limit: string;
  workflows_limit: string;
  landing_pages_limit: string;
  social_accounts_limit: string;
  seo_credits_monthly: string;
  sms_monthly_limit: string;
  whatsapp_monthly_limit: string;
  sms_enabled: boolean;
  masking_allowed: boolean;
  whatsapp_enabled: boolean;
  custom_domain: boolean;
  priority_support: boolean;
  is_active: boolean;
}

const BLANK_FORM: PlanEditForm = {
  code: "", name: "", price_bdt: "0",
  contacts_limit: "1000", emails_monthly_limit: "5000", team_members_limit: "1",
  workflows_limit: "1", landing_pages_limit: "1", social_accounts_limit: "1", seo_credits_monthly: "10",
  sms_monthly_limit: "100", whatsapp_monthly_limit: "0", sms_enabled: true, masking_allowed: false, whatsapp_enabled: false,
  custom_domain: false, priority_support: false, is_active: true,
};

function toForm(plan: PlanFull): PlanEditForm {
  return {
    code: plan.code,
    name: plan.name,
    price_bdt: String(plan.price_bdt),
    contacts_limit: String(plan.contacts_limit),
    emails_monthly_limit: String(plan.emails_monthly_limit),
    team_members_limit: String(plan.team_members_limit),
    workflows_limit: String(plan.workflows_limit),
    landing_pages_limit: String(plan.landing_pages_limit),
    social_accounts_limit: String(plan.social_accounts_limit),
    seo_credits_monthly: String(plan.seo_credits_monthly),
    sms_monthly_limit: String(plan.sms_monthly_limit),
    whatsapp_monthly_limit: String(plan.whatsapp_monthly_limit ?? 0),
    sms_enabled: plan.sms_enabled,
    masking_allowed: plan.masking_allowed,
    whatsapp_enabled: plan.whatsapp_enabled,
    custom_domain: plan.custom_domain,
    priority_support: plan.priority_support,
    is_active: plan.is_active,
  };
}

function PlanEditModal({
  plan,
  onClose,
  onSaved,
  onDeleted,
}: {
  plan: PlanFull | null; // null = create a new plan
  onClose: () => void;
  onSaved: (saved: PlanFull) => void;
  onDeleted?: (id: string) => void;
}) {
  const [form, setForm] = useState<PlanEditForm>(() => (plan ? toForm(plan) : BLANK_FORM));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        price_bdt: Number(form.price_bdt),
        contacts_limit: Number(form.contacts_limit),
        emails_monthly_limit: Number(form.emails_monthly_limit),
        team_members_limit: Number(form.team_members_limit),
        workflows_limit: Number(form.workflows_limit),
        landing_pages_limit: Number(form.landing_pages_limit),
        social_accounts_limit: Number(form.social_accounts_limit),
        seo_credits_monthly: Number(form.seo_credits_monthly),
        sms_monthly_limit: Number(form.sms_monthly_limit),
        whatsapp_monthly_limit: Number(form.whatsapp_monthly_limit),
        sms_enabled: form.sms_enabled,
        masking_allowed: form.masking_allowed,
        whatsapp_enabled: form.whatsapp_enabled,
        custom_domain: form.custom_domain,
        priority_support: form.priority_support,
        is_active: form.is_active,
      };
      const saved = plan
        ? await updatePlan(plan.id, body)
        : await createPlan({ ...body, code: form.code.trim().toLowerCase() });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error && err.message !== "Request failed" ? err.message : "Failed to save plan");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!plan || !window.confirm(`Delete the "${plan.name}" plan? This cannot be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      await deletePlan(plan.id);
      onDeleted?.(plan.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-lg text-surface-900 mb-1">{plan ? `Edit ${plan.code} plan` : "New plan"}</h3>
        <p className="text-xs text-surface-500 mb-4">
          Use -1 for unlimited. Changes apply to the pricing page and to limit checks immediately.
        </p>

        {error && <Alert className="mb-4">{error}</Alert>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {!plan && (
            <div className="sm:col-span-2">
              <Input label="Code (lowercase, no spaces)" placeholder="e.g. business" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
          )}
          <div className="sm:col-span-2">
            <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <Input label="Price (BDT/mo)" type="number" value={form.price_bdt} onChange={(e) => setForm({ ...form, price_bdt: e.target.value })} />
          <Input label="Contacts limit" type="number" value={form.contacts_limit} onChange={(e) => setForm({ ...form, contacts_limit: e.target.value })} />
          <Input label="Emails/month" type="number" value={form.emails_monthly_limit} onChange={(e) => setForm({ ...form, emails_monthly_limit: e.target.value })} />
          <Input label="Team members" type="number" value={form.team_members_limit} onChange={(e) => setForm({ ...form, team_members_limit: e.target.value })} />
          <Input label="Workflows" type="number" value={form.workflows_limit} onChange={(e) => setForm({ ...form, workflows_limit: e.target.value })} />
          <Input label="Landing pages" type="number" value={form.landing_pages_limit} onChange={(e) => setForm({ ...form, landing_pages_limit: e.target.value })} />
          <Input label="Social accounts" type="number" value={form.social_accounts_limit} onChange={(e) => setForm({ ...form, social_accounts_limit: e.target.value })} />
          <Input label="SEO credits/month" type="number" value={form.seo_credits_monthly} onChange={(e) => setForm({ ...form, seo_credits_monthly: e.target.value })} />
        </div>

        <div className="mt-4 rounded-lg border border-surface-200 p-3 bg-surface-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-2">SMS &amp; WhatsApp</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <Input label="SMS per month (-1 = unlimited)" type="number" value={form.sms_monthly_limit} onChange={(e) => setForm({ ...form, sms_monthly_limit: e.target.value })} disabled={!form.sms_enabled} />
            <Input label="WhatsApp per month (-1 = unlimited)" type="number" value={form.whatsapp_monthly_limit} onChange={(e) => setForm({ ...form, whatsapp_monthly_limit: e.target.value })} disabled={!form.whatsapp_enabled} />
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm text-surface-700"><input type="checkbox" checked={form.sms_enabled} onChange={(e) => setForm({ ...form, sms_enabled: e.target.checked })} /> Can send SMS</label>
              <label className="flex items-center gap-2 text-sm text-surface-700"><input type="checkbox" checked={form.masking_allowed} onChange={(e) => setForm({ ...form, masking_allowed: e.target.checked })} /> Can request a masking Sender ID</label>
              <label className="flex items-center gap-2 text-sm text-surface-700"><input type="checkbox" checked={form.whatsapp_enabled} onChange={(e) => setForm({ ...form, whatsapp_enabled: e.target.checked })} /> Can send WhatsApp</label>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-surface-500">The plan only grants permission and a monthly cap. Each message is still charged from the customer's wallet.</p>
        </div>

        <div className="flex flex-wrap gap-5 mt-4">
          <label className="flex items-center gap-2 text-sm text-surface-700">
            <input type="checkbox" checked={form.custom_domain} onChange={(e) => setForm({ ...form, custom_domain: e.target.checked })} />
            Custom domain
          </label>
          <label className="flex items-center gap-2 text-sm text-surface-700">
            <input type="checkbox" checked={form.priority_support} onChange={(e) => setForm({ ...form, priority_support: e.target.checked })} />
            Priority support
          </label>
          <label className="flex items-center gap-2 text-sm text-surface-700">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Active
          </label>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-6">
          <Button variant="primary" className="flex-1" loading={saving} onClick={handleSave}>
            {saving ? "Saving…" : plan ? "Save changes" : "Create plan"}
          </Button>
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          {plan && plan.tenant_count === 0 && (
            <Button variant="danger" disabled={saving} onClick={handleDelete}>Delete</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CreditRateRow({ rate, onSaved }: { rate: CreditRate; onSaved: (updated: CreditRate) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rate.rate_bdt);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateCreditRate(rate.id, Number(value));
      onSaved(updated);
      setEditing(false);
    } catch {
      setValue(rate.rate_bdt);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="hover:bg-surface-50 transition-colors">
      <td className="px-5 py-3.5 font-semibold text-surface-900 capitalize">{rate.service.replace(/_/g, " ")}</td>
      <td className="px-5 py-3.5">
        {editing ? (
          <Input
            className="w-28"
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        ) : (
          <span className="text-surface-700">{Number(rate.rate_bdt).toFixed(2)} BDT</span>
        )}
      </td>
      <td className="px-5 py-3.5 text-surface-600">{rate.unit_label}</td>
      <td className="px-5 py-3.5 text-surface-500">{rate.description ?? "—"}</td>
      <td className="px-5 py-3.5 text-surface-500">{new Date(rate.updated_at).toLocaleString()}</td>
      <td className="px-5 py-3.5 text-surface-500">{rate.updated_by ?? "—"}</td>
      <td className="px-5 py-3.5">
        {editing ? (
          <div className="flex gap-1.5">
            <Button size="xs" variant="primary" loading={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="xs" variant="secondary" disabled={saving} onClick={() => { setEditing(false); setValue(rate.rate_bdt); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="xs" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
        )}
      </td>
    </tr>
  );
}

function CreditRateCard({ rate, onSaved }: { rate: CreditRate; onSaved: (updated: CreditRate) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rate.rate_bdt);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateCreditRate(rate.id, Number(value));
      onSaved(updated);
      setEditing(false);
    } catch {
      setValue(rate.rate_bdt);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-surface-900 capitalize">{rate.service.replace(/_/g, " ")}</p>
          <p className="text-xs text-surface-500 mt-0.5">{rate.unit_label}</p>
        </div>
        {editing ? (
          <Input className="w-24" type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
        ) : (
          <span className="text-surface-700 font-medium whitespace-nowrap">{Number(rate.rate_bdt).toFixed(2)} BDT</span>
        )}
      </div>
      {rate.description && <p className="text-sm text-surface-500 mt-2">{rate.description}</p>}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-100">
        <p className="text-xs text-surface-400">
          Updated {new Date(rate.updated_at).toLocaleDateString()} {rate.updated_by ? `by ${rate.updated_by}` : ""}
        </p>
        {editing ? (
          <div className="flex gap-1.5">
            <Button size="xs" variant="primary" loading={saving} onClick={handleSave}>Save</Button>
            <Button size="xs" variant="secondary" disabled={saving} onClick={() => { setEditing(false); setValue(rate.rate_bdt); }}>Cancel</Button>
          </div>
        ) : (
          <Button size="xs" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
        )}
      </div>
    </Card>
  );
}

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanFull[]>([]);
  const [rates, setRates] = useState<CreditRate[]>([]);
  const [editingPlan, setEditingPlan] = useState<PlanFull | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([listAdminPlans(), listCreditRates()])
      .then(([p, r]) => { setPlans(p); setRates(r); setLoading(false); })
      .catch((err) => {
        if (err instanceof Error && err.message === "UNAUTHORIZED") { navigate("/login"); return; }
        setError("Failed to load plans"); setLoading(false);
      });
  }, [navigate]);

  function handlePlanSaved(saved: PlanFull) {
    setPlans((prev) =>
      (prev.some((p) => p.id === saved.id) ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved])
        .sort((a, b) => a.price_bdt - b.price_bdt),
    );
    setEditingPlan(null);
    setCreating(false);
  }

  function handlePlanDeleted(id: string) {
    setPlans((prev) => prev.filter((p) => p.id !== id));
    setEditingPlan(null);
  }

  function handleRateSaved(updated: CreditRate) {
    setRates((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  if (loading) return <AppLayout><div className="py-16 text-center text-surface-400 text-sm">Loading plans…</div></AppLayout>;

  return (
    <AppLayout>
      <PageHeader title="Plans & Rates" description="Manage subscription plan limits and credit pricing." />

      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="flex items-center justify-between mb-3">
        <h2 className="section-label">Subscription Plans</h2>
        <Button size="sm" onClick={() => setCreating(true)}>+ New plan</Button>
      </div>

      {/* Desktop table */}
      <Card padding={false} className="hidden lg:block overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-surface-200 bg-surface-50">
              <tr>
                {["Name", "Code", "Price (BDT/mo)", ...LIMIT_FIELDS.map((f) => f.label), "Tenants", "Active", ""].map((h) => (
                  <th key={h} className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-surface-400 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-surface-900 whitespace-nowrap">{plan.name}</td>
                  <td className="px-5 py-3.5 text-surface-500">{plan.code}</td>
                  <td className="px-5 py-3.5 text-surface-700">{plan.price_bdt.toLocaleString()}</td>
                  {LIMIT_FIELDS.map((f) => (
                    <td key={f.key} className="px-5 py-3.5 text-surface-700 whitespace-nowrap">{limitLabel(plan[f.key] as number)}</td>
                  ))}
                  <td className="px-5 py-3.5 text-surface-600 font-medium">{plan.tenant_count}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant={plan.is_active ? "success" : "danger"}>{plan.is_active ? "Yes" : "No"}</Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <Button size="xs" variant="secondary" onClick={() => setEditingPlan(plan)}>Edit</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile / tablet card list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 lg:hidden">
        {plans.map((plan) => (
          <Card key={plan.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-surface-900">{plan.name}</p>
                <p className="text-xs text-surface-500 mt-0.5">{plan.code} · BDT {plan.price_bdt.toLocaleString()}/mo</p>
              </div>
              <Badge variant={plan.is_active ? "success" : "danger"}>{plan.is_active ? "Active" : "Inactive"}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 text-xs text-surface-600">
              {LIMIT_FIELDS.map((f) => (
                <span key={f.key}>{f.label}: <span className="font-medium text-surface-800">{limitLabel(plan[f.key] as number)}</span></span>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-100">
              <span className="text-sm text-surface-500">{plan.tenant_count} tenant{plan.tenant_count !== 1 ? "s" : ""}</span>
              <Button size="xs" variant="secondary" onClick={() => setEditingPlan(plan)}>Edit</Button>
            </div>
          </Card>
        ))}
      </div>

      <h2 className="section-label mb-3">Credit Rates</h2>

      {/* Desktop table */}
      <Card padding={false} className="hidden md:block overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-surface-200 bg-surface-50">
              <tr>
                {["Service", "Rate (BDT)", "Unit", "Description", "Last Updated", "Updated By", ""].map((h) => (
                  <th key={h} className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-surface-400 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {rates.map((rate) => (
                <CreditRateRow key={rate.id} rate={rate} onSaved={handleRateSaved} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile card list */}
      <div className="space-y-3 md:hidden">
        {rates.map((rate) => (
          <CreditRateCard key={rate.id} rate={rate} onSaved={handleRateSaved} />
        ))}
      </div>

      {(editingPlan || creating) && (
        <PlanEditModal
          plan={editingPlan}
          onClose={() => { setEditingPlan(null); setCreating(false); }}
          onSaved={handlePlanSaved}
          onDeleted={handlePlanDeleted}
        />
      )}
    </AppLayout>
  );
}
