import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, CreditCard, Mail, MessageCircle, MessageSquare, Search, Share2, type LucideIcon, ChevronRight, CheckCircle2, CircleDashed, Radio } from "lucide-react";
import AppLayout from "../components/AppLayout";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import PageHeader from "../components/PageHeader";
import Spinner from "../components/Spinner";
import { listIntegrations, type PlatformServiceAdmin } from "../lib/integrations";

export const CATEGORY_META: Record<string, { label: string; icon: LucideIcon; tone: string; blurb: string }> = {
  payment: { label: "Payments", icon: CreditCard, tone: "text-emerald-700 bg-emerald-50", blurb: "Take money from customers" },
  email: { label: "Email", icon: Mail, tone: "text-indigo-700 bg-indigo-50", blurb: "Deliver email campaigns" },
  sms: { label: "SMS", icon: MessageSquare, tone: "text-sky-700 bg-sky-50", blurb: "Deliver text messages" },
  social: { label: "Social media", icon: Share2, tone: "text-violet-700 bg-violet-50", blurb: "Post to social networks" },
  push: { label: "Push notifications", icon: Bell, tone: "text-amber-700 bg-amber-50", blurb: "Browser notifications" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, tone: "text-emerald-700 bg-emerald-50", blurb: "Business messaging" },
  seo: { label: "SEO data", icon: Search, tone: "text-rose-700 bg-rose-50", blurb: "Keyword and ranking data" },
};
const ORDER = ["payment", "email", "sms", "whatsapp", "social", "push", "seo"];

export function statusOf(s: PlatformServiceAdmin): { key: "live" | "ready" | "setup" | "off"; label: string; variant: "success" | "primary" | "default" | "warning" } {
  if (!s.is_enabled) return { key: "off", label: "Disabled", variant: "default" };
  if (s.is_live && s.has_credentials) return { key: "live", label: "Live", variant: "success" };
  if (s.has_credentials) return { key: "ready", label: "Configured · not live", variant: "warning" };
  return { key: "setup", label: "Needs setup", variant: "default" };
}

/** SMS and WhatsApp each have their own panel. */
export const pageFor = (s: PlatformServiceAdmin) => (s.category === "sms" ? "/integrations/sms" : s.category === "whatsapp" ? "/integrations/whatsapp" : `/integrations/${s.code}`);

const ago = (ts: string | null) => (ts ? new Date(ts).toLocaleDateString("en-BD", { month: "short", day: "numeric" }) : null);

type Filter = "all" | "live" | "ready" | "setup" | "off";

