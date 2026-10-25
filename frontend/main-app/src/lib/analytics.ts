import { getAccessToken } from "./auth";

export interface CampaignStat {
  id: string;
  name: string;
  status: string;
  sent_count: number;
  opened_count: number;
  clicked_count: number;
  open_rate: number;
  click_rate: number;
}

export interface OrgAnalytics {
  total_contacts: number;
  total_campaigns: number;
  sent_campaigns: number;
  total_sent: number;
  total_opened: number;
  total_clicked: number;
  open_rate: number;
  click_rate: number;
  campaigns: CampaignStat[];
}

export async function fetchAnalytics(): Promise<OrgAnalytics> {
  const res = await fetch("/api/v1/analytics", {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!res.ok) throw new Error("Failed to load analytics");
  return res.json();
}

// ---------------------------------------------------------------------------
// Cross-channel analytics (Step 14)
// ---------------------------------------------------------------------------

export interface EmailSummary {
  campaigns_run: number;
  total_sent: number;
  total_opened: number;
  total_clicked: number;
  open_rate: number;
  click_rate: number;
}

export interface SmsSummary {
  campaigns_run: number;
  total_sent: number;
  total_delivered: number;
  total_failed: number;
  delivery_rate: number;
}

export interface SocialSummary {
  posts_published: number;
  posts_scheduled: number;
  total_likes: number;
  total_shares: number;
  total_comments: number;
  by_platform: Record<string, number>;
}

export interface PaidAdsSummary {
  accounts_connected: number;
  campaigns_active: number;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  avg_ctr: number;
}

export interface ActivityEntry {
  id: string;
  name: string;
  channel: "email" | "sms" | "social" | "paid_ads";
  platform: string | null;
  date: string;
  metric_a_label: string;
  metric_a: number;
  metric_b_label: string;
  metric_b: number;
  total_reached: number;
}

export interface CrossChannelAnalytics {
  date_from: string;
  date_to: string;
  email: EmailSummary;
  sms: SmsSummary;
  social: SocialSummary;
  paid_ads: PaidAdsSummary | null;
  activity: ActivityEntry[];
}

export async function fetchCrossChannel(
  from?: string,
  to?: string,
): Promise<CrossChannelAnalytics> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  const res = await fetch(`/api/v1/analytics/cross-channel${qs ? "?" + qs : ""}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!res.ok) throw new Error("Failed to load cross-channel analytics");
  return res.json();
}
