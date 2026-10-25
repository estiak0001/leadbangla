import { useEffect, useState } from "react";
import { BadgeDollarSign, Mail, MessageSquare, Share2, Calendar } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Card from "../../components/Card";
import Badge from "../../components/Badge";
import Alert from "../../components/Alert";
import PageHeader from "../../components/PageHeader";
import Spinner from "../../components/Spinner";
import Button from "../../components/Button";
import {
  fetchCrossChannel,
  type ActivityEntry, type CrossChannelAnalytics,
  type EmailSummary, type PaidAdsSummary, type SmsSummary, type SocialSummary,
} from "../../lib/analytics";

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("en-BD", { year: "numeric", month: "short", day: "numeric" }); }
function pct(n: number) { return `${n.toFixed(1)}%`; }

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 text-sm">
      <span className="text-surface-500">{label}</span>
      <span className="font-semibold text-surface-800">{value}</span>
    </div>
  );
}

function ChannelCard({ icon, title, color, dot, children }: {
  icon: React.ReactNode; title: string; color: string; dot: string; children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <div className={`flex h-8 w-8 items-center justify-center rounded-md ${color}`}>{icon}</div>
        <h3 className="font-semibold text-surface-800">{title}</h3>
        <span className={`ml-auto status-dot ${dot}`} />
      </div>
      <div className="divide-y divide-surface-100">{children}</div>
    </Card>
  );
}

function EmailCard({ data }: { data: EmailSummary }) {
  return (
    <ChannelCard icon={<Mail size={16} className="text-blue-600" />} title="Email" color="bg-blue-50" dot="bg-blue-500">
      <StatRow label="Sent" value={data.total_sent.toLocaleString()} />
      <StatRow label="Opened" value={data.total_opened.toLocaleString()} />
      <StatRow label="Clicked" value={data.total_clicked.toLocaleString()} />
      <StatRow label="Open rate" value={pct(data.open_rate)} />
      <StatRow label="Click rate" value={pct(data.click_rate)} />
      {data.total_sent > 0 && <div className="pt-3"><Bar value={data.open_rate} color="bg-blue-500" /></div>}
    </ChannelCard>
  );
}

function SmsCard({ data }: { data: SmsSummary }) {
  return (
    <ChannelCard icon={<MessageSquare size={16} className="text-emerald-600" />} title="SMS" color="bg-emerald-50" dot="bg-emerald-500">
      <StatRow label="Sent" value={data.total_sent.toLocaleString()} />
      <StatRow label="Delivered" value={data.total_delivered.toLocaleString()} />
      <StatRow label="Failed" value={data.total_failed.toLocaleString()} />
      <StatRow label="Delivery rate" value={pct(data.delivery_rate)} />
      {data.total_sent > 0 && <div className="pt-3"><Bar value={data.delivery_rate} color="bg-emerald-500" /></div>}
    </ChannelCard>
  );
}

