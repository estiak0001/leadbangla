import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Ban, CheckCircle2, Info, Send, ShieldCheck, Wallet, XCircle } from "lucide-react";
import Badge from "../../../components/Badge";
import Card from "../../../components/Card";
import Spinner from "../../../components/Spinner";
import { fetchSmsDashboard, type SmsCampaign, type SmsChannel, type SmsDashboard } from "../../../lib/sms";
import { CHANNELS } from "../../../lib/messaging";
import { STATUS_BADGE, formatDate } from "../shared";

export default function OverviewTab({ channel, campaigns }: { channel: SmsChannel; campaigns: SmsCampaign[] | null }) {
  const cfg = CHANNELS[channel];
  const [dash, setDash] = useState<SmsDashboard | null>(null);
  useEffect(() => { fetchSmsDashboard().then(setDash).catch(() => undefined); }, []);

  if (!campaigns) return <div className="py-16 flex justify-center"><Spinner size="lg" /></div>;

  const sum = (k: "sent_count" | "failed_count" | "skipped_count") => campaigns.reduce((n, c) => n + c[k], 0);
  const spent = dash ? (channel === "sms" ? dash.sms_credits_spent_bdt : dash.whatsapp_credits_spent_bdt) : null;
  const kpis = [
    { label: "Campaigns", value: campaigns.length.toLocaleString(), icon: <Send size={18} />, chip: cfg.tone },
    { label: "Delivered", value: sum("sent_count").toLocaleString(), icon: <CheckCircle2 size={18} />, chip: "text-success-dark bg-success-light" },
    { label: "Failed", value: sum("failed_count").toLocaleString(), icon: <XCircle size={18} />, chip: sum("failed_count") ? "text-danger-dark bg-danger-light" : "text-surface-500 bg-surface-100" },
    { label: "Opted-out skips", value: sum("skipped_count").toLocaleString(), icon: <Ban size={18} />, chip: "text-warning-dark bg-warning-light" },
    { label: "Credits spent", value: spent === null ? "—" : `৳${spent.toFixed(2)}`, icon: <Wallet size={18} />, chip: "text-brand-700 bg-brand-50" },
  ];
  const recent = campaigns.slice(0, 5);

  return (
    <div className="space-y-4">
      <Card padding={false} className="overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 divide-surface-100">
          {kpis.map((k) => (
            <div key={k.label} className="px-4 py-3 flex items-center gap-3">
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${k.chip}`}>{k.icon}</span>
              <div className="min-w-0">
                <p className="text-xs text-surface-500 truncate">{k.label}</p>
                <p className="text-xl font-bold text-surface-900 tabular-nums leading-tight">{k.value}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <Card padding={false} className="lg:col-span-2 overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-surface-700">Recent campaigns</h2>
            <Link to="?tab=campaigns" className="text-xs font-medium text-brand-600 hover:text-brand-700">View all →</Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-surface-500 text-center py-10">No {cfg.label} campaigns yet.</p>
          ) : (
            <div className="divide-y divide-surface-100">
              {recent.map((c) => (
                <Link key={c.id} to={`${cfg.path}/campaigns/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-surface-900 truncate">{c.name}</p>
                    <p className="text-xs text-surface-500 truncate">{c.message_body}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="hidden sm:block text-xs text-surface-400">{formatDate(c.sent_at ?? c.created_at)}</span>
                    <Badge variant={STATUS_BADGE[c.status]} size="sm" dot>{c.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          {channel === "sms" ? (
            <Card className="!p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-surface-800 flex items-center gap-2"><ShieldCheck size={15} className="text-sky-600" /> Masking Sender ID</h3>
                <Badge variant={dash?.sender_id_approved ? "success" : "warning"} size="sm">{dash?.sender_id_approved ? "Approved" : "Pending"}</Badge>
              </div>
              <p className="text-sm text-surface-600">
                {dash?.sender_id ? <>Requested: <span className="font-mono">{dash.sender_id}</span></> : "No Sender ID requested — messages use the platform's shared sender."}
              </p>
              <Link to="?tab=sender-id" className="mt-2 inline-block text-xs font-medium text-brand-600 hover:text-brand-700">Manage Sender ID →</Link>
            </Card>
          ) : (
            <Card className="!p-4">
              <h3 className="text-sm font-semibold text-surface-800 flex items-center gap-2 mb-1"><ShieldCheck size={15} className="text-emerald-600" /> Business number &amp; templates</h3>
              <p className="text-sm text-surface-600">Live WhatsApp sending needs an approved business number, and business-started messages must use an approved template.</p>
              <div className="mt-2 flex gap-4">
                <Link to="?tab=setup" className="text-xs font-medium text-brand-600 hover:text-brand-700">Number setup →</Link>
                <Link to="?tab=templates" className="text-xs font-medium text-brand-600 hover:text-brand-700">Templates →</Link>
              </div>
            </Card>
          )}
          <Card className="!p-4 bg-surface-50">
            <h3 className="text-sm font-semibold text-surface-800 flex items-center gap-2 mb-1"><Info size={15} className="text-surface-500" /> How it works</h3>
            <ul className="text-xs text-surface-600 space-y-1 list-disc pl-4">
              <li>Messages go only to contacts who opted in to {cfg.label}.</li>
              <li>Credits are charged per message from your wallet.</li>
              {channel === "sms" && <li>Promotional SMS: 10:00–17:00. Bangla uses 70 characters per part.</li>}
              {channel === "whatsapp" && <li>Reply within 24 hours to keep a conversation open.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
