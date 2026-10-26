import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet } from "lucide-react";
import { fetchPlanUsage, type PlanUsage } from "../lib/billing";
import { UsageMeter } from "./UsageMeter";

type Key = "contacts" | "emails" | "sms" | "whatsapp" | "workflows" | "landing_pages" | "social" | "team" | "seo" | "wallet";

let cache: { at: number; promise: Promise<PlanUsage> } | null = null;
function loadUsage(): Promise<PlanUsage> {
  if (!cache || Date.now() - cache.at > 30000) {
    const promise = fetchPlanUsage();
    promise.catch(() => { if (cache?.promise === promise) cache = null; });
    cache = { at: Date.now(), promise };
  }
  return cache.promise;
}

/** Slim "what your plan allows and what is left" bar for the page it sits on. Renders nothing if unavailable. */
export default function PlanUsageStrip({ items, className = "mb-4", chip = false }: { items: Key[]; className?: string; chip?: boolean }) {
  const [u, setU] = useState<PlanUsage | null>(null);
  useEffect(() => { let live = true; loadUsage().then((x) => live && setU(x)).catch(() => undefined); return () => { live = false; }; }, []);
  if (!u) return null;

  const meters: Record<Exclude<Key, "wallet">, { label: string; r: { used: number; limit: number } | null | undefined; monthly?: boolean }> = {
    contacts: { label: "Contacts", r: u.contacts },
    emails: { label: "Emails this month", r: u.emails_monthly, monthly: true },
    sms: { label: "SMS this month", r: u.sms_enabled === false ? null : u.sms, monthly: true },
    whatsapp: { label: "WhatsApp this month", r: u.whatsapp_enabled ? u.whatsapp : null, monthly: true },
    workflows: { label: "Workflows", r: u.workflows },
    landing_pages: { label: "Landing pages", r: u.landing_pages },
    social: { label: "Social accounts", r: u.social_accounts },
    team: { label: "Team members", r: u.team_members },
    seo: { label: "SEO checks this month", r: u.seo_credits, monthly: true },
  };
  const shown = items.filter((k) => k === "wallet" || meters[k as Exclude<Key, "wallet">].r);
  if (!shown.length) return null;

  if (chip) {
    const k = shown[0];
    if (!k || k === "wallet") return null;
    const r = meters[k].r!;
    const left = r.limit < 0 ? "Unlimited" : Math.max(0, r.limit - r.used).toLocaleString();
    return (
      <Link to="/billing" title={`${u.plan_name} plan: ${meters[k].label}`} className={`${className} inline-flex items-center gap-1.5 rounded-full border border-surface-200 bg-white px-3 py-1 text-xs text-surface-600 hover:border-brand-200 hover:text-surface-900`}>
        <b className="font-semibold text-surface-900">{left}</b> {k === "emails" ? "emails left" : "left"} <span className="text-surface-300">·</span> {u.plan_name}
      </Link>
    );
  }
  return (
    <div className={`${className} flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-surface-200 bg-white px-4 py-3`}>
      <Link to="/billing" className="text-xs font-semibold text-surface-900 hover:text-brand-700" title="View your plan">{u.plan_name} plan</Link>
      {shown.map((k) =>
        k === "wallet" ? (
          <Link key={k} to="/billing?tab=wallet" className="flex items-center gap-2 text-xs text-surface-700 hover:text-brand-700" title="Top up wallet">
            <Wallet size={14} className="text-surface-500" />
            <span>Wallet <b className="text-surface-900">৳{u.wallet_balance_bdt.toLocaleString("en-BD", { maximumFractionDigits: 2 })}</b></span>
            <span className="font-medium text-brand-600">Top up</span>
          </Link>
        ) : (
          <div key={k} className="min-w-[10rem] flex-1 sm:max-w-[16rem]">
            <UsageMeter compact label={meters[k].label} used={meters[k].r!.used} limit={meters[k].r!.limit} />
          </div>
        ),
      )}
    </div>
  );
}
