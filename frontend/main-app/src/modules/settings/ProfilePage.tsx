import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Mail, Phone, Globe, MapPin, Pencil, Users, CreditCard, Calendar, BadgeCheck } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import Badge from "../../components/Badge";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Spinner from "../../components/Spinner";
import { INDUSTRY_OPTIONS } from "../../lib/onboarding";
import { fetchOrganizationProfile, type OrganizationProfile } from "../../lib/organization";

function Row({ icon: Icon, label, value, href }: { icon: typeof Mail; label: string; value: string | null; href?: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon size={16} className="text-surface-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-surface-500">{label}</p>
        {value ? (
          href ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="text-sm font-medium text-brand-600 hover:underline break-words">{value}</a>
               : <p className="text-sm font-medium text-surface-900 break-words">{value}</p>
        ) : <p className="text-sm text-surface-400 italic">Not added</p>}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [p, setP] = useState<OrganizationProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchOrganizationProfile().then(setP).catch((e) => setError(e.message)); }, []);

  if (error) return <AppLayout><Alert variant="error" className="max-w-lg mx-auto mt-16">{error}</Alert></AppLayout>;
  if (!p) return <AppLayout><div className="flex justify-center py-16"><Spinner size="lg" /></div></AppLayout>;

  const industry = INDUSTRY_OPTIONS.find((o) => o.value === p.industry)?.label ?? p.industry;
  const place = [p.address, p.city, p.country].filter(Boolean).join(", ");
  const initials = p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const site = p.website ? (p.website.startsWith("http") ? p.website : `https://${p.website}`) : null;

  return (
    <AppLayout>
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-brand-500 text-white flex items-center justify-center text-xl font-bold">{initials}</div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-surface-900">{p.name}</h1>
            {p.display_name && <p className="text-sm text-surface-600">{p.display_name}</p>}
            <div className="flex flex-wrap gap-2 mt-2">
              {p.plan_name && <Badge variant="primary" size="md">{p.plan_name} plan</Badge>}
              {industry && <Badge size="md">{industry}</Badge>}
              {p.company_size && <Badge size="md">{p.company_size} employees</Badge>}
            </div>
          </div>
          <Link to="/settings"><Button size="sm" icon={<Pencil size={14} />}>{p.can_edit ? "Edit company profile" : "View in settings"}</Button></Link>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h2 className="font-semibold text-surface-900 mb-1">Contact & location</h2>
          <div className="divide-y divide-surface-100">
            <Row icon={Phone} label="Phone" value={p.phone} href={p.phone ? `tel:${p.phone}` : undefined} />
            <Row icon={Mail} label="Contact email" value={p.contact_email} href={p.contact_email ? `mailto:${p.contact_email}` : undefined} />
            <Row icon={Globe} label="Website" value={p.website} href={site ?? undefined} />
            <Row icon={MapPin} label="Address" value={place || null} />
            <Row icon={Building2} label="Trade license no." value={p.trade_license_no} />
            <Row icon={BadgeCheck} label="TIN" value={p.tin} />
          </div>
          {!p.phone && !p.contact_email && !p.address && p.can_edit && (
            <p className="mt-3 text-xs text-surface-500">Complete your contact details in <Link to="/settings" className="text-brand-600 underline">Settings</Link>.</p>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="font-semibold text-surface-900 mb-1">My account</h2>
            <div className="divide-y divide-surface-100">
              <Row icon={Mail} label="Login email" value={p.my_email} />
              <div className="py-2.5"><Link to="/change-password" className="text-sm font-medium text-brand-600 hover:underline">Change my password →</Link></div>
              <div className="flex items-center gap-3 py-2.5">
                <BadgeCheck size={16} className="text-surface-400 flex-shrink-0" />
                <div><p className="text-xs text-surface-500">My role</p><Badge variant={p.my_role === "owner" ? "success" : "default"} size="md">{p.my_role}</Badge></div>
              </div>
            </div>
          </Card>
          <Card>
            <h2 className="font-semibold text-surface-900 mb-1">Workspace</h2>
            <div className="divide-y divide-surface-100">
              <Row icon={Mail} label="Owner" value={p.owner_email} />
              <Row icon={Users} label="Team members" value={String(p.member_count)} />
              <Row icon={CreditCard} label="Plan" value={p.plan_name} href="/billing" />
              <Row icon={Calendar} label="Member since" value={new Date(p.created_at).toLocaleDateString("en-BD", { year: "numeric", month: "long", day: "numeric" })} />
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
