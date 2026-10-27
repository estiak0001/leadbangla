import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import AppLayout from "../components/AppLayout";
import Alert from "../components/Alert";
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import PageHeader from "../components/PageHeader";
import {
  deleteCompanyFavicon, deleteCompanyLogo, deleteCompanyLogoWhite,
  downloadCompanyFavicon, downloadCompanyLogo, downloadCompanyLogoWhite,
  fetchCompanySettings, updateCompanySettings,
  uploadCompanyFavicon, uploadCompanyLogo, uploadCompanyLogoWhite,
  type CompanySettings,
} from "../lib/admin";

function AssetUploader({
  label, hint, accept, assetUrl, onUpload, onRemove, onDownload, onError, dark,
}: {
  label: string;
  hint: string;
  accept: string;
  assetUrl: string | null;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  onDownload: () => Promise<void>;
  onError: (message: string) => void;
  dark?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handlePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(file);
    } catch {
      onError(`Could not upload. ${hint}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      await onRemove();
    } catch {
      onError(`Could not remove the ${label.toLowerCase()}.`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    try {
      await onDownload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Download failed");
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-surface-700 mb-1.5">{label}</label>
      <div className="flex items-center gap-4">
        <div className={`h-16 w-16 rounded-lg border flex items-center justify-center overflow-hidden flex-shrink-0 ${dark ? "border-slate-700 bg-slate-800" : "border-surface-200 bg-surface-50"}`}>
          {assetUrl ? (
            <img src={assetUrl} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <ImageIcon size={22} className="text-surface-300" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" icon={<Upload size={13} />} loading={busy} onClick={() => fileRef.current?.click()}>
              {assetUrl ? "Replace" : "Upload"}
            </Button>
            {assetUrl && (
              <>
                <Button type="button" size="sm" variant="ghost" icon={<Download size={13} />} onClick={handleDownload} disabled={busy}>
                  Download
                </Button>
                <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={handleRemove} disabled={busy}>
                  Remove
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-surface-500">{hint}</p>
        </div>
        <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={handlePick} />
      </div>
    </div>
  );
}

export default function CompanySettingsPage() {
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const navigate = useNavigate();

  function apply(c: CompanySettings) {
    setCompany(c);
    setName(c.company_name);
    setLegalName(c.legal_name ?? "");
    setAddress(c.address ?? "");
    setCity(c.city ?? "");
    setCountry(c.country ?? "");
    setPhone(c.phone ?? "");
    setSupportEmail(c.support_email ?? "");
    setWebsite(c.website ?? "");
  }

  useEffect(() => {
    fetchCompanySettings()
      .then((c) => { apply(c); setLoading(false); })
      .catch((err) => {
        if (err instanceof Error && err.message === "UNAUTHORIZED") { navigate("/login"); return; }
        setError("Failed to load company settings");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      apply(await updateCompanySettings({
        company_name: name, legal_name: legalName, address, city, country, phone, support_email: supportEmail, website,
      }));
      setSaved(true);
    } catch {
      setError("Could not save. Check the values and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader
        title="Company Settings"
        description="LeadBangla's own company profile — name, logo, favicon, address and contact details. Used across the platform, including as the logo and sender identity on every internal email."
      />

      {error && <Alert className="mb-4" onDismiss={() => setError(null)}>{error}</Alert>}
      {saved && <Alert variant="success" className="mb-4" onDismiss={() => setSaved(false)}>Saved.</Alert>}

      {loading || !company ? (
        <Card><div className="py-16 text-center text-surface-400 text-sm">Loading…</div></Card>
      ) : (
        <Card className="max-w-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <AssetUploader
              label="Logo"
              hint="PNG, JPEG, WebP or SVG — up to 2MB. Used on light backgrounds everywhere."
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              assetUrl={company.logo_url}
              onUpload={async (file) => apply(await uploadCompanyLogo(file))}
              onRemove={async () => apply(await deleteCompanyLogo())}
              onDownload={downloadCompanyLogo}
              onError={setError}
            />

            <AssetUploader
              label="Logo (white / light variant)"
              hint="Same logo in white or light colors, for dark backgrounds — the sidebar and the email header bar. Falls back to the main logo if not set."
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              assetUrl={company.logo_white_url}
              onUpload={async (file) => apply(await uploadCompanyLogoWhite(file))}
              onRemove={async () => apply(await deleteCompanyLogoWhite())}
              onDownload={downloadCompanyLogoWhite}
              onError={setError}
              dark
            />

            <AssetUploader
              label="Favicon"
              hint="PNG, SVG or ICO — up to 512KB. Shown in the browser tab."
              accept="image/png,image/svg+xml,image/x-icon,.ico"
              assetUrl={company.favicon_url}
              onUpload={async (file) => apply(await uploadCompanyFavicon(file))}
              onRemove={async () => apply(await deleteCompanyFavicon())}
              onDownload={downloadCompanyFavicon}
              onError={setError}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input label="Company name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input label="Legal name (optional)" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="LeadBangla Technologies Ltd." />
            </div>
            <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House 12, Road 5, Gulshan" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Dhaka" />
              <Input label="Country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Bangladesh" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8801700000000" />
              <Input label="Website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://leadbangla.com" />
            </div>
            <Input label="Support email" type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="support@leadbangla.com" helperText="Shown as a 'Need help?' line on every internal email." />

            <Button type="submit" loading={saving} className="w-full">Save</Button>
            {company.updated_by && (
              <p className="text-xs text-surface-400 text-center">Last updated by {company.updated_by} on {new Date(company.updated_at).toLocaleString()}</p>
            )}
          </form>
        </Card>
      )}
    </AppLayout>
  );
}