export default function IntegrationHubPage() {
  const [services, setServices] = useState<PlatformServiceAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Filter>("all");
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    listIntegrations().then(setServices).catch((err) => {
      if (err instanceof Error && err.message === "UNAUTHORIZED") { navigate("/login"); return; }
      setError("Failed to load integrations");
    });
  }, [navigate]);

  const counts = useMemo(() => {
    const c = { live: 0, ready: 0, setup: 0, off: 0 };
    (services ?? []).forEach((s) => { c[statusOf(s).key] += 1; });
    return c;
  }, [services]);
  const cost = (services ?? []).filter((s) => s.is_live).reduce((n, s) => n + s.est_monthly_usd, 0);

  const shown = useMemo(() => (services ?? []).filter((s) => !(s.code === "whatsapp_bsp" && !s.has_credentials)).filter((s) =>
    (status === "all" || statusOf(s).key === status) && (cat === "all" || s.category === cat)
    && (!q.trim() || `${s.name} ${s.description}`.toLowerCase().includes(q.trim().toLowerCase()))), [services, status, cat, q]);
  const grouped = ORDER.map((c) => ({ category: c, items: shown.filter((s) => s.category === c) })).filter((g) => g.items.length > 0);

  if (!services) return <AppLayout><div className="py-16 flex justify-center">{error ? <Alert>{error}</Alert> : <Spinner size="lg" />}</div></AppLayout>;

  const pill = (active: boolean) => `px-2.5 py-1 text-xs font-medium border rounded-[3px] whitespace-nowrap ${active ? "bg-brand-500 text-white border-brand-500" : "bg-white text-surface-600 border-surface-200 hover:bg-surface-50"}`;
  const chips: [Filter, string, number][] = [["all", "All", services.length], ["live", "Live", counts.live], ["ready", "Not live", counts.ready], ["setup", "Needs setup", counts.setup], ["off", "Disabled", counts.off]];

  return (
    <AppLayout>
      <PageHeader title="Integrations" description="The outside services that power sending, payments and data." />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-surface-600 mb-3">
        <span className="inline-flex items-center gap-1.5"><Radio size={14} className="text-success-dark" /><b className="text-surface-900">{counts.live}</b> live</span>
        <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-warning-dark" /><b className="text-surface-900">{counts.ready}</b> configured, not live</span>
        <span className="inline-flex items-center gap-1.5"><CircleDashed size={14} className="text-surface-400" /><b className="text-surface-900">{counts.setup}</b> need setup</span>
        <span className="inline-flex items-center gap-1.5"><CreditCard size={14} className="text-brand-600" />about <b className="text-surface-900">${cost.toFixed(0)}</b>/month for live services</span>
      </div>

      <div className="bg-white border border-surface-200 rounded-[4px] p-2.5 mb-3 space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search integrations" className="w-full border border-surface-200 rounded-[3px] pl-8 pr-3 py-1.5 text-base sm:text-sm" /></div>
          <div className="flex flex-wrap gap-1.5">{chips.map(([k, l, n]) => <button key={k} onClick={() => setStatus(k)} className={pill(status === k)}>{l} <span className={status === k ? "text-white/80" : "text-surface-400"}>{n}</span></button>)}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setCat("all")} className={pill(cat === "all")}>All types</button>
          {ORDER.filter((c) => services.some((s) => s.category === c)).map((c) => { const M = CATEGORY_META[c]; return <button key={c} onClick={() => setCat(c)} className={`${pill(cat === c)} inline-flex items-center gap-1`}><M.icon size={12} />{M.label}</button>; })}
        </div>
      </div>

      {grouped.length === 0 ? <p className="bg-white border border-surface-200 rounded-[4px] p-10 text-center text-sm text-surface-500">Nothing matches these filters.</p> : (
        <div className="bg-white border border-surface-200 rounded-[4px] overflow-hidden divide-y divide-surface-100">
          {grouped.map((g) => {
            const meta = CATEGORY_META[g.category]; const Icon = meta.icon;
            return (
              <section key={g.category}>
                <div className="flex items-center gap-2 px-4 py-1.5 bg-surface-50 border-b border-surface-100">
                  <Icon size={13} className="text-surface-500" /><h2 className="text-xs font-semibold uppercase tracking-wide text-surface-600">{meta.label}</h2><span className="text-xs text-surface-400 hidden sm:inline">{meta.blurb}</span>
                </div>
                <ul className="divide-y divide-surface-100">
                  {g.items.map((s) => {
                    const st = statusOf(s);
                    return (
                      <li key={s.code}>
                        <Link to={pageFor(s)} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-surface-50/80">
                          <span className={`w-8 h-8 rounded-[4px] flex items-center justify-center flex-shrink-0 ${meta.tone}`}><Icon size={15} /></span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-surface-900 truncate">{s.name}</p>
                            <p className="text-xs text-surface-500 truncate">{s.description}</p>
                          </div>
                          <span className="hidden lg:block w-52 text-xs text-surface-500 truncate">{s.cost_model ?? "—"}</span>
                          <span className="hidden md:block w-28 text-xs text-right">
                            {s.last_test_ok === true && <span className="text-success-dark">Tested {ago(s.last_tested_at)} ✓</span>}
                            {s.last_test_ok === false && <span className="text-danger-dark">Last test failed</span>}
                          </span>
                          <Badge variant={st.variant} size="sm" dot>{st.label}</Badge>
                          <ChevronRight size={15} className="text-surface-300 group-hover:text-brand-600 flex-shrink-0" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
