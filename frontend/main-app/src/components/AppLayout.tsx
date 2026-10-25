import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { clearTokens, fetchCurrentUser } from "../lib/auth";
import { fetchWalletBalance } from "../lib/billing";
import { useMobileTables } from "../lib/mobileTables";
import { ROUTE_PERMISSION, useMe } from "../lib/permissions";
import NotificationBell from "./NotificationBell";
import {
  LayoutDashboard, Users, Filter, Mail, Share2, MessageSquare, MessageCircle,
  Globe, Workflow, BookUser, BarChart3, Search, Link2, Star,
  LogOut, Menu, X, Bell, CalendarDays, BadgeDollarSign, HelpCircle, Settings, ChevronDown,
  CreditCard, User, Wallet, UsersRound, Inbox, Settings2,
} from "lucide-react";
import { fetchMailCounts } from "../lib/mail";

interface NavItem { to: string; label: string; icon: ReactNode; }

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Main",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={16} /> },
      { to: "/contacts",  label: "Contacts",  icon: <Users size={16} /> },
      { to: "/segments",  label: "Segments",  icon: <Filter size={16} /> },
      { to: "/crm",       label: "CRM",       icon: <BookUser size={16} /> },
      { to: "/team",      label: "Team",      icon: <UsersRound size={16} /> },
    ],
  },
  {
    label: "Campaigns",
    items: [
      { to: "/campaigns", label: "Email Campaigns", icon: <Mail size={16} /> },
      { to: "/mail",      label: "Inbox",           icon: <Inbox size={16} /> },
      { to: "/email-setup", label: "Email Setup",   icon: <Settings2 size={16} /> },
      { to: "/sms",       label: "SMS",             icon: <MessageSquare size={16} /> },
      { to: "/whatsapp",  label: "WhatsApp",        icon: <MessageCircle size={16} /> },
      { to: "/push",      label: "Push",            icon: <Bell size={16} /> },
      { to: "/social",    label: "Social",          icon: <Share2 size={16} /> },
      { to: "/paid-ads",  label: "Paid Ads",        icon: <BadgeDollarSign size={16} /> },
    ],
  },
  {
    label: "Automation & Content",
    items: [
      { to: "/workflows",     label: "Workflows",     icon: <Workflow size={16} /> },
      { to: "/landing-pages", label: "Landing Pages", icon: <Globe size={16} /> },
      { to: "/events",        label: "Events",        icon: <CalendarDays size={16} /> },
    ],
  },
  {
    label: "Growth",
    items: [
      { to: "/affiliate",   label: "Affiliate",   icon: <Link2 size={16} /> },
      { to: "/influencers", label: "Influencers", icon: <Star size={16} /> },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/analytics", label: "Analytics", icon: <BarChart3 size={16} /> },
      { to: "/seo",       label: "SEO Audit", icon: <Search size={16} /> },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);


function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/profile")) return "My Profile";
  if (pathname.startsWith("/settings")) return "Settings";
  const match = ALL_ITEMS.find((item) => pathname.startsWith(item.to));
  return match?.label ?? "Dashboard";
}

function initials(email: string): string {
  const parts = email.split("@")[0].split(/[._-]/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
}

// ── Sidebar nav group (collapsible, remembers its state) ─────────────────────
function loadCollapsed(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem("nav-collapsed") ?? "{}"); } catch { return {}; }
}

const permFor = (to: string) => ROUTE_PERMISSION.find(([p]) => p === to)?.[1];

function NavGroup({ group, onLinkClick, collapsed, onToggle, badges }: { group: typeof NAV_GROUPS[0]; onLinkClick?: () => void; collapsed: boolean; onToggle: () => void; badges?: Record<string, number> }) {
  const { pathname } = useLocation();
  const hasActive = group.items.some((i) => pathname.startsWith(i.to));
  const open = !collapsed || hasActive;
  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-surface-500 hover:text-surface-800 select-none"
      >
        {group.label}
        <ChevronDown size={14} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="space-y-0.5">
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onLinkClick}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                  isActive
                    ? "bg-white font-semibold text-surface-900 shadow-sm ring-1 ring-surface-200/70"
                    : "font-medium text-surface-600 hover:bg-white/70 hover:text-surface-900"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`flex-shrink-0 ${isActive ? "text-brand-600" : "text-surface-500"}`}>{item.icon}</span>
                  <span className="truncate flex-1">{item.label}</span>
                  {!!badges?.[item.to] && <span className="rounded-full bg-brand-500 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">{badges[item.to] > 99 ? "99+" : badges[item.to]}</span>}
                </>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sidebar content ──────────────────────────────────────────────────────────
