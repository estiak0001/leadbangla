import { ReactNode, useEffect, useState } from "react";
import { useMobileTables } from "../lib/mobileTables";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { clearAccessToken } from "../lib/auth";
import { pendingVerificationCount } from "../lib/verifications";
import {
  Building2, CreditCard, Wallet, Receipt, BarChart3, Plug,
  LogOut, Menu, X,
} from "lucide-react";

interface NavItem { to: string; label: string; icon: ReactNode; }

const NAV_ITEMS: NavItem[] = [
  { to: "/tenants",      label: "Tenants",      icon: <Building2 size={16} /> },
  { to: "/plans",        label: "Plans & Rates", icon: <CreditCard size={16} /> },
  { to: "/manual-payments", label: "Manual payments", icon: <Receipt size={16} /> },
  { to: "/wallets",      label: "Wallets",      icon: <Wallet size={16} /> },
  { to: "/revenue",      label: "Revenue",      icon: <BarChart3 size={16} /> },
  { to: "/integrations", label: "Integrations", icon: <Plug size={16} /> },
];

const SIDEBAR_W  = "w-64";
const SIDEBAR_PL = "lg:pl-64";

function getPageTitle(pathname: string): string {
  const match = NAV_ITEMS.find((item) => pathname.startsWith(item.to));
  return match?.label ?? "Admin";
}

// ── Sidebar content ──────────────────────────────────────────────────────────
function SidebarContent({ onLinkClick }: { onLinkClick?: () => void }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const load = () => pendingVerificationCount().then(setPending).catch(() => undefined);
    load();
    const t = setInterval(load, 60000);
    window.addEventListener("verifications-changed", load);
    return () => { clearInterval(t); window.removeEventListener("verifications-changed", load); };
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Logo */}
      <div className="flex-shrink-0 px-4 py-5 border-b border-slate-800">
        <Link to="/tenants" onClick={onLinkClick} className="flex items-center gap-2.5">
          <div className="min-w-0">
            <img src={`${import.meta.env.BASE_URL}logo-white.png`} alt="LeadBangla" className="block h-5 w-auto" />
            <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-400 leading-none">
              Internal Admin
            </p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onLinkClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-brand-500/20 text-brand-300"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`
            }
          >
            <span className="flex-shrink-0">{item.icon}</span>
            <span className="truncate">{item.label}</span>
            {item.to === "/integrations" && pending > 0 && (
              <span className="ml-auto rounded-full bg-warning-base px-1.5 py-0.5 text-[10px] font-bold text-white">{pending}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: logout */}
      <div className="flex-shrink-0 px-2 py-3 border-t border-slate-800">
        <button
          onClick={() => { clearAccessToken(); navigate("/login"); }}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-all duration-150"
        >
          <LogOut size={15} className="flex-shrink-0" />
          <span>Log out</span>
        </button>
      </div>
    </div>
  );
}

// ── Root layout ──────────────────────────────────────────────────────────────
export default function AppLayout({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname);
  useMobileTables();

  return (
    <div className="flex min-h-screen bg-surface-50">

      {/* ── Desktop sidebar (fixed) ──────────────────────────────── */}
      <aside className={`hidden lg:flex lg:flex-col ${SIDEBAR_W} flex-shrink-0 fixed inset-y-0 left-0 bg-slate-900 z-30`}>
        <SidebarContent />
      </aside>

      {/* ── Mobile drawer ──────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className={`absolute inset-y-0 left-0 ${SIDEBAR_W} bg-slate-900 shadow-2xl animate-slide-in-left`}>
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-4 right-3 p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
            <SidebarContent onLinkClick={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Main column ────────────────────────────────────────────── */}
      <div className={`flex flex-1 flex-col min-w-0 ${SIDEBAR_PL}`}>

        {/* ── Top navigation bar ─────────────────────────────────── */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-surface-200 bg-white/95 backdrop-blur-sm px-4 lg:px-6 flex-shrink-0">

          {/* Mobile: hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden p-2 -ml-1 rounded-md text-surface-500 hover:bg-surface-100 hover:text-surface-700 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          {/* Left: page title */}
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm font-semibold text-surface-800 truncate hidden lg:block">
              {pageTitle}
            </h1>
            {/* Mobile: brand + admin badge */}
            <Link to="/tenants" className="flex items-center gap-2 lg:hidden">
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="LeadBangla" className="h-4 w-auto" />
              <span className="text-[10px] font-semibold bg-surface-100 text-surface-500 px-1.5 py-0.5 rounded-full">Admin</span>
            </Link>
          </div>

          {/* Spacer */}
          <div className="flex-1" />
        </header>

        {/* ── Page content ───────────────────────────────────────── */}
        <main className="flex-1 p-3 sm:p-5 lg:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}
