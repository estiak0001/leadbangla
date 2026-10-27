import type { SocialPlatform, SocialPostStatus } from "../../lib/social";

export const PLATFORMS: Record<SocialPlatform, {
  label: string; short: string; tile: string; soft: string; limit: number; needsImage: boolean; textOnly: boolean;
}> = {
  facebook: { label: "Facebook Page", short: "f", tile: "bg-[#1877F2] text-white", soft: "bg-[#1877F2]/10 text-[#1459b8]", limit: 2000, needsImage: false, textOnly: false },
  instagram: { label: "Instagram Business", short: "IG", tile: "bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white", soft: "bg-[#dd2a7b]/10 text-[#b01e62]", limit: 2200, needsImage: true, textOnly: false },
  linkedin: { label: "LinkedIn", short: "in", tile: "bg-[#0A66C2] text-white", soft: "bg-[#0A66C2]/10 text-[#084e96]", limit: 3000, needsImage: false, textOnly: true },
};

export const STATUS_META: Record<SocialPostStatus, { label: string; cls: string; dot: string }> = {
  draft:      { label: "Draft",      cls: "bg-surface-100 text-surface-600",     dot: "bg-surface-400" },
  scheduled:  { label: "Scheduled",  cls: "bg-warning-light text-warning-dark",  dot: "bg-warning-base" },
  publishing: { label: "Publishing", cls: "bg-brand-50 text-brand-700",          dot: "bg-brand-500" },
  published:  { label: "Published",  cls: "bg-success-light text-success-dark",  dot: "bg-success-base" },
  failed:     { label: "Failed",     cls: "bg-danger-light text-danger-dark",    dot: "bg-danger-base" },
};

export function PlatformTile({ platform, size = 32 }: { platform: SocialPlatform; size?: number }) {
  const m = PLATFORMS[platform];
  return (
    <span className={`inline-flex items-center justify-center rounded-lg font-bold flex-shrink-0 ${m.tile}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }} aria-label={m.label}>{m.short}</span>
  );
}

export function StatusPill({ status }: { status: SocialPostStatus }) {
  const m = STATUS_META[status];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${m.cls}`}><span className={`w-1.5 h-1.5 rounded-full ${m.dot} ${status === "publishing" ? "animate-pulse" : ""}`} />{m.label}</span>;
}

export function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ago(iso: string | null): string {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** value for <input type="datetime-local"> in the user's own timezone */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
