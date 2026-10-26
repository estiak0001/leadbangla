import { Lock } from "lucide-react";
import Button from "./Button";

interface Props {
  resource: string; // "contacts" | "workflows" | "landing_pages" | etc.
  current: number;
  limit: number;
  onClose: () => void;
}

const LABELS: Record<string, string> = {
  contacts: "Contacts",
  workflows: "Workflows",
  landing_pages: "Landing Pages",
  team_members: "Team Members",
  emails_monthly: "Monthly Emails",
  social_accounts: "Social Accounts",
  seo_credits: "SEO Credits",
  custom_domain: "Custom Domain",
};

export default function UpgradeLimitModal({ resource, current, limit, onClose }: Props) {
  const label = LABELS[resource] ?? resource;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-md shadow-2xl p-4 max-w-sm w-full animate-slide-up">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-warning-light flex items-center justify-center">
            <Lock size={18} className="text-warning-base" />
          </div>
          <h3 className="font-bold text-surface-900">{label} limit reached</h3>
        </div>
        <p className="text-sm text-surface-600 mb-5">
          You've used {current.toLocaleString()} of {limit.toLocaleString()} {label.toLowerCase()} on your
          current plan. Upgrade to unlock more.
        </p>
        <div className="flex gap-2">
          <a href="/billing?tab=plan" className="flex-1">
            <Button variant="primary" size="md" className="w-full">
              Upgrade Plan
            </Button>
          </a>
          <Button variant="secondary" size="md" onClick={onClose}>
            Later
          </Button>
        </div>
      </div>
    </div>
  );
}
