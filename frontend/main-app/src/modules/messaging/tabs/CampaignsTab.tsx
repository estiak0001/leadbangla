import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Plus, Search, Send } from "lucide-react";
import Badge from "../../../components/Badge";
import Button from "../../../components/Button";
import Card from "../../../components/Card";
import Alert from "../../../components/Alert";
import EmptyState from "../../../components/EmptyState";
import { sendSmsCampaign, type SmsCampaign, type SmsChannel } from "../../../lib/sms";
import { CHANNELS } from "../../../lib/messaging";
import ConfirmSendModal from "../ConfirmSendModal";
import { useWallet } from "../useWallet";
import { fetchSegments, type Segment } from "../../../lib/audience";
import { smsParts } from "../../../lib/messaging";
import { STATUS_BADGE, formatDate } from "../shared";

const FILTERS = ["all", "draft", "sending", "sent", "failed"] as const;

export default function CampaignsTab({ channel, campaigns, reload }: { channel: SmsChannel; campaigns: SmsCampaign[] | null; reload: () => void }) {
  const cfg = CHANNELS[channel];
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [confirm, setConfirm] = useState<SmsCampaign | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wallet = useWallet(channel);
  const [segments, setSegments] = useState<Segment[]>([]);
  useEffect(() => { fetchSegments().then(setSegments).catch(() => undefined); }, []);

  const shown = useMemo(
    () => (campaigns ?? []).filter((c) => (filter === "all" || c.status === filter) && (!q.trim() || `${c.name} ${c.message_body}`.toLowerCase().includes(q.toLowerCase()))),
    [campaigns, q, filter],
  );
  const count = (f: string) => (f === "all" ? campaigns?.length ?? 0 : (campaigns ?? []).filter((c) => c.status === f).length);

  async function doSend() {
    if (!confirm) return;
    setBusy(true); setError(null);
    try { await sendSmsCampaign(confirm.id); setConfirm(null); reload(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to send campaign"); setConfirm(null); }
    finally { setBusy(false); }
  }

  if (campaigns && campaigns.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Send size={40} />}
          title={`No ${cfg.label} campaigns yet`}
          description={`Create your first ${cfg.label} campaign to reach opted-in contacts.`}
          action={<Button size="sm" icon={<Plus size={15} />} onClick={() => navigate(`${cfg.path}/campaigns/new`)}>New campaign</Button>}
        />
      </Card>
    );
  }

  return (
    <div>
      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-3">{error}</Alert>}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="relative flex-1 min-w-[12rem] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns…"
            className="w-full rounded-md border border-surface-200 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
        </div>
        <div className="flex gap-1 bg-surface-100 p-0.5 rounded-md overflow-x-auto">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`whitespace-nowrap px-2.5 py-1 rounded text-xs font-medium capitalize ${filter === f ? "bg-white shadow-sm text-surface-900" : "text-surface-600 hover:text-surface-900"}`}>
              {f} <span className="text-surface-400 ml-0.5">{count(f)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {shown.map((c) => {
          const total = c.sent_count + c.failed_count + c.skipped_count;
          return (
            <div key={c.id} onClick={() => navigate(`${cfg.path}/campaigns/${c.id}`)}
              className="group flex flex-col overflow-hidden rounded-lg border border-surface-200 bg-white shadow-sm cursor-pointer transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover">
              <div className={`h-0.5 ${cfg.accent}`} />
              <div className="px-3.5 pt-3 pb-2.5 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-surface-900 truncate">{c.name}</h3>
                  <Badge variant={STATUS_BADGE[c.status]} size="sm" dot>{c.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-surface-600 line-clamp-2 whitespace-pre-line">{c.message_body}</p>
                {c.status === "sending" ? (
                  <div className="mt-2.5">
                    <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden"><div className={`h-full w-1/3 rounded-full animate-pulse ${cfg.accent}`} /></div>
                    <p className="mt-1 text-[11px] text-surface-500">{total.toLocaleString()} processed…</p>
                  </div>
                ) : c.status !== "draft" ? (
                  <div className="mt-2.5 flex items-center gap-3 text-xs">
                    <span className="text-success-dark font-medium">✓ {c.sent_count.toLocaleString()}</span>
                    {c.failed_count > 0 && <span className="text-danger-dark">✗ {c.failed_count.toLocaleString()}</span>}
                    {c.skipped_count > 0 && <span className="text-warning-dark">⊘ {c.skipped_count.toLocaleString()} opted out</span>}
                  </div>
                ) : <p className="mt-2.5 text-xs text-surface-500">Not sent yet</p>}
              </div>
              <div className="flex items-center justify-between border-t border-surface-100 px-3.5 py-1.5" onClick={(e) => e.stopPropagation()}>
                <span className="text-[11px] text-surface-500">{c.sent_at ? "Sent" : "Created"} {formatDate(c.sent_at ?? c.created_at)}</span>
                <div className="flex items-center gap-1">
                  <button title="Duplicate" aria-label="Duplicate" onClick={() => navigate(`${cfg.path}/campaigns/new?from=${c.id}`)} className="p-1 rounded text-surface-400 hover:text-brand-600 hover:bg-brand-50"><Copy size={13} /></button>
                  {c.status === "draft" && <Button size="xs" icon={<Send size={12} />} onClick={() => setConfirm(c)}>Send</Button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {campaigns && shown.length === 0 && <p className="text-center text-sm text-surface-500 py-10">No matching campaigns.</p>}

      {confirm && <ConfirmSendModal channel={channel} campaignName={confirm.name} recipients={segments.find((s) => s.id === confirm.segment_id)?.contact_count ?? null} estimate={wallet.rate ? (segments.find((s) => s.id === confirm.segment_id)?.contact_count ?? 0) * (channel === "sms" ? Math.max(1, smsParts(confirm.message_body).parts) : 1) * wallet.rate : null} balance={wallet.balance} busy={busy} onConfirm={doSend} onClose={() => setConfirm(null)} />}
    </div>
  );
}
