import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Send, Ban, ShieldCheck, ShieldAlert, Wallet, Pencil, Copy, Trash2, History, Mail, MailOpen, MousePointerClick, CheckCircle2, XCircle, Users, CalendarClock } from "lucide-react";
import CampaignHistoryModal from "./CampaignHistoryModal";
import AppLayout from "../../components/AppLayout";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Badge from "../../components/Badge";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import { useConfirm } from "../../components/ConfirmDialog";
import {
  fetchCampaign, fetchCampaignPrecheck, fetchCampaignEvents, sendCampaign, cancelCampaign, deleteCampaign,
  type Campaign, type CampaignPrecheck, type CampaignEventsResult,
} from "../../lib/campaigns";
import { fetchSegments, type Segment } from "../../lib/audience";
import { fillSample } from "../../lib/emailTemplates";
import { fetchMergeTags } from "../../lib/mergeTags";

const STATUS_BADGE: Record<Campaign["status"], { variant: "default" | "warning" | "success" | "danger"; label: string }> = {
  draft:     { variant: "default", label: "Draft" },
  sending:   { variant: "warning", label: "Sending…" },
  sent:      { variant: "success", label: "Sent" },
  failed:    { variant: "danger",  label: "Failed" },
  cancelled: { variant: "default", label: "Cancelled" },
};