function SidebarContent({ onLinkClick }: { onLinkClick?: () => void }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const { can, me } = useMe();
  const [mailUnread, setMailUnread] = useState(0);
  const canMail = can("email");
  useEffect(() => {
    if (!canMail) return;
    const load = () => fetchMailCounts().then((c) => setMailUnread(c.inbox_unread)).catch(() => undefined);
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [canMail]);
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => can(permFor(i.to)) && !(me?.my_role === "sales" && i.to === "/segments")) })).filter((g) => g.items.length > 0);

  function toggle(label: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem("nav-collapsed", JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <NavGroup key={group.label} group={group} onLinkClick={onLinkClick} collapsed={!!collapsed[group.label]} onToggle={() => toggle(group.label)} badges={{ "/mail": mailUnread }} />
        ))}
      </nav>

      <div className="flex-shrink-0 px-3 py-3 border-t border-surface-200/80 space-y-0.5">
        <NavLink
          to="/settings"
          onClick={onLinkClick}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
              isActive ? "bg-white font-semibold text-surface-900 shadow-sm ring-1 ring-surface-200/70" : "font-medium text-surface-600 hover:bg-white/70 hover:text-surface-900"
            }`
          }
        >
          <Settings size={16} className="flex-shrink-0 text-surface-500" />
          <span>Settings</span>
        </NavLink>
        <button
          onClick={() => { clearTokens(); navigate("/login"); }}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-surface-600 hover:bg-white/70 hover:text-surface-900 transition-all duration-150"
        >
          <LogOut size={16} className="flex-shrink-0 text-surface-500" />
          <span>Log out</span>
        </button>
      </div>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Team member", sales: "Sales" };
const ROLE_NOTE: Record<string, string> = {
  owner: "Full control, billing and team.", admin: "Manages everything except owners.",
  member: "Works on the areas you were given.", sales: "Sees only the leads and tasks assigned to you.",
};

// ── User dropdown ────────────────────────────────────────────────────────────
function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const { me } = useMe();

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full pl-1 pr-2.5 py-1 hover:bg-white/10 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {initials(email)}
        </div>
        <span className="hidden sm:block text-sm font-medium text-white/90 max-w-[140px] truncate">
          {email}
        </span>
        <ChevronDown size={14} className={`text-white/60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 rounded-md border border-surface-200 bg-white shadow-lg shadow-surface-200/60 z-50 py-1.5 animate-slide-up">
          {/* Email header */}
          <div className="px-4 py-2.5 border-b border-surface-100">
            <p className="text-xs text-surface-600">Signed in as</p>
            <p className="text-sm font-medium text-surface-800 truncate mt-0.5">{email}</p>
            {me && (
              <div className="mt-2 border-t border-surface-100 pt-2 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded-[3px] bg-brand-50 text-brand-700 text-[11px] font-semibold">{ROLE_LABEL[me.my_role] ?? me.my_role}</span>
                  {me.name && <span className="text-xs text-surface-600 truncate">{me.display_name || me.name}</span>}
                </div>
                <p className="text-[11px] leading-snug text-surface-500">{ROLE_NOTE[me.my_role]}
                  {(me.my_role === "member" || me.my_role === "sales") && ` Access to ${me.my_permissions.length} area${me.my_permissions.length === 1 ? "" : "s"}.`}</p>
              </div>
            )}
          </div>

          {/* Menu items */}
          <div className="py-1">
            <Link
              to="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-surface-600 hover:bg-surface-50 hover:text-surface-900 transition-colors"
            >
              <User size={14} className="text-surface-400" />
              My Profile
            </Link>
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-surface-600 hover:bg-surface-50 hover:text-surface-900 transition-colors"
            >
              <Settings size={14} className="text-surface-400" />
              Settings
            </Link>
            <Link
              to="/billing"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-surface-600 hover:bg-surface-50 hover:text-surface-900 transition-colors"
            >
              <CreditCard size={14} className="text-surface-400" />
              Billing & Plans
            </Link>
            <Link
              to="/social?tab=accounts"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-surface-600 hover:bg-surface-50 hover:text-surface-900 transition-colors"
            >
              <Link2 size={14} className="text-surface-400" />
              Connections
            </Link>
            <a
              href="https://docs.leadbangla.com"
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-surface-600 hover:bg-surface-50 hover:text-surface-900 transition-colors"
            >
              <HelpCircle size={14} className="text-surface-400" />
              Help & Docs
            </a>
          </div>

          <div className="border-t border-surface-100 py-1">
            <button
              onClick={() => { setOpen(false); clearTokens(); navigate("/login"); }}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm font-medium text-danger-dark hover:bg-danger-light transition-colors"
            >
              <LogOut size={14} />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mobile bottom tab bar ────────────────────────────────────────────────────
const TABS = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/crm", label: "CRM", icon: BookUser },
  { to: "/campaigns", label: "Email", icon: Mail },
  { to: "/sms", label: "SMS", icon: MessageSquare },
];