function SocialCard({ data }: { data: SocialSummary }) {
  const PLATFORM_COLORS: Record<string, string> = { facebook: "bg-blue-600", instagram: "bg-pink-500", linkedin: "bg-sky-700" };
  const total = data.posts_published;
  return (
    <ChannelCard icon={<Share2 size={16} className="text-purple-600" />} title="Social" color="bg-purple-50" dot="bg-purple-500">
      <StatRow label="Published" value={total} />
      <StatRow label="Likes" value={data.total_likes.toLocaleString()} />
      <StatRow label="Shares" value={data.total_shares.toLocaleString()} />
      <StatRow label="Comments" value={data.total_comments.toLocaleString()} />
      {Object.keys(data.by_platform).length > 0 && (
        <div className="pt-3 space-y-2">
          {Object.entries(data.by_platform).map(([plat, cnt]) => (
            <div key={plat} className="flex items-center gap-2">
              <span className={`status-dot ${PLATFORM_COLORS[plat] ?? "bg-surface-400"}`} />
              <span className="text-xs text-surface-500 capitalize flex-1">{plat}</span>
              <span className="text-xs font-semibold text-surface-700">{cnt}</span>
              <div className="w-12 h-1.5 bg-surface-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${PLATFORM_COLORS[plat] ?? "bg-surface-400"}`} style={{ width: total > 0 ? `${(cnt / total) * 100}%` : "0%" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </ChannelCard>
  );
}

function PaidAdsCard({ data }: { data: PaidAdsSummary }) {
  return (
    <ChannelCard icon={<BadgeDollarSign size={16} className="text-orange-600" />} title="Paid Ads" color="bg-orange-50" dot="bg-orange-500">
      <StatRow label="Accounts" value={data.accounts_connected} />
      <StatRow label="Active Campaigns" value={data.campaigns_active} />
      <StatRow label="Total Spend" value={`$${data.total_spend.toFixed(2)}`} />
      <StatRow label="Impressions" value={data.total_impressions.toLocaleString()} />
      <StatRow label="Clicks" value={data.total_clicks.toLocaleString()} />
      <StatRow label="Avg CTR" value={`${data.avg_ctr.toFixed(2)}%`} />
      {data.total_impressions > 0 && <div className="pt-3"><Bar value={data.avg_ctr} color="bg-orange-500" /></div>}
    </ChannelCard>
  );
}

const CHANNEL_BADGE: Record<string, "info" | "success" | "primary" | "warning"> = {
  email: "info", sms: "success", social: "primary", paid_ads: "warning",
};

function ActivityTable({ rows }: { rows: ActivityEntry[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <p className="py-10 text-center text-sm text-surface-600 italic">No campaign activity in this date range.</p>
      </Card>
    );
  }
  return (
    <Card padding={false} className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-surface-200 bg-surface-50">
            <tr>
              {["Channel", "Name", "Date", "Reached", "Primary", "Secondary"].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-surface-600 text-left last:text-right">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {rows.map((r) => (
              <tr key={`${r.channel}-${r.id}`} className="hover:bg-surface-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={CHANNEL_BADGE[r.channel] ?? "default"} size="sm">{r.channel}</Badge>
                    {r.platform && <span className="text-xs text-surface-600 capitalize">{r.platform}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-surface-800 max-w-48 truncate">{r.name}</td>
                <td className="px-4 py-3 text-surface-500 whitespace-nowrap text-xs">{fmtDate(r.date)}</td>
                <td className="px-4 py-3 text-surface-700 text-right">
                  {r.total_reached > 0 ? r.total_reached.toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-surface-500 text-xs mr-1">{r.metric_a_label}</span>
                  <span className="font-semibold text-surface-800">
                    {typeof r.metric_a === "number" && r.metric_a_label.toLowerCase().includes("rate") ? pct(r.metric_a) : r.metric_a}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-surface-500 text-xs mr-1">{r.metric_b_label}</span>
                  <span className="font-semibold text-surface-800">
                    {typeof r.metric_b === "number" && r.metric_b_label.toLowerCase().includes("rate") ? pct(r.metric_b) : r.metric_b}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [fromDate, setFromDate] = useState(daysAgo(30));
  const [toDate, setToDate]   = useState(today());
  const [data, setData]       = useState<CrossChannelAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const load = (from: string, to: string) => {
    setLoading(true);
    setError("");
    fetchCrossChannel(from, to).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(() => { load(fromDate, toDate); }, []);

  const totalActivity = data ? data.email.total_sent + data.sms.total_sent + data.social.posts_published : 0;

  return (
    <AppLayout>
      <PageHeader
        title="Cross-Channel Analytics"
        description="Email, SMS, and Social performance side by side."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { const f = daysAgo(30); const t = today(); setFromDate(f); setToDate(t); load(f, t); }}
              className="text-xs font-medium text-surface-500 hover:text-surface-800 px-3 py-2 rounded-md hover:bg-surface-100 transition-colors"
            >
              Last 30d
            </button>
            <div className="flex items-center gap-1.5 rounded-md border border-surface-200 bg-white px-3 py-1.5">
              <Calendar size={13} className="text-surface-400" />
              <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)}
                className="text-xs text-surface-700 focus:outline-none bg-transparent w-24" />
              <span className="text-xs text-surface-300">—</span>
              <input type="date" value={toDate} min={fromDate} max={today()} onChange={(e) => setToDate(e.target.value)}
                className="text-xs text-surface-700 focus:outline-none bg-transparent w-24" />
            </div>
            <Button size="sm" loading={loading} onClick={() => load(fromDate, toDate)}>Apply</Button>
          </div>
        }
      />

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {data && (
        <>
          {/* KPI summary bar */}
          <Card className="mb-6">
            <div className="flex flex-wrap gap-4 divide-x divide-surface-100">
              {[
                { label: "Total Reached",    value: totalActivity.toLocaleString(), color: "text-surface-900" },
                { label: "Email Open Rate",  value: pct(data.email.open_rate),      color: "text-blue-600" },
                { label: "SMS Delivery",     value: pct(data.sms.delivery_rate),    color: "text-emerald-600" },
                { label: "Social Posts",     value: String(data.social.posts_published), color: "text-purple-600" },
                ...(data.paid_ads ? [{ label: "Ad Spend", value: `$${data.paid_ads.total_spend.toFixed(2)}`, color: "text-orange-600" }] : []),
              ].map((kpi, i) => (
                <div key={kpi.label} className={`${i > 0 ? "pl-6" : ""} flex-1 min-w-28`}>
                  <p className="section-label">{kpi.label}</p>
                  <p className={`mt-1 text-2xl font-bold ${kpi.color} tracking-tight`}>{kpi.value}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Channel cards */}
          <div className={`grid grid-cols-1 gap-4 mb-4 ${data.paid_ads ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
            <EmailCard data={data.email} />
            <SmsCard data={data.sms} />
            <SocialCard data={data.social} />
            {data.paid_ads && <PaidAdsCard data={data.paid_ads} />}
          </div>

          {/* Activity table */}
          <h2 className="section-label mb-3 flex items-center gap-2">
            Activity — {fmtDate(data.date_from)} to {fmtDate(data.date_to)}
            <Badge size="sm">{data.activity.length} items</Badge>
          </h2>
          <ActivityTable rows={data.activity} />
        </>
      )}
    </AppLayout>
  );
}
