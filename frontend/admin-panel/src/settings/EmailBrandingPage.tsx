import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import Alert from "../components/Alert";
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import PageHeader from "../components/PageHeader";
import {
  fetchCompanySettings, fetchEmailBranding, fetchEmailTemplates, resetEmailTemplate,
  updateEmailBranding, updateEmailTemplate,
  type CompanySettings, type EmailTemplate,
} from "../lib/admin";

const SAMPLE_VALUES: Record<string, string> = {
  code: "123456",
  ttl_minutes: "10",
  org_name: "Acme Corp",
  inviter: "jane@acme.com",
  link: "https://leadbangla.com/accept-invite?token=…",
};

function renderSample(text: string, brandName: string): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    key === "brand_name" ? brandName || "LeadBangla" : SAMPLE_VALUES[key] ?? `{{${key}}}`
  );
}

// Blends a hex color towards white by `amount` (0 = unchanged, 1 = white) —
// mirrors services/email_branding_service.py's _lighten(), so the footer tint
// shown here matches the real email exactly.
function lighten(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#f1f5f9";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// ── Shared visual preview — mirrors services/email_branding_service.py's wrapper ──
function EmailPreview({
  company, accentColor, subject, bodyHtml,
}: { company: CompanySettings | null; accentColor: string; subject?: string; bodyHtml: string }) {
  const name = company?.company_name || "LeadBangla";
  const place = [company?.address, company?.city, company?.country].filter(Boolean).join(", ");
  const headerLogo = company?.logo_white_url || company?.logo_url;
  const footerBg = lighten(accentColor, 0.93);
  const footerBorder = lighten(accentColor, 0.78);
  return (
    <div className="rounded-xl bg-[#eef1f6] p-8">
      <div className="mx-auto w-full max-w-[420px] rounded-xl shadow-sm overflow-hidden">
        <div className="px-7 py-5" style={{ background: accentColor }}>
          {headerLogo ? (
            <img src={headerLogo} alt={name} style={{ height: 28 }} />
          ) : (
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.3px", color: "#fff" }}>{name}</span>
          )}
        </div>
        <div className="bg-white px-7 py-7 text-[13px] text-surface-800 leading-relaxed">
          {subject && <p className="font-semibold mb-2 text-surface-900">{subject}</p>}
          <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        </div>
        <div className="px-7 py-5 text-center text-[11px] text-surface-500 leading-relaxed" style={{ background: footerBg, borderTop: `1px solid ${footerBorder}` }}>
          <p><strong>{name}</strong>{place ? ` · ${place}` : ""}</p>
          {company?.phone && <p>{company.phone}</p>}
          <p className="mt-2">
            {company?.support_email && <span style={{ color: accentColor, fontWeight: 600 }}>Need help? Contact support &rarr;</span>}
            {company?.support_email && company?.website && " · "}
            {company?.website && <span className="text-surface-400">{company.website}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

const PREVIEW_BODY =
  "<p>Use this code to verify your email and finish creating your account:</p>" +
  "<p style='font-size:26px;font-weight:700;letter-spacing:6px;margin:16px 0;'>123456</p>" +
  "<p>This code expires in 10 minutes.</p>";

function BrandingSection({
  company, accentColor, onSaved,
}: { company: CompanySettings | null; accentColor: string; onSaved: (color: string) => void }) {
  const [color, setColor] = useState(accentColor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setColor(accentColor), [accentColor]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await updateEmailBranding(color);
      onSaved(updated.accent_color);
      setSaved(true);
    } catch {
      setError("Could not save. Check the value and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {error && <Alert className="mb-4">{error}</Alert>}
      {saved && <Alert variant="success" className="mb-4" onDismiss={() => setSaved(false)}>Saved — new internal emails will use this immediately.</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-6">
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-surface-600">
              The one style choice applied to every internal email — the top accent bar, code boxes and link color.
              Name, logo and contact details are managed on the{" "}
              <Link to="/company-settings" className="text-brand-600 hover:text-brand-700 font-medium">Company Settings</Link> page.
            </p>
            <div className="flex items-end gap-3">
              <Input label="Accent color" value={color} onChange={(e) => setColor(e.target.value)} required className="flex-1" />
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#4f46e5"}
                onChange={(e) => setColor(e.target.value)} className="h-10 w-10 rounded border border-surface-200 cursor-pointer" aria-label="Pick accent color" />
            </div>
            <Button type="submit" loading={saving} className="w-full">Save</Button>
          </form>
        </Card>

        <Card padding={false} className="overflow-hidden h-fit">
          <div className="px-4 py-3 border-b border-surface-200 bg-surface-50 text-xs font-semibold uppercase tracking-wide text-surface-400">Live preview</div>
          <EmailPreview company={company} accentColor={color} bodyHtml={PREVIEW_BODY} />
        </Card>
      </div>
    </>
  );
}

function TemplatesSection({ company, accentColor }: { company: CompanySettings | null; accentColor: string }) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchEmailTemplates()
      .then((tpls) => {
        setTemplates(tpls);
        setSelectedKey(tpls[0]?.key ?? null);
        setSubject(tpls[0]?.subject ?? "");
        setBodyHtml(tpls[0]?.body_html ?? "");
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof Error && err.message === "UNAUTHORIZED") { navigate("/login"); return; }
        setError("Failed to load email templates");
        setLoading(false);
      });
  }, [navigate]);

  const selected = templates.find((t) => t.key === selectedKey) ?? null;
  const brandName = company?.company_name || "LeadBangla";

  function select(key: string) {
    const tpl = templates.find((t) => t.key === key);
    if (!tpl) return;
    setSelectedKey(key);
    setSubject(tpl.subject);
    setBodyHtml(tpl.body_html);
    setError(null);
    setSaved(false);
  }

  async function handleSave() {
    if (!selectedKey) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await updateEmailTemplate(selectedKey, { subject, body_html: bodyHtml });
      setTemplates((prev) => prev.map((t) => (t.key === selectedKey ? updated : t)));
      setSaved(true);
    } catch {
      setError("Could not save. Check the values and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!selectedKey) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await resetEmailTemplate(selectedKey);
      setTemplates((prev) => prev.map((t) => (t.key === selectedKey ? updated : t)));
      setSubject(updated.subject);
      setBodyHtml(updated.body_html);
      setSaved(true);
    } catch {
      setError("Could not reset this template.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Card><div className="py-16 text-center text-surface-400 text-sm">Loading…</div></Card>;

  return (
    <>
      {error && <Alert className="mb-4">{error}</Alert>}
      {saved && <Alert variant="success" className="mb-4" onDismiss={() => setSaved(false)}>Saved.</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-[13rem_1fr_22rem] gap-6">
        <Card padding={false} className="overflow-hidden h-fit">
          <nav className="divide-y divide-surface-100">
            {templates.map((t) => (
              <button
                key={t.key}
                onClick={() => select(t.key)}
                className={`block w-full text-left px-3 py-2.5 text-sm transition-colors ${
                  t.key === selectedKey ? "bg-brand-50 text-brand-700 font-medium" : "text-surface-600 hover:bg-surface-50"
                }`}
              >
                {t.name}
              </button>
            ))}
          </nav>
        </Card>

        {selected && (
          <Card>
            <div className="space-y-4">
              <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-surface-700">Body HTML</label>
                <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={12}
                  className="block w-full rounded border border-surface-200 bg-white px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
              </div>
              <p className="text-xs text-surface-500">
                Placeholders: {selected.placeholders.map((p) => (
                  <code key={p} className="mx-0.5 rounded bg-surface-100 px-1 py-0.5 text-[11px]">{`{{${p}}}`}</code>
                ))}
              </p>
              <div className="flex gap-2">
                <Button onClick={handleSave} loading={saving} className="flex-1">Save</Button>
                <Button onClick={handleReset} variant="secondary" disabled={saving}>Reset to default</Button>
              </div>
              {selected.updated_by && (
                <p className="text-xs text-surface-400">Last updated by {selected.updated_by} on {new Date(selected.updated_at).toLocaleString()}</p>
              )}
            </div>
          </Card>
        )}

        {selected && (
          <Card padding={false} className="overflow-hidden h-fit">
            <div className="px-4 py-3 border-b border-surface-200 bg-surface-50 text-xs font-semibold uppercase tracking-wide text-surface-400">Preview (sample values)</div>
            <EmailPreview company={company} accentColor={accentColor}
              subject={renderSample(subject, brandName)} bodyHtml={renderSample(bodyHtml, brandName)} />
          </Card>
        )}
      </div>
    </>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-surface-900">{title}</h2>
      <p className="text-xs text-surface-500 mt-0.5">{description}</p>
    </div>
  );
}

export default function EmailBrandingPage() {
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [accentColor, setAccentColor] = useState("#4f46e5");
  const [loadError, setLoadError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([fetchCompanySettings(), fetchEmailBranding()])
      .then(([c, b]) => { setCompany(c); setAccentColor(b.accent_color); })
      .catch((err) => {
        if (err instanceof Error && err.message === "UNAUTHORIZED") { navigate("/login"); return; }
        setLoadError("Failed to load branding settings");
      });
  }, [navigate]);

  return (
    <AppLayout>
      <PageHeader
        title="Email Branding"
        description="How LeadBangla's internal emails look and what each one says — applied to every OTP, invite and alert. Customer campaigns keep each org's own sender and content."
      />

      {loadError && <Alert className="mb-4">{loadError}</Alert>}

      <div className="space-y-8">
        <section>
          <SectionHeading title="Look" description="The one accent color used across every internal email." />
          <BrandingSection company={company} accentColor={accentColor} onSaved={setAccentColor} />
        </section>

        <section>
          <SectionHeading title="Email templates" description="The subject and wording for each kind of internal email — pick one on the left to edit it." />
          <TemplatesSection company={company} accentColor={accentColor} />
        </section>
      </div>
    </AppLayout>
  );
}