function BottomNav({ onMore }: { onMore: () => void }) {
  const { can } = useMe();
  const tabs = TABS.filter((t) => can(permFor(t.to))).slice(0, 4);
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-surface-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]" aria-label="Main">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${isActive ? "text-brand-600" : "text-surface-500"}`}>
            {({ isActive }) => (<>
              <span className={`flex h-6 w-10 items-center justify-center rounded-full transition-colors ${isActive ? "bg-brand-50" : ""}`}><Icon size={19} /></span>
              {label}
            </>)}
          </NavLink>
        ))}
        <button type="button" onClick={onMore} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-surface-500">
          <span className="flex h-6 w-10 items-center justify-center"><Menu size={19} /></span>
          More
        </button>
      </div>
    </nav>
  );
}

// ── Root layout ──────────────────────────────────────────────────────────────
export default function AppLayout({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userEmail, setUserEmail]   = useState<string | null>(null);
  const [balance, setBalance]       = useState<number | null>(null);
  useMobileTables();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    fetchCurrentUser().then((u) => { setUserEmail(u.email); if (u.must_change_password) navigate("/change-password", { replace: true }); }).catch(() => null);
    fetchWalletBalance().then((w) => setBalance(w.balance_bdt)).catch(() => null);
  }, []);
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const pageTitle = getPageTitle(location.pathname);

  return (
    <div className="flex h-screen flex-col bg-shell">
      {/* ── Top bar (dark) ───────────────────────────────────────── */}
      <header className="flex h-14 flex-shrink-0 items-center gap-3 px-3 sm:px-5 text-white">
        <button onClick={() => setDrawerOpen(true)} className="lg:hidden p-2 -ml-1 rounded-md text-white/80 hover:bg-white/10" aria-label="Open menu">
          <Menu size={20} />
        </button>
        <Link to="/dashboard" aria-label="LeadBangla" className="flex-shrink-0">
          <img src="/logo-white.png" alt="LeadBangla" className="h-6 w-auto" />
        </Link>

        {balance !== null && (
          <Link to="/billing?tab=wallet" className="hidden sm:inline-flex items-center gap-2 rounded-full border border-white/15 bg-shell-light px-3.5 py-1.5 text-xs font-medium text-white/90 hover:bg-white/10 transition-colors ml-1" title="Wallet balance — click to top up">
            <Wallet size={14} /> <span className="whitespace-nowrap">Wallet ৳{balance.toLocaleString("en-BD", { maximumFractionDigits: 2 })}</span> <span className="hidden whitespace-nowrap text-white/50 xl:inline">· Top up</span>
          </Link>
        )}

        <h1 className="hidden xl:block ml-3 text-sm font-medium text-white/60 truncate">{pageTitle}</h1>
        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <NotificationBell />
          <a href="https://docs.leadbangla.com" target="_blank" rel="noreferrer" className="hidden sm:block p-2 rounded-full text-white/80 hover:bg-white/10 transition-colors" aria-label="Help">
            <HelpCircle size={18} />
          </a>
          <Link to="/settings" className="hidden sm:block p-2 rounded-full text-white/80 hover:bg-white/10 transition-colors" aria-label="Settings">
            <Settings size={18} />
          </Link>
          <div className="ml-1">
            {userEmail ? <UserMenu email={userEmail} /> : <div className="w-8 h-8 rounded-full bg-white/20 animate-pulse" />}
          </div>
        </div>
      </header>

      {/* ── Rounded panel: sidebar + content ─────────────────────── */}
      <div className="flex min-h-0 flex-1 gap-0 mx-0 sm:mx-2 mb-0 sm:mb-2 overflow-hidden rounded-none sm:rounded-2xl bg-white">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:flex-col w-64 flex-shrink-0 bg-surface-100/80 border-r border-surface-200/70">
          <SidebarContent />
        </aside>

        <BottomNav onMore={() => setDrawerOpen(true)} />

        {/* Mobile drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72 bg-surface-100 shadow-2xl animate-slide-in-left">
              <div className="flex h-14 items-center justify-between px-4 bg-shell">
                <img src="/logo-white.png" alt="LeadBangla" className="h-6 w-auto" />
                <button onClick={() => setDrawerOpen(false)} className="p-1.5 rounded-md text-white/70 hover:text-white hover:bg-white/10" aria-label="Close menu"><X size={18} /></button>
              </div>
              <div className="h-[calc(100%-3.5rem)]"><SidebarContent onLinkClick={() => setDrawerOpen(false)} /></div>
            </div>
          </div>
        )}

        {/* Content: full width, with the Bangladesh dot-map behind it */}
        <div className="relative min-w-0 flex-1 bg-surface-50">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-no-repeat opacity-[0.16]"
            style={{ backgroundImage: "url(/img/bd-dots.svg)", backgroundPosition: "center", backgroundSize: "auto min(80%, 640px)" }}
          />
          <main className="relative h-full overflow-y-auto p-3 pb-24 sm:p-5 sm:pb-24 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
