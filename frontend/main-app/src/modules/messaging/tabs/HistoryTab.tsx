import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { History, Search } from "lucide-react";
import Alert from "../../../components/Alert";
import Badge from "../../../components/Badge";
import Card from "../../../components/Card";
import EmptyState from "../../../components/EmptyState";
import Spinner from "../../../components/Spinner";
import { fetchSmsHistory, type SmsCampaign, type SmsChannel, type SmsEventItem } from "../../../lib/sms";
import { CHANNELS } from "../../../lib/messaging";
import { formatDate } from "../shared";

export default function HistoryTab({ channel, campaigns }: { channel: SmsChannel; campaigns: SmsCampaign[] | null }) {
  const cfg = CHANNELS[channel];
  const [events, setEvents] = useState<SmsEventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | "sent" | "failed">("all");

  useEffect(() => { fetchSmsHistory().then(setEvents).catch(() => setError("Failed to load history")); }, []);

  const ids = useMemo(() => new Set((campaigns ?? []).map((c) => c.id)), [campaigns]);
  const rows = useMemo(
    () => (events ?? []).filter((e) => ids.has(e.campaign_id) && (type === "all" || e.type === type) && (!q.trim() || e.phone.includes(q.trim()) || e.campaign_name.toLowerCase().includes(q.toLowerCase()))),
    [events, ids, q, type],
  );

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!events || !campaigns) return <div className="py-16 flex justify-center"><Spinner size="lg" /></div>;
  if (events.filter((e) => ids.has(e.campaign_id)).length === 0) {
    return <Card><EmptyState icon={<History size={40} />} title="No sends yet" description={`${cfg.label} messages you send will be listed here.`} /></Card>;
  }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="relative flex-1 min-w-[12rem] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search phone or campaign…"
            className="w-full rounded-md border border-surface-200 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
        </div>
        <div className="flex gap-1 bg-surface-100 p-0.5 rounded-md">
          {(["all", "sent", "failed"] as const).map((t) => (
            <button key={t} onClick={() => setType(t)} className={`px-2.5 py-1 rounded text-xs font-medium capitalize ${type === t ? "bg-white shadow-sm text-surface-900" : "text-surface-600"}`}>{t}</button>
          ))}
        </div>
      </div>
      <Card padding={false} className="overflow-hidden">
        <div className="divide-y divide-surface-100">
          {rows.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0 flex items-center gap-3">
                <Badge variant={e.type === "sent" ? "success" : "danger"} size="sm">{e.type}</Badge>
                <div className="min-w-0">
                  <p className="font-mono text-sm text-surface-800">{e.phone}</p>
                  <Link to={`${cfg.path}/campaigns/${e.campaign_id}`} className="text-xs text-brand-600 hover:underline truncate">{e.campaign_name}</Link>
                </div>
              </div>
              <span className="text-xs text-surface-400 flex-shrink-0">{formatDate(e.occurred_at)}</span>
            </div>
          ))}
          {rows.length === 0 && <p className="text-center text-sm text-surface-500 py-5">No matching messages.</p>}
        </div>
      </Card>
    </div>
  );
}
