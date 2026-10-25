import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Ban, CheckCircle2, Copy, Send, Users, XCircle } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import Badge from "../../components/Badge";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Spinner from "../../components/Spinner";
import PhonePreview from "./PhonePreview";
import ConfirmSendModal from "./ConfirmSendModal";
import { fetchSmsCampaign, fetchSmsCampaignEvents, sendSmsCampaign, type SmsCampaign, type SmsCampaignEvents } from "../../lib/sms";
import { fetchSegments, type Segment } from "../../lib/audience";
import { fetchMergeTags } from "../../lib/mergeTags";
import { fillSample } from "../../lib/emailTemplates";
import { CHANNELS, smsParts } from "../../lib/messaging";
import { useNavigate } from "react-router-dom";
import { useWallet } from "./useWallet";
import { STATUS_BADGE, formatDate } from "./shared";

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<SmsCampaign | null>(null);
  const [events, setEvents] = useState<SmsCampaignEvents | null>(null);
  const [segment, setSegment] = useState<Segment | null>(null);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"sent" | "failed" | "skipped">("sent");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const wallet = useWallet(campaign?.channel ?? "sms");

  const load = () => {
    if (!id) return Promise.resolve();
    return Promise.all([fetchSmsCampaign(id), fetchSmsCampaignEvents(id)]).then(([c, e]) => { setCampaign(c); setEvents(e); });
  };

  useEffect(() => {
    load().catch(() => setError("Failed to load campaign"));
    fetchMergeTags().then((t) => setCustom(Object.fromEntries(t.map((x) => [x.key, x.value])))).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (campaign?.segment_id) fetchSegments().then((s) => setSegment(s.find((x) => x.id === campaign.segment_id) ?? null)).catch(() => undefined);
  }, [campaign?.segment_id]);

  // Live progress while sending (also after a refresh).
  useEffect(() => {
    if (campaign?.status !== "sending") return;
    const t = setInterval(() => { load().catch(() => undefined); }, 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.status]);

  async function doSend() {
    if (!id) return;
    setBusy(true);
    try { setCampaign(await sendSmsCampaign(id)); setConfirm(false); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to send"); setConfirm(false); }
    finally { setBusy(false); }
  }

  if (error && !campaign) return <AppLayout><Alert variant="error" className="max-w-lg">{error}</Alert></AppLayout>;
  if (!campaign || !events) return <AppLayout><div className="py-16 flex justify-center"><Spinner size="lg" /></div></AppLayout>;

  const cfg = CHANNELS[campaign.channel];
  const isSms = campaign.channel === "sms";
  const done = campaign.sent_count + campaign.failed_count + campaign.skipped_count;
  const total = segment?.contact_count ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const failedRows = events.sent_and_failed.filter((e) => e.type === "failed");
  const sentRows = events.sent_and_failed.filter((e) => e.type === "sent");
  const parts = smsParts(campaign.message_body);

  const kpis = [
    { label: "Delivered", n: campaign.sent_count, icon: <CheckCircle2 size={18} />, chip: "text-success-dark bg-success-light" },
    { label: "Failed", n: campaign.failed_count, icon: <XCircle size={18} />, chip: campaign.failed_count ? "text-danger-dark bg-danger-light" : "text-surface-500 bg-surface-100" },
    { label: "Opted out", n: campaign.skipped_count, icon: <Ban size={18} />, chip: "text-warning-dark bg-warning-light" },
    { label: "Segment size", n: total, icon: <Users size={18} />, chip: cfg.tone },
  ];
  const tabs = [
    { key: "sent" as const, label: "Delivered", n: sentRows.length },
    { key: "failed" as const, label: "Failed", n: failedRows.length },
    { key: "skipped" as const, label: "Opted out", n: events.skipped.length },
  ];
  const rows = tab === "sent" ? sentRows : tab === "failed" ? failedRows : events.skipped;

  return (
    <AppLayout>
      <Link to={`${cfg.path}?tab=campaigns`} className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-brand-600 font-medium mb-2">
        <ArrowLeft size={14} /> {cfg.label} campaigns
      </Link>
      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-3">{error}</Alert>}

      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-surface-900 tracking-tight break-words">{campaign.name}</h1>
            <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${cfg.tone}`}>{cfg.label}</span>
            <Badge variant={STATUS_BADGE[campaign.status]} dot>{campaign.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-surface-500">
            {campaign.sent_at ? `Sent ${formatDate(campaign.sent_at)}` : `Created ${formatDate(campaign.created_at)}`}
            {isSms && <> · Sender <span className="font-mono">{campaign.sender_id === "shared" ? "Shared sender" : campaign.sender_id}</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={<Copy size={14} />} onClick={() => navigate(`${cfg.path}/campaigns/new?from=${campaign.id}`)}>Duplicate</Button>
          {campaign.status === "draft" && <Button icon={<Send size={14} />} onClick={() => setConfirm(true)}>Send campaign</Button>}
        </div>
      </div>

      {campaign.status === "sending" && (
        <Card className="mb-4 !p-3">
          <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-surface-700 mb-2">
            <span className="font-medium flex items-center gap-2"><Spinner size="sm" /> Sending in progress…</span>
            <span className="tabular-nums text-surface-500">{total > 0 ? <>{done.toLocaleString()} of {total.toLocaleString()} · <b className="text-surface-900">{pct}%</b></> : `${done.toLocaleString()} processed`}</span>
          </div>
          <div className="h-2.5 rounded-full bg-surface-100 overflow-hidden"><div className={`h-full rounded-full transition-all duration-500 ${cfg.accent}`} style={{ width: total > 0 ? `${pct}%` : "33%" }} /></div>
          <p className="mt-2 text-xs text-surface-500">You can leave or refresh this page — sending continues in the background.</p>
        </Card>
      )}

      {campaign.status !== "draft" && (
        <Card padding={false} className="mb-4 overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-surface-100">
            {kpis.map((k) => (
              <div key={k.label} className="px-4 py-3 flex items-center gap-3">
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${k.chip}`}>{k.icon}</span>
                <div><p className="text-xs text-surface-500">{k.label}</p><p className="text-xl font-bold text-surface-900 tabular-nums leading-tight">{k.n.toLocaleString()}</p></div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <Card padding={false} className="lg:col-span-2 overflow-hidden min-w-0">
          <div className="px-4 pt-2.5 border-b border-surface-100 flex items-center gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3 pb-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.key ? "border-brand-500 text-brand-600" : "border-transparent text-surface-500 hover:text-surface-800"}`}>
                {t.label}<span className="ml-1.5 text-xs rounded-full bg-surface-100 px-2 py-0.5 text-surface-600">{t.n.toLocaleString()}</span>
              </button>
            ))}
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-surface-500 italic text-center py-12">
              {campaign.status === "draft" ? "Nothing sent yet." : tab === "failed" ? "No failures. 🎉" : "Nothing here."}
            </p>
          ) : (
            <div className="max-h-[480px] overflow-y-auto divide-y divide-surface-100">
              {rows.map((r) => (
                <div key={r.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-sm text-surface-800">{r.phone}</span>
                    <span className="text-xs text-surface-400">{formatDate(r.occurred_at)}</span>
                  </div>
                  {tab === "failed" && (r as { error?: string | null }).error && <p className="mt-0.5 text-xs text-danger-base">{(r as { error?: string | null }).error}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="!p-4 flex flex-col items-center lg:sticky lg:top-0">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3 self-start">Message</p>
          <PhonePreview channel={campaign.channel} body={fillSample(campaign.message_body, custom)} sender={isSms ? (campaign.sender_id === "shared" ? "Shared sender" : campaign.sender_id) : "Your business"} />
          <p className="mt-3 text-[11px] text-surface-400 text-center">
            {isSms ? `${parts.length} characters · ${parts.parts} SMS ${parts.parts === 1 ? "part" : "parts"}` : `${[...campaign.message_body].length} characters`} · sample names shown
          </p>
        </Card>
      </div>

      {confirm && <ConfirmSendModal channel={campaign.channel} campaignName={campaign.name} recipients={segment?.contact_count ?? null} estimate={wallet.rate && segment ? segment.contact_count * (isSms ? Math.max(1, parts.parts) : 1) * wallet.rate : null} balance={wallet.balance} busy={busy} onConfirm={doSend} onClose={() => setConfirm(false)} />}
    </AppLayout>
  );
}
