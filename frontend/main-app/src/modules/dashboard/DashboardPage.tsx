import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Users, Mail, MousePointerClick, TrendingUp, Plus, Share2, MessageSquare, Globe, Workflow, BookUser, Search, Link2, Star, BarChart3, Filter, ArrowRight, ChevronRight, CheckCircle2 } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Button from "../../components/Button";
import { fetchMyOrganization, type Organization } from "../../lib/onboarding";
import { fetchAnalytics, type OrgAnalytics } from "../../lib/analytics";

// ── Process steps definition ─────────────────────────────────────────────────
const FLOW_STEPS = [
  {
    step: 1,
    phase: "Audience",
    title: "Build Contacts",
    desc: "Import contacts, capture leads, and grow your audience list.",
    to: "/contacts",
    icon: Users,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    tools: ["Contacts"],
  },
  {
    step: 2,
    phase: "Segment",
    title: "Create Segments",
    desc: "Group contacts by behavior, location, or custom filters.",
    to: "/segments",
    icon: Filter,
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-200",
    tools: ["Segments"],
  },
  {
    step: 3,
    phase: "Content",
    title: "Create Campaigns & Pages",
    desc: "Build email campaigns and landing pages to capture interest.",
    to: "/campaigns",
    icon: Mail,
    color: "text-brand-600",
    bg: "bg-brand-50",
    border: "border-brand-200",
    tools: ["Campaigns", "Landing Pages"],
    secondTo: "/landing-pages",
  },
  {
    step: 4,
    phase: "Automate",
    title: "Set Up Workflows",
    desc: "Trigger automated email and SMS sequences on user actions.",
    to: "/workflows",
    icon: Workflow,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    tools: ["Workflows"],
  },
  {
    step: 5,
    phase: "Distribute",
    title: "Send & Publish",
    desc: "Deliver content across email, SMS, and social platforms.",
    to: "/social",
    icon: Share2,
    color: "text-pink-600",
    bg: "bg-pink-50",
    border: "border-pink-200",
    tools: ["Social", "SMS"],
    secondTo: "/sms",
  },
  {
    step: 6,
    phase: "Measure",
    title: "Track Performance",
    desc: "Analyze open rates, clicks, conversions, and SEO scores.",
    to: "/analytics",
    icon: BarChart3,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    tools: ["Analytics", "SEO"],
    secondTo: "/seo",
  },
  {
    step: 7,
    phase: "Nurture",
    title: "Manage CRM",
    desc: "Track deals, manage relationships, and move leads through the pipeline.",
    to: "/crm",
    icon: BookUser,
    color: "text-teal-600",
    bg: "bg-teal-50",
    border: "border-teal-200",
    tools: ["CRM"],
  },
  {
    step: 8,
    phase: "Scale",
    title: "Grow with Partnerships",
    desc: "Launch affiliate programs and collaborate with influencers.",
    to: "/affiliate",
    icon: Link2,
    color: "text-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-200",
    tools: ["Affiliate", "Influencers"],
    secondTo: "/influencers",
  },
];

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, bg, fg }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; bg: string; fg: string;
}) {
  return (
    <div className="bg-white border border-surface-200 rounded-[6px] p-3 flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2.5 sm:rounded-[6px] sm:p-3">
      <div className={`flex-shrink-0 w-9 h-9 rounded-[6px] flex items-center justify-center sm:w-8 sm:h-8 sm:rounded-[6px] ${bg}`}>
        <span className={fg}>{icon}</span>
      </div>
      <div className="min-w-0 w-full">
        <p className="text-[11px] font-semibold text-surface-500 uppercase tracking-wide truncate sm:text-xs">{label}</p>
        <p className="text-xl font-bold text-surface-900 leading-tight sm:text-lg">{value}</p>
        {sub && <p className="text-xs text-surface-600 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function SkeletonStatCard() {
  return (
    <div className="bg-white border border-surface-200 rounded-[6px] p-3 flex items-center gap-2.5">
      <div className="skeleton w-8 h-8 rounded-[6px] flex-shrink-0" />
      <div className="space-y-1.5 flex-1">
        <div className="skeleton h-2 w-14 rounded" />
        <div className="skeleton h-4 w-16 rounded" />
      </div>
    </div>
  );
}

// ── Flow step card ───────────────────────────────────────────────────────────
function FlowStep({ step, isLast }: { step: typeof FLOW_STEPS[0]; isLast: boolean }) {
  const Icon = step.icon;
  return (
    <div className="flex items-stretch gap-0">
      {/* Card */}
      <Link
        to={step.to}
        className={`group flex-1 bg-white border ${step.border} rounded-[6px] p-3 hover:shadow-sm transition-all duration-150 hover:-translate-y-0.5`}
      >
        {/* Step number + phase */}
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-bold uppercase tracking-widest ${step.color}`}>
            Step {step.step}
          </span>
          <span className={`text-xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-[6px] ${step.bg} ${step.color}`}>
            {step.phase}
          </span>
        </div>

        {/* Icon + title */}
        <div className="flex items-center gap-2 mb-1.5">
          <div className={`w-7 h-7 rounded-[6px] flex items-center justify-center flex-shrink-0 ${step.bg}`}>
            <Icon size={14} className={step.color} />
          </div>
          <p className="text-xs font-semibold text-surface-800 leading-tight">{step.title}</p>
        </div>

        {/* Description */}
        <p className="text-xs text-surface-600 leading-relaxed mb-2">{step.desc}</p>

        {/* Tool tags */}
        <div className="flex flex-wrap gap-1">
          {step.tools.map((t) => (
            <span key={t} className={`text-xs font-medium px-1.5 py-0.5 rounded-[6px] ${step.bg} ${step.color}`}>
              {t}
            </span>
          ))}
        </div>

        {/* Arrow indicator */}
        <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${step.color} opacity-0 group-hover:opacity-100 transition-opacity`}>
          Open <ArrowRight size={10} />
        </div>
      </Link>

      {/* Connector arrow between steps */}
      {!isLast && (
        <div className="hidden lg:flex items-center flex-shrink-0 px-1">
          <ChevronRight size={14} className="text-surface-300" />
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [org, setOrg]             = useState<Organization | null>(null);
  const [analytics, setAnalytics] = useState<OrgAnalytics | null>(null);
  const [loading, setLoading]     = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchMyOrganization()
      .then((result) => {
        if (!result) { navigate("/onboarding"); return; }
        setOrg(result);
        return fetchAnalytics();
      })
      .then((a) => { if (a) setAnalytics(a); })
      .catch(() => navigate("/login"))
      .finally(() => setLoading(false));
  }, [navigate]);

  if (loading && !org) {
    return (
      <AppLayout>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <SkeletonStatCard key={i} />)}
        </div>
      </AppLayout>
    );
  }

  if (!org) return null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <AppLayout>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-surface-900 truncate sm:text-sm">{greeting} 👋</h1>
          <p className="text-xs text-surface-600 mt-0.5 truncate sm:mt-0.5">
            {org.name} · {org.language === "bn" ? "বাংলা workspace" : "English workspace"}
          </p>
        </div>
        <Link to="/campaigns" className="flex-shrink-0">
          <Button icon={<Plus size={13} />} size="sm">
            <span className="hidden sm:inline">New Campaign</span>
            <span className="sm:hidden">New</span>
          </Button>
        </Link>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mb-5">
        {loading ? (
          [...Array(4)].map((_, i) => <SkeletonStatCard key={i} />)
        ) : analytics ? (
          <>
            <StatCard label="Contacts"   value={analytics.total_contacts.toLocaleString()} icon={<Users size={15} />} bg="bg-blue-50" fg="text-blue-600" />
            <StatCard label="Emails Sent" value={analytics.total_sent.toLocaleString()} sub={`${analytics.sent_campaigns} campaigns`} icon={<Mail size={15} />} bg="bg-violet-50" fg="text-violet-600" />
            <StatCard label="Open Rate"  value={`${analytics.open_rate}%`} sub={`${analytics.total_opened} opened`} icon={<TrendingUp size={15} />} bg="bg-brand-50" fg="text-brand-600" />
            <StatCard label="Click Rate" value={`${analytics.click_rate}%`} sub={`${analytics.total_clicked} clicked`} icon={<MousePointerClick size={15} />} bg="bg-emerald-50" fg="text-emerald-600" />
          </>
        ) : null}
      </div>

      {/* ── Quick actions (phones) ───────────────────────────────── */}
      <div className="sm:hidden mb-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-surface-500">Quick actions</p>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Add contact", to: "/contacts", icon: <Users size={18} />, tone: "bg-blue-50 text-blue-600" },
            { label: "Email", to: "/campaigns/new", icon: <Mail size={18} />, tone: "bg-violet-50 text-violet-600" },
            { label: "SMS", to: "/sms/campaigns/new", icon: <MessageSquare size={18} />, tone: "bg-sky-50 text-sky-600" },
            { label: "Page", to: "/landing-pages", icon: <Globe size={18} />, tone: "bg-emerald-50 text-emerald-600" },
          ].map((a) => (
            <Link key={a.label} to={a.to} className="flex flex-col items-center gap-1.5 rounded-[6px] border border-surface-200 bg-white px-1 py-2.5 active:bg-surface-50">
              <span className={`flex h-10 w-10 items-center justify-center rounded-[6px] ${a.tone}`}>{a.icon}</span>
              <span className="text-[11px] font-medium text-surface-700">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Marketing process flow ───────────────────────────────── */}
      <div className="bg-white border border-surface-200 rounded-[6px] p-3 mb-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            <p className="text-xs font-bold text-surface-800">Marketing Process Flow</p>
            <p className="text-xs text-surface-600 mt-0.5"><span className="lg:hidden">Swipe through the journey from audience to growth.</span><span className="hidden lg:inline">Full journey from audience to growth — tap any step to open the tool.</span></p>
          </div>
          <div className="flex items-center gap-1 text-xs text-success-dark bg-success-light px-2 py-1 rounded-[6px] flex-shrink-0">
            <CheckCircle2 size={11} />
            <span>{FLOW_STEPS.length} steps</span>
          </div>
        </div>

        {/* Desktop: 4+4 grid with arrows */}
        <div className="hidden lg:block">
          {/* Row 1: steps 1–4 */}
          <div className="grid grid-cols-4 gap-0 mb-1">
            {FLOW_STEPS.slice(0, 4).map((s, i) => (
              <FlowStep key={s.step} step={s} isLast={i === 3} />
            ))}
          </div>

          {/* Down arrow connector */}
          <div className="flex justify-end pr-[12.5%] my-1">
            <div className="flex flex-col items-center">
              <div className="w-px h-3 bg-surface-200" />
              <ChevronRight size={12} className="text-surface-300 rotate-90" />
            </div>
          </div>

          {/* Row 2: steps 5–8 reversed direction */}
          <div className="grid grid-cols-4 gap-0">
            {FLOW_STEPS.slice(4).reverse().map((s, i) => (
              <FlowStep key={s.step} step={s} isLast={i === 3} />
            ))}
          </div>
        </div>

        {/* Mobile: swipeable step cards */}
        <div className="lg:hidden -mx-3 px-3 overflow-x-auto snap-x snap-mandatory pb-1">
          <div className="flex gap-2.5 w-max">
            {FLOW_STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <Link key={s.step} to={s.to} className="snap-start w-[15.5rem] flex-shrink-0 rounded-[6px] border border-surface-200 bg-white p-3 active:bg-surface-50">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-[6px] border ${s.bg} ${s.border}`}><Icon size={15} className={s.color} /></span>
                    <div className="leading-tight">
                      <p className={`text-[11px] font-bold uppercase tracking-wide ${s.color}`}>Step {s.step}</p>
                      <p className="text-[11px] uppercase tracking-wide text-surface-500">{s.phase}</p>
                    </div>
                    <ChevronRight size={14} className="ml-auto text-surface-300" />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-surface-800">{s.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-surface-600 line-clamp-2">{s.desc}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.tools.map((t) => <span key={t} className={`rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium ${s.bg} ${s.color}`}>{t}</span>)}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Quick stats row ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: "Go to CRM",        icon: <BookUser size={13} />,   to: "/crm",         bg: "bg-teal-50",   fg: "text-teal-600" },
          { label: "SEO Audit",        icon: <Search size={13} />,     to: "/seo",         bg: "bg-slate-50",  fg: "text-slate-600" },
          { label: "Influencers",      icon: <Star size={13} />,       to: "/influencers", bg: "bg-orange-50", fg: "text-orange-600" },
          { label: "View Analytics",   icon: <BarChart3 size={13} />,  to: "/analytics",   bg: "bg-emerald-50",fg: "text-emerald-600" },
        ].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-2 bg-white border border-surface-200 rounded-[6px] px-3 py-2 hover:border-surface-300 hover:bg-surface-50 transition-all group"
          >
            <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${item.bg}`}>
              <span className={item.fg}>{item.icon}</span>
            </div>
            <span className="text-xs font-medium text-surface-700 group-hover:text-surface-900 truncate">{item.label}</span>
            <ArrowRight size={11} className="ml-auto text-surface-300 group-hover:text-surface-500 flex-shrink-0" />
          </Link>
        ))}
      </div>

    </AppLayout>
  );
}
