import type { SmsCampaignStatus } from "../../lib/sms";

export const STATUS_BADGE: Record<SmsCampaignStatus, "default" | "warning" | "success" | "danger"> = {
  draft: "default", sending: "warning", sent: "success", failed: "danger",
};

export function formatDate(ts: string): string {
  return new Date(ts).toLocaleString("en-BD", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