function formatDate(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-BD", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirmAsk = useConfirm();
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [events, setEvents] = useState<CampaignEventsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [previewH, setPreviewH] = useState(200);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [logTab, setLogTab] = useState<"preview" | "sent" | "failed">("preview");
  const [showPrecheck, setShowPrecheck] = useState(false);
  const [precheck, setPrecheck] = useState<CampaignPrecheck | null>(null);
  const [precheckLoading, setPrecheckLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetchMergeTags().then((t) => setCustomValues(Object.fromEntries(t.map((x) => [x.key, x.value])))).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchCampaign(id), fetchSegments()])
      .then(([c, segs]) => { setCampaign(c); setSegments(segs); })
      .catch(() => setError("Failed to load campaign"))
      .finally(() => setLoading(false));
  }, [id]);

  // Poll while sending, so progress and final state update without a refresh.
  useEffect(() => {
    if (!id || campaign?.status !== "sending") return;
    const t = setInterval(() => { fetchCampaign(id).then(setCampaign).catch(() => {}); }, 1200);
    return () => clearInterval(t);
  }, [id, campaign?.status]);

  useEffect(() => {
    if (!id || !campaign || campaign.status === "draft") return;
    fetchCampaignEvents(id).then(setEvents).catch(() => {});
  }, [id, campaign?.status, campaign?.sent_count, campaign?.failed_count]);

  const segment = useMemo(() => segments.find((s) => s.id === campaign?.segment_id) ?? null, [segments, campaign]);

  async function openPrecheck() {
    if (!id) return;
    setShowPrecheck(true);
    setPrecheckLoading(true);
    try {
      setPrecheck(await fetchCampaignPrecheck(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pre-send check");
      setShowPrecheck(false);
    } finally {
      setPrecheckLoading(false);
    }
  }

  async function handleConfirmSend() {
    if (!id) return;
    setSending(true);
    try {
      setCampaign(await sendCampaign(id));
      setShowPrecheck(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send campaign");
    } finally {
      setSending(false);
    }
  }

  async function handleCancel() {
    if (!id) return;
    if (!(await confirmAsk({ title: "Stop sending this campaign?", message: "Contacts who have not been emailed yet will be skipped. Emails already sent are not recalled.", confirmLabel: "Stop sending", tone: "danger" }))) return;
    setCancelling(true);
    try {
      setCampaign(await cancelCampaign(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop campaign");
    } finally {
      setCancelling(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleteBusy(true);
    try {
      await deleteCampaign(id);
      navigate("/campaigns");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete campaign");
      setConfirmDelete(false);
    } finally { setDeleteBusy(false); }
  }


  if (loading) return <AppLayout><div className="flex justify-center py-16"><Spinner size="lg" /></div></AppLayout>;
  if (!campaign) return <AppLayout><Alert variant="error" className="max-w-lg mx-auto mt-16">{error ?? "Campaign not found"}</Alert></AppLayout>;

  const statusMeta = STATUS_BADGE[campaign.status];
  const progressTotal = campaign.total_recipients ?? 0;
  const progressDone = campaign.sent_count + campaign.failed_count;
  const progressPct = progressTotal > 0 ? Math.min(100, Math.round((progressDone / progressTotal) * 100)) : 0;

  const isDraft = campaign.status === "draft";
  const delivered = campaign.sent_count;
  const recipients = campaign.total_recipients ?? segment?.contact_count ?? null;
  const pct = (n: number, of: number) => (of > 0 ? Math.min(100, Math.round((n / of) * 1000) / 10) : 0);

  const rate = (n: number) => (delivered > 0 ? `${pct(n, delivered)}%` : "");
  const kpis = [
    { label: "Delivered", n: delivered, rate: recipients ? `${pct(delivered, recipients)}%` : "", icon: <CheckCircle2 size={18} />, chip: "text-success-dark bg-success-light" },
    { label: "Opens", n: campaign.opened_count, rate: rate(campaign.opened_count), icon: <MailOpen size={18} />, chip: "text-brand-700 bg-brand-50" },
    { label: "Clicks", n: campaign.clicked_count, rate: rate(campaign.clicked_count), icon: <MousePointerClick size={18} />, chip: "text-info-dark bg-info-light" },
    { label: "Failed", n: campaign.failed_count, rate: "", icon: <XCircle size={18} />, chip: campaign.failed_count ? "text-danger-dark bg-danger-light" : "text-surface-500 bg-surface-100" },
  ];

  const details: { icon: ReactNode; label: string; value: ReactNode }[] = [
    { icon: <Users size={15} />, label: "Segment", value: segment ? <Link to="/segments" className="text-brand-600 hover:underline">{segment.name}</Link> : "—" },
    { icon: <Send size={15} />, label: "Recipients", value: recipients !== null ? recipients.toLocaleString() : "—" },
    { icon: <CalendarClock size={15} />, label: "Created", value: formatDate(campaign.created_at) },
    { icon: <CalendarClock size={15} />, label: campaign.status === "cancelled" ? "Stopped" : "Sent", value: formatDate(campaign.sent_at) },
  ];

  const activeTab = isDraft ? "preview" : logTab;
  const logRows = activeTab === "sent" ? events?.sent ?? [] : events?.failed ?? [];
  const tabs: { key: "preview" | "sent" | "failed"; label: string; n: number | null }[] = isDraft
    ? [{ key: "preview", label: "Email preview", n: null }]
    : [
        { key: "preview", label: "Email preview", n: null },
        { key: "sent", label: "Delivered", n: events?.sent.length ?? campaign.sent_count },
        { key: "failed", label: "Failed", n: events?.failed.length ?? campaign.failed_count },
      ];
  const noEngagementYet = !isDraft && campaign.status !== "sending" && campaign.opened_count === 0 && campaign.clicked_count === 0;

  return (
    <AppLayout>
      <div className="w-full">
        <Link to="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-brand-600 font-medium mb-2">
          <ArrowLeft size={14} /> Email Campaigns
        </Link>

        {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-4">{error}</Alert>}

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-surface-900 tracking-tight break-words">{campaign.name}</h1>
              <Badge variant={statusMeta.variant} dot>{statusMeta.label}</Badge>
            </div>
            <p className="mt-1.5 text-sm text-surface-500 flex items-center gap-1.5 flex-wrap">
              <Mail size={14} className="flex-shrink-0" />
              <span className="truncate">{campaign.subject || "No subject"}</span>
              {campaign.sent_at && <span className="text-surface-300">•</span>}
              {campaign.sent_at && <span>{campaign.status === "cancelled" ? "Stopped" : "Sent"} {formatDate(campaign.sent_at)}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <Button size="sm" variant="ghost" icon={<History size={14} />} onClick={() => setShowHistory(true)}>History</Button>
            {campaign.status !== "sending" && (
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} className="text-danger-base hover:bg-danger-light" onClick={() => setConfirmDelete(true)}>Delete</Button>
            )}
            {!isDraft && campaign.status !== "sending" && (
              <Button size="sm" variant="secondary" icon={<Copy size={14} />} title="Sent campaigns can't be edited — make an editable copy" onClick={() => navigate(`/campaigns/new?from=${campaign.id}`)}>Duplicate &amp; edit</Button>
            )}
            {isDraft && (
              <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={() => navigate(`/campaigns/${campaign.id}/edit`)}>Edit</Button>
            )}
            {isDraft && (
              <Button icon={<Send size={14} />} onClick={openPrecheck}>Send campaign</Button>
            )}
            {campaign.status === "sending" && (
              <Button variant="danger" icon={<Ban size={14} />} loading={cancelling} onClick={handleCancel}>Stop sending</Button>
            )}
          </div>
        </div>

        {/* Draft notice */}
        {isDraft && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-brand-100 bg-brand-50/60 p-3">
            <div className="w-9 h-9 rounded-full bg-white text-brand-600 flex items-center justify-center flex-shrink-0 shadow-sm"><Send size={16} /></div>
            <div className="text-sm">
              <p className="font-semibold text-surface-900">Ready when you are</p>
              <p className="text-surface-600 mt-0.5">Check the preview below, then press <strong>Send campaign</strong>. You'll see the cost and your wallet balance before anything goes out.</p>
            </div>
          </div>
        )}

        {/* Live progress */}
        {campaign.status === "sending" && (
          <Card className="mb-4 !p-3">
            <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-surface-700 mb-2">
              <span className="font-medium flex items-center gap-2"><Spinner size="sm" /> {progressTotal > 0 ? "Sending in progress…" : "Preparing to send…"}</span>
              <span className="tabular-nums text-surface-500">
                {progressTotal > 0
                  ? <>{progressDone.toLocaleString()} of {progressTotal.toLocaleString()} · <b className="text-surface-900">{progressPct}%</b></>
                  : "counting recipients"}
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-surface-100 overflow-hidden">
              <div className={`h-full bg-brand-500 rounded-full transition-all duration-500 ${progressTotal > 0 ? "" : "w-1/3 animate-pulse"}`} style={progressTotal > 0 ? { width: `${progressPct}%` } : undefined} />
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-surface-500">
              <span className="text-success-dark">✔ {campaign.sent_count.toLocaleString()} sent</span>
              {campaign.failed_count > 0 && <span className="text-danger-dark">✗ {campaign.failed_count.toLocaleString()} failed</span>}
              <span className="ml-auto">You can leave or refresh this page — sending continues in the background.</span>
            </div>
          </Card>
        )}

        {/* KPI strip */}
        {!isDraft && (
          <Card padding={false} className="mb-4 overflow-hidden">
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-surface-100">
              {kpis.map((k) => (
                <div key={k.label} className="px-4 py-3 flex items-center gap-3">
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${k.chip}`}>{k.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs text-surface-500">{k.label}</p>
                    <p className="flex items-baseline gap-1.5">
                      <span className="text-xl font-bold text-surface-900 tabular-nums leading-tight">{k.n.toLocaleString()}</span>
                      {k.rate && <span className="text-xs font-semibold text-surface-500 tabular-nums">{k.rate}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {noEngagementYet && (
              <p className="px-4 py-2 text-xs text-surface-500 bg-surface-50 border-t border-surface-100">
                Opens and clicks appear here as recipients interact with the email — usually within a few minutes.
              </p>
            )}
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* Main: preview + delivery log in tabs */}
          <Card padding={false} className="lg:col-span-2 overflow-hidden min-w-0">
            <div className="px-4 pt-2.5 border-b border-surface-100 flex items-center gap-1 overflow-x-auto">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setLogTab(t.key)}
                  className={`px-3 pb-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                    activeTab === t.key ? "border-brand-500 text-brand-600" : "border-transparent text-surface-500 hover:text-surface-800"
                  }`}
                >
                  {t.label}
                  {t.n !== null && <span className="ml-1.5 text-xs rounded-full bg-surface-100 px-2 py-0.5 text-surface-600">{t.n.toLocaleString()}</span>}
                </button>
              ))}
            </div>

            {activeTab === "preview" ? (
              <div className="bg-surface-100 p-3 sm:p-4">
                <div className="mx-auto max-w-[640px] rounded-lg bg-white shadow-sm overflow-hidden ring-1 ring-surface-200">
                  <div className="px-4 py-2 border-b border-surface-100 bg-surface-50">
                    <p className="text-[11px] uppercase tracking-wide text-surface-400">Subject</p>
                    <p className="text-sm font-medium text-surface-900">{fillSample(campaign.subject ?? "", customValues) || "—"}</p>
                  </div>
                  {campaign.html_body ? (
                    <iframe
                      title="Email preview"
                      srcDoc={fillSample(campaign.html_body, customValues)}
                      sandbox="allow-same-origin"
                      style={{ height: previewH }}
                      onLoad={(e) => {
                        const h = e.currentTarget.contentDocument?.documentElement?.scrollHeight;
                        if (h) setPreviewH(Math.min(900, Math.max(120, h + 4)));
                      }}
                      className="block w-full bg-white"
                    />
                  ) : (
                    <p className="text-sm text-surface-400 italic text-center py-12">This campaign has no content yet.</p>
                  )}
                </div>
                <p className="mt-2 text-center text-[11px] text-surface-400">Names are shown as samples. Each recipient received their own details.</p>
              </div>
            ) : logRows.length === 0 ? (
              <p className="text-sm text-surface-500 italic text-center py-12">
                {activeTab === "sent" ? "No emails delivered yet." : "No failures. 🎉"}
              </p>
            ) : (
              <div className="max-h-[480px] overflow-y-auto divide-y divide-surface-100">
                {logRows.map((e) => (
                  <div key={e.contact_id} className="px-4 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-surface-800 truncate">{e.email ?? "—"}</span>
                      <span className="text-xs text-surface-400 flex-shrink-0">{formatDate(e.occurred_at)}</span>
                    </div>
                    {activeTab === "failed" && e.error && <p className="text-xs text-danger-base mt-0.5">{e.error}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Side: details */}
          <Card className="!p-4 lg:sticky lg:top-0">
            <h2 className="text-sm font-semibold text-surface-700">Details</h2>
            <dl className="divide-y divide-surface-100">
              {details.map((d) => (
                <div key={d.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <dt className="flex items-center gap-2 text-surface-500">{d.icon}{d.label}</dt>
                  <dd className="font-medium text-surface-800 text-right">{d.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      {showHistory && id && (
        <CampaignHistoryModal
          campaignId={id}
          campaignLabel={campaign.name}
          canRestore={campaign.status === "draft"}
          onClose={() => setShowHistory(false)}
          onRestored={setCampaign}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-surface-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirmDelete(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-surface-900">Delete “{campaign.name}”?</h2>
            <p className="text-sm text-surface-600 mt-2">
              It moves to the trash and its history is kept. You can restore it any time from <strong>Trash</strong>.
              {campaign.status === "sent" && " Emails already sent are not recalled."}
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button size="sm" variant="danger" loading={deleteBusy} onClick={handleDelete}>Move to trash</Button>
            </div>
          </div>
        </div>
      )}

      {showPrecheck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-slide-up">
            <div className="px-6 py-4 border-b border-surface-100">
              <h2 className="font-semibold text-surface-900">Confirm Send</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              {precheckLoading || !precheck ? (
                <div className="flex justify-center py-8"><Spinner size="md" /></div>
              ) : (
                <>
                  <div className={`rounded-md border p-3 flex items-start gap-2.5 ${precheck.connection_ok ? "border-success-base/30 bg-success-light" : "border-warning-base/30 bg-warning-light"}`}>
                    {precheck.connection_ok
                      ? <ShieldCheck size={16} className="text-success-base flex-shrink-0 mt-0.5" />
                      : <ShieldAlert size={16} className="text-warning-base flex-shrink-0 mt-0.5" />}
                    <p className="text-xs text-surface-700">{precheck.connection_note}</p>
                  </div>

                  {precheck.sender_warning && (
                    <div className="rounded-md border border-warning-base/30 bg-warning-light p-3 text-xs text-warning-dark">{precheck.sender_warning}</div>
                  )}
                  {precheck.compliance_warning && (
                    <div className="rounded-md border border-warning-base/30 bg-warning-light p-3 text-xs text-warning-dark">
                      {precheck.compliance_warning} <Link to="/settings" className="underline font-medium">Open settings</Link>
                    </div>
                  )}
                  {precheck.excluded_count > 0 && (
                    <div className="rounded-md border border-surface-200 bg-surface-50 p-3 text-xs text-surface-700">
                      <b>{precheck.excluded_count}</b> of {precheck.recipient_count} recipients will be skipped because they unsubscribed or an earlier email bounced.{" "}
                      <Link to="/campaigns/suppressed" className="text-brand-600 underline font-medium">View the list</Link>
                    </div>
                  )}
                  <p className="text-[11px] text-surface-500">Every email gets your business name, address and an unsubscribe link at the bottom automatically.</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-surface-500">From</span>
                      <span className="font-medium text-surface-800">{precheck.from_email ?? "Platform default address"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-surface-500">Recipients</span>
                      <span className="font-medium text-surface-800">{precheck.recipient_count}</span>
                    </div>
                        <div className="flex justify-between">
                          <span className="text-surface-500">Free this month</span>
                          <span className="font-medium text-surface-800">{precheck.free_remaining === -1 ? "Unlimited" : precheck.free_remaining}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-surface-500">Billable (overage)</span>
                          <span className="font-medium text-surface-800">{precheck.billable_count}</span>
                        </div>
                        <div className="flex justify-between border-t border-surface-100 pt-2">
                          <span className="text-surface-600 font-medium">Estimated cost</span>
                          <span className="font-semibold text-surface-900">৳{precheck.estimated_cost_bdt.toFixed(2)}</span>
                        </div>
                  </div>

                  <div className={`rounded-md border p-3 flex items-start gap-2.5 ${precheck.sufficient_balance ? "border-surface-200 bg-surface-50" : "border-danger-base/30 bg-danger-light"}`}>
                    <Wallet size={16} className={`flex-shrink-0 mt-0.5 ${precheck.sufficient_balance ? "text-surface-500" : "text-danger-base"}`} />
                    <p className="text-xs text-surface-700">
                      Wallet balance: ৳{precheck.wallet_balance_bdt.toFixed(2)}.{" "}
                      {precheck.sufficient_balance
                        ? "Sufficient to cover this send."
                        : "This may not cover the full send — some emails could fail once the balance runs out."}
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-surface-100 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowPrecheck(false)}>Cancel</Button>
              <Button size="sm" loading={sending} disabled={precheckLoading || !precheck} onClick={handleConfirmSend}>
                Confirm & Send
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
