import type { Plan } from "./billing";

export interface PlanFeature { text: string; included: boolean }

const n = (v: number) => v.toLocaleString("en-US");
const count = (v: number | undefined, unit: string) => (v === undefined ? null : v < 0 ? `Unlimited ${unit}` : `${n(v)} ${unit}`);

/** The full feature list for a plan, in the order customers compare them (same data as the marketing site). */
export function planFeatures(p: Plan, on: { whatsapp?: boolean; sms?: boolean } = {}): PlanFeature[] {
  const f: (PlanFeature | null)[] = [
    p.contacts_limit === undefined ? null : { text: count(p.contacts_limit, "contacts")!, included: true },
    p.emails_monthly_limit === undefined ? null : { text: `${p.emails_monthly_limit < 0 ? "Unlimited" : n(p.emails_monthly_limit)} emails per month`, included: true },
    on.sms === false ? null : p.sms_enabled === false || !p.sms_monthly_limit ? { text: "SMS campaigns", included: false }
      : { text: p.sms_monthly_limit < 0 ? "Unlimited SMS (paid from wallet credit)" : `Up to ${n(p.sms_monthly_limit)} SMS per month (paid from wallet credit)`, included: true },
    on.sms === false ? null : { text: "SMS from your own brand name (masking sender ID)", included: !!p.masking_allowed },
    on.whatsapp === false ? null : !p.whatsapp_enabled ? { text: "WhatsApp campaigns", included: false }
      : { text: p.whatsapp_monthly_limit && p.whatsapp_monthly_limit > 0 ? `WhatsApp campaigns · up to ${n(p.whatsapp_monthly_limit)} per month` : "WhatsApp campaigns", included: true },
    p.workflows_limit === undefined ? null : { text: count(p.workflows_limit, "automations")!, included: true },
    p.landing_pages_limit === undefined ? null : { text: count(p.landing_pages_limit, "landing pages")!, included: true },
    p.social_accounts_limit === undefined ? null : { text: count(p.social_accounts_limit, "social accounts")!, included: true },
    p.seo_credits_monthly === undefined ? null : p.seo_credits_monthly > 0 ? { text: `${n(p.seo_credits_monthly)} SEO checks per month`, included: true } : { text: "SEO checks", included: false },
    p.team_members_limit === undefined ? null : { text: count(p.team_members_limit, "team members")!, included: true },
    { text: "Shared inbox on your own domain", included: true },
    { text: "Use your own domain for landing pages", included: !!p.custom_domain },
    { text: p.priority_support ? "Priority support" : "Bangla support", included: true },
  ];
  return f.filter((x): x is PlanFeature => !!x);
}
