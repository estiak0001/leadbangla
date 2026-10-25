import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BadgeCheck, FileText, Hash, History, Inbox, LayoutDashboard, MessageCircle, MessageSquare, Plus, Send, Wallet } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import { fetchSmsCampaigns, type SmsCampaign, type SmsChannel } from "../../lib/sms";
import { CHANNELS } from "../../lib/messaging";
import { useWallet } from "./useWallet";
import { useEntitlement } from "./useEntitlement";
import PlanLock from "./PlanLock";
import OverviewTab from "./tabs/OverviewTab";
import CampaignsTab from "./tabs/CampaignsTab";
import TemplatesTab from "./tabs/TemplatesTab";
import HistoryTab from "./tabs/HistoryTab";
import ReceiveTab from "../sms/tabs/ReceiveTab";
import SenderIdTab from "../sms/tabs/SenderIdTab";
import SetupTab from "./tabs/SetupTab";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, channels: ["sms", "whatsapp"] },
  { id: "campaigns", label: "Campaigns", icon: Send, channels: ["sms", "whatsapp"] },
  { id: "templates", label: "Templates", icon: FileText, channels: ["sms", "whatsapp"] },
  { id: "history", label: "Send history", icon: History, channels: ["sms", "whatsapp"] },
  { id: "receive", label: "Replies", icon: Inbox, channels: ["sms"] },
  { id: "sender-id", label: "Sender ID", icon: Hash, channels: ["sms"] },
  { id: "setup", label: "Setup", icon: BadgeCheck, channels: ["whatsapp"] },
] as const;

export default function ChannelPage({ channel }: { channel: SmsChannel }) {
  const cfg = CHANNELS[channel];
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tabs = TABS.filter((t) => (t.channels as readonly string[]).includes(channel));
  const active = tabs.find((t) => t.id === params.get("tab")) ?? tabs[0];

  const [campaigns, setCampaigns] = useState<SmsCampaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchSmsCampaigns()
      .then((all) => setCampaigns(all.filter((c) => c.channel === channel)))
      .catch(() => setError("Failed to load campaigns"));
  }, [channel]);
  useEffect(() => { setCampaigns(null); load(); }, [load]);

  // Keep live progress fresh while anything is sending.
  const anySending = campaigns?.some((c) => c.status === "sending") ?? false;
  useEffect(() => {
    if (!anySending) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [anySending, load]);

  const wallet = useWallet(channel);
  const ent = useEntitlement();
  const allowed = ent ? (channel === "sms" ? ent.sms_enabled : ent.whatsapp_enabled) : true;
  const smsLeftPct = ent && channel === "sms" && ent.monthly_limit > 0 ? Math.min(100, Math.round((ent.used / ent.monthly_limit) * 100)) : 0;
  const lowCredit = wallet.available !== null && wallet.available < 50;
  const Icon = channel === "sms" ? MessageSquare : MessageCircle;

  return (
    <AppLayout>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.tone}`}><Icon size={22} /></span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-surface-900 tracking-tight">{cfg.label}</h1>
            <p className="text-sm text-surface-500">
              {channel === "sms" ? "Reach customers on their phone with short, personal text messages." : "Chat with customers on the app they already use every day."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {wallet.balance !== null && (
            <button onClick={() => navigate("/billing?tab=wallet")} title="Top up wallet"
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition hover:shadow-sm ${lowCredit ? "border-warning-base/40 bg-warning-light" : "border-surface-200 bg-white"}`}>
              <Wallet size={16} className={lowCredit ? "text-warning-dark" : "text-surface-500"} />
              <span className="leading-tight">
                <span className="block text-sm font-semibold text-surface-900">৳{wallet.balance.toFixed(2)}</span>
                <span className="block text-[11px] text-surface-500">{wallet.available !== null ? `≈ ${wallet.available.toLocaleString()} ${cfg.label} available` : "wallet balance"}</span>
              </span>
              <span className="text-xs font-medium text-brand-600 ml-1">Top up</span>
            </button>
          )}
          {ent && channel === "sms" && ent.sms_enabled && (
            <div className="rounded-lg border border-surface-200 bg-white px-3 py-1.5 min-w-[9.5rem]" title="SMS included in your plan this month">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-surface-900 tabular-nums">{ent.used.toLocaleString()}<span className="text-surface-400 font-normal"> / {ent.monthly_limit === -1 ? "∞" : ent.monthly_limit.toLocaleString()}</span></span>
                <span className="text-[11px] text-surface-500">SMS this month</span>
              </div>
              {ent.monthly_limit > 0 && <div className="mt-1 h-1 rounded-full bg-surface-100 overflow-hidden"><div className={`h-full rounded-full ${smsLeftPct >= 90 ? "bg-danger-base" : smsLeftPct >= 70 ? "bg-warning-base" : "bg-sky-500"}`} style={{ width: `${smsLeftPct}%` }} /></div>}
            </div>
          )}
          <Button icon={<Plus size={16} />} disabled={!allowed} onClick={() => navigate(`${cfg.path}/campaigns/new`)}>New campaign</Button>
        </div>
      </div>

      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-3">{error}</Alert>}

      <div className="flex gap-1 border-b border-surface-200 mb-4 overflow-x-auto">
        {tabs.map((t) => {
          const TabIcon = t.icon;
          const on = t.id === active.id;
          return (
            <button key={t.id} onClick={() => setParams(t.id === "overview" ? {} : { tab: t.id })}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${on ? "border-brand-500 text-brand-700" : "border-transparent text-surface-500 hover:text-surface-800"}`}>
              <TabIcon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {!allowed && (
        <div className="mb-4"><PlanLock title={`${cfg.label} isn't in your plan`} message={`Upgrade your plan to send ${cfg.label} campaigns to your customers.`} planName={ent?.plan_name} /></div>
      )}
      {active.id === "overview" && <OverviewTab channel={channel} campaigns={campaigns} />}
      {active.id === "campaigns" && <CampaignsTab channel={channel} campaigns={campaigns} reload={load} />}
      {active.id === "templates" && <TemplatesTab channel={channel} />}
      {active.id === "history" && <HistoryTab channel={channel} campaigns={campaigns} />}
      {active.id === "receive" && <ReceiveTab />}
      {active.id === "sender-id" && <SenderIdTab />}
      {active.id === "setup" && <SetupTab />}
    </AppLayout>
  );
}
