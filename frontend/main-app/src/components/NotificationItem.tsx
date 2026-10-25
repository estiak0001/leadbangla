import { CheckSquare, Users, UsersRound, Mail, Wallet, ShieldCheck, Bell, type LucideIcon } from "lucide-react";
import { timeAgo, type AppNotification } from "../lib/inbox";

const META: Record<string, { icon: LucideIcon; tile: string }> = {
  tasks: { icon: CheckSquare, tile: "bg-brand-50 text-brand-600" },
  leads: { icon: Users, tile: "bg-success-light text-success-dark" },
  team: { icon: UsersRound, tile: "bg-info-light text-info-dark" },
  campaigns: { icon: Mail, tile: "bg-warning-light text-warning-dark" },
  billing: { icon: Wallet, tile: "bg-danger-light text-danger-dark" },
  account: { icon: ShieldCheck, tile: "bg-surface-100 text-surface-600" },
};

export default function NotificationItem({ n, onClick }: { n: AppNotification; onClick: () => void }) {
  const meta = META[n.category] ?? { icon: Bell, tile: "bg-surface-100 text-surface-600" };
  const Icon = meta.icon;
  return (
    <button type="button" onClick={onClick}
      className={`w-full flex items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-50 ${n.read ? "" : "bg-brand-50/40"}`}>
      <span className={`mt-0.5 w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${meta.tile}`}><Icon size={15} /></span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] leading-snug ${n.read ? "text-surface-700" : "font-semibold text-surface-900"}`}>{n.title}</span>
        {n.body && <span className="block text-xs text-surface-500 mt-0.5 line-clamp-2">{n.body}</span>}
        <span className="block text-[11px] text-surface-400 mt-1">{timeAgo(n.created_at)}</span>
      </span>
      {!n.read && <span className="mt-2 w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" aria-label="Unread" />}
    </button>
  );
}
