import { Link } from "react-router-dom";

/** limit: -1 = unlimited, 0 = not included in the plan. */
export function usageState(used: number, limit: number) {
  const unlimited = limit < 0;
  const included = limit !== 0;
  const left = unlimited ? Infinity : Math.max(0, limit - used);
  const pct = unlimited ? 0 : included ? Math.min(100, (used / limit) * 100) : 100;
  const tone = !included ? "muted" : unlimited ? "ok" : pct >= 100 ? "full" : pct >= 80 ? "warn" : "ok";
  return { unlimited, included, left, pct, tone } as const;
}

const BAR = { ok: "bg-success-base", warn: "bg-warning-base", full: "bg-danger-base", muted: "bg-surface-300" } as const;
const TEXT = { ok: "text-surface-600", warn: "text-warning-dark", full: "text-danger-dark", muted: "text-surface-400" } as const;

export function UsageMeter({ label, used, limit, resets, compact = false }: { label: string; used: number; limit: number; resets?: string | null; compact?: boolean }) {
  const s = usageState(used, limit);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className={`${compact ? "text-xs" : "text-sm"} font-medium text-surface-700`}>{label}</span>
        <span className={`text-xs ${TEXT[s.tone]}`}>
          {!s.included ? "Not in your plan" : s.unlimited ? `${used.toLocaleString()} used · Unlimited` : s.left === 0 ? "Limit reached" : `${s.left.toLocaleString()} left`}
        </span>
      </div>
      <div className={`${compact ? "h-1.5" : "h-2"} overflow-hidden rounded-full bg-surface-100`}>
        <div className={`h-full rounded-full transition-all ${BAR[s.tone]}`} style={{ width: `${s.unlimited ? 4 : s.pct}%` }} />
      </div>
      {!compact && (
        <div className="mt-1 flex justify-between text-[11px] text-surface-400">
          <span>{s.included && !s.unlimited ? `${used.toLocaleString()} of ${limit.toLocaleString()} used` : ""}</span>
          <span>{resets && s.included ? `Resets ${new Date(resets).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</span>
        </div>
      )}
      {s.tone === "full" && !compact && <Link to="/pick-plan" className="mt-1 inline-block text-xs font-medium text-brand-600 hover:text-brand-700">Upgrade for more →</Link>}
    </div>
  );
}
