import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Mail, Plus, X, Send, BarChart2, Search, Info, ShieldCheck, ShieldAlert,
  Pencil, Copy, Users, ShieldQuestion, Loader2, ListChecks, ChevronRight, Trash2, History, Archive, Globe,
} from "lucide-react";
import CampaignHistoryModal from "./CampaignHistoryModal";
import AppLayout from "../../components/AppLayout";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Alert from "../../components/Alert";
import PageHeader from "../../components/PageHeader";
import {
  deleteCampaign, fetchCampaigns, fetchEmailConnectionStatus,
  type Campaign, type EmailConnectionStatus,
} from "../../lib/campaigns";

const STATUS_OPTIONS = ["all", "draft", "sending", "sent", "failed", "cancelled"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

const STATUS_BADGE: Record<Campaign["status"], { variant: "default" | "warning" | "success" | "danger"; label: string }> = {
  draft:     { variant: "default",  label: "Draft" },
  sending:   { variant: "warning",  label: "Sending…" },
  sent:      { variant: "success",  label: "Sent" },
  failed:    { variant: "danger",   label: "Failed" },
  cancelled: { variant: "default",  label: "Cancelled" },
};

const STATUS_STRIPE: Record<Campaign["status"], string> = {
  draft: "bg-surface-300", sending: "bg-warning-base", sent: "bg-success-base", failed: "bg-danger-base", cancelled: "bg-surface-400",
};

const FLOW_STEPS = [
  { icon: Pencil, title: "Create Draft", desc: "Write your subject line and HTML content." },
  { icon: Users, title: "Choose Segment", desc: "Pick which group of contacts receives it." },
  { icon: ShieldQuestion, title: "Pre-Send Check", desc: "See the cost estimate and confirm your email connection." },
  { icon: Loader2, title: "Sending", desc: "Watch live progress — stop anytime if needed." },
  { icon: ListChecks, title: "Delivered / Failed Report", desc: "Review exactly who received it and who didn't." },
];

function HowItWorksModal({ status, onClose }: { status: EmailConnectionStatus | null; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-slide-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 flex-shrink-0">
          <h2 className="font-semibold text-surface-900">How Email Campaigns Work</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto space-y-5">
          <p className="text-sm text-surface-600">
            Build an email, aim it at a segment of your contacts, and send it — with a cost and connection
            check before anything goes out, and a live delivered/failed report as it runs.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-stretch gap-2">
            {FLOW_STEPS.map((step, i) => (
              <div key={step.title} className="flex sm:flex-1 items-center gap-2">
                <div className="flex-1 rounded-lg border border-surface-200 bg-surface-50 p-3 text-center">
                  <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-2">
                    <step.icon size={16} />
                  </div>
                  <p className="text-xs font-semibold text-surface-800">{step.title}</p>
                  <p className="text-[11px] text-surface-500 mt-1">{step.desc}</p>
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <ChevronRight size={16} className="hidden sm:block text-surface-300 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>

          <div className={`rounded-md border p-3 flex items-start gap-2.5 ${status?.connection_ok ? "border-success-base/30 bg-success-light" : "border-warning-base/30 bg-warning-light"}`}>
            {status?.connection_ok
              ? <ShieldCheck size={16} className="text-success-base flex-shrink-0 mt-0.5" />
              : <ShieldAlert size={16} className="text-warning-base flex-shrink-0 mt-0.5" />}
            <div className="text-xs text-surface-700">
              <p>{status?.connection_note ?? "Checking connection status…"}</p>
              {status && !status.connection_ok && (
                <Link to="/email-setup?tab=sending" className="inline-block mt-1.5 font-medium text-brand-600 hover:text-brand-700">
                  Sending domains →
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-surface-100 flex justify-end flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<EmailConnectionStatus | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const anySending = campaigns.some((c) => c.status === "sending");
  // Keep progress live (also after a refresh) while any campaign is sending.
  useEffect(() => {
    if (!anySending) return;
    const t = setInterval(() => { fetchCampaigns().then(setCampaigns).catch(() => undefined); }, 2000);
    return () => clearInterval(t);
  }, [anySending]);

  useEffect(() => {
    fetchCampaigns().then(setCampaigns).catch(() => setError("Failed to load campaigns"));
    fetchEmailConnectionStatus().then(setConnectionStatus).catch(() => undefined);
  }, []);

  const filteredCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !(c.subject ?? "").toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      return true;
    });
  }, [campaigns, search, statusFilter]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteCampaign(deleting.id);
      setCampaigns((prev) => prev.filter((c) => c.id !== deleting.id));
      setNotice(`“${deleting.name}” moved to trash.`);
      setDeleting(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete campaign");
      setDeleting(null);
    } finally { setDeleteBusy(false); }
  }

  const counts = campaigns.reduce<Record<string, number>>((acc, c) => { acc[c.status] = (acc[c.status] ?? 0) + 1; return acc; }, {});
  const totalSent = campaigns.reduce((n, c) => n + c.sent_count, 0);
  const totalOpened = campaigns.reduce((n, c) => n + c.opened_count, 0);
  const avgOpen = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;

  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== "all";
  function clearFilters() { setSearch(""); setStatusFilter("all"); }

  return (
    <AppLayout>
      <PageHeader
        title="Email Campaigns"
        description="Create and send email campaigns to your segments."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowInfo(true)}
              className="p-2 rounded-md text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
              aria-label="How Email Campaigns work"
              title="How Email Campaigns work"
            >
              <Info size={18} />
            </button>
            <Link to="/email-setup?tab=sending">
              <Button variant="secondary" size="sm" icon={<Globe size={15} />}>Domains</Button>
            </Link>
            <Link to="/campaigns/trash">
              <Button variant="secondary" size="sm" icon={<Archive size={15} />}>Trash</Button>
            </Link>
            <Button icon={<Plus size={16} />} size="sm" onClick={() => navigate("/campaigns/new")}>
              New Campaign
            </Button>
          </div>
        }
      />

      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-4">{error}</Alert>}
      {notice && (
        <Alert variant="success" onDismiss={() => setNotice(null)} className="mb-4">
          {notice} <Link to="/campaigns/trash" className="underline font-medium">Undo in Trash</Link>
        </Alert>
      )}

      {connectionStatus && (
        <button
          type="button"
          onClick={() => setShowInfo(true)}
          className={`mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${connectionStatus.connection_ok ? "border-success-base/30 bg-success-light text-success-dark" : "border-warning-base/30 bg-warning-light text-warning-dark"}`}
        >
          {connectionStatus.connection_ok ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
          {connectionStatus.connection_ok ? connectionStatus.connection_note : "Email not connected — emails cannot be sent"}
          <span className="underline opacity-80">Details</span>
        </button>
      )}

      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Campaigns", value: campaigns.length, icon: Mail, tile: "bg-brand-50 text-brand-600" },
            { label: "Emails sent", value: totalSent.toLocaleString(), icon: Send, tile: "bg-success-light text-success-dark" },
            { label: "Avg. open rate", value: `${avgOpen}%`, icon: BarChart2, tile: "bg-info-light text-info-dark" },
            { label: "Drafts", value: counts.draft ?? 0, icon: Pencil, tile: "bg-surface-100 text-surface-600" },
          ].map((t) => (
            <div key={t.label} className="flex items-center gap-3 rounded-xl border border-surface-200 bg-white px-4 py-3.5 shadow-sm">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${t.tile}`}><t.icon size={18} /></div>
              <div>
                <p className="text-xl font-bold text-surface-900 leading-none">{t.value}</p>
                <p className="text-xs text-surface-600 mt-1">{t.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-surface-200 bg-white py-16 px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-4"><Mail size={26} /></div>
          <h2 className="text-lg font-semibold text-surface-900">Send your first email campaign</h2>
          <p className="text-sm text-surface-600 mt-1 mb-5 max-w-md mx-auto">Pick a segment, write your message, and send it — with a cost check and live delivery report.</p>
          <Button size="sm" icon={<Plus size={15} />} onClick={() => navigate("/campaigns/new")}>New Campaign</Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="relative w-full sm:w-72">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or subject…"
                className="w-full rounded-lg border border-surface-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto bg-surface-100 p-1 rounded-lg">
              {STATUS_OPTIONS.map((st) => {
                const n = st === "all" ? campaigns.length : counts[st] ?? 0;
                return (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${statusFilter === st ? "bg-white shadow-sm text-surface-900" : "text-surface-600 hover:text-surface-900"}`}
                  >
                    {st === "all" ? "All" : STATUS_BADGE[st].label.replace("…", "")} <span className="text-surface-400 ml-0.5">{n}</span>
                  </button>
                );
              })}
            </div>
            {hasActiveFilters && <Button type="button" variant="ghost" size="xs" onClick={clearFilters}>Clear</Button>}
          </div>

          {filteredCampaigns.length === 0 ? (
            <div className="rounded-xl border border-surface-200 bg-white py-14 text-center">
              <Search size={28} className="mx-auto text-surface-300 mb-2" />
              <p className="text-sm font-medium text-surface-700">No matching campaigns</p>
              <Button size="xs" variant="secondary" className="mt-3" onClick={clearFilters}>Clear filters</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {filteredCampaigns.map((c) => {
                const s = STATUS_BADGE[c.status];
                const openRate = c.sent_count > 0 ? Math.round((c.opened_count / c.sent_count) * 100) : 0;
                const clickRate = c.sent_count > 0 ? Math.round((c.clicked_count / c.sent_count) * 100) : 0;
                return (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/campaigns/${c.id}`)}
                    className="group relative flex flex-col overflow-hidden rounded-lg border border-surface-200 bg-white shadow-sm cursor-pointer transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover"
                  >
                    <div className={`h-0.5 ${STATUS_STRIPE[c.status]}`} />
                    <div className="px-3.5 pt-3 pb-2.5 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-surface-900 truncate">{c.name}</h3>
                          <p className="text-xs text-surface-600 truncate">{c.subject || "No subject"}</p>
                        </div>
                        <Badge variant={s.variant} size="sm" dot>{s.label}</Badge>
                      </div>

                      {c.status === "draft" ? (
                        <p className="mt-2.5 text-xs text-surface-500">Not sent yet</p>
                      ) : c.status === "sending" ? (
                        <div className="mt-2.5">
                          {(() => {
                            const total = c.total_recipients ?? 0;
                            const done = c.sent_count + c.failed_count;
                            const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
                            return (
                              <>
                                <div className="flex items-center justify-between text-xs text-surface-600">
                                  <span>{total > 0 ? `${done.toLocaleString()} of ${total.toLocaleString()}` : "Preparing…"}</span>
                                  <b className="text-surface-900">{total > 0 ? `${pct}%` : ""}</b>
                                </div>
                                <div className="mt-1.5 h-1.5 rounded-full bg-surface-100 overflow-hidden">
                                  <div className={`h-full rounded-full bg-brand-500 transition-all duration-500 ${total > 0 ? "" : "w-1/3 animate-pulse"}`} style={total > 0 ? { width: `${pct}%` } : undefined} />
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="mt-2.5">
                          <div className="flex items-center gap-3 text-xs text-surface-600">
                            <span className="inline-flex items-center gap-1"><Send size={11} className="text-surface-400" /><b className="text-surface-900">{c.sent_count.toLocaleString()}</b></span>
                            <span className="inline-flex items-center gap-1"><BarChart2 size={11} className="text-surface-400" /><b className="text-surface-900">{openRate}%</b> opened</span>
                            <span><b className="text-surface-900">{clickRate}%</b> clicked</span>
                            {c.failed_count > 0 && <span className="text-danger-base ml-auto">{c.failed_count} failed</span>}
                          </div>
                          <div className="mt-1.5 h-1 rounded-full bg-surface-100 overflow-hidden"><div className="h-full rounded-full bg-brand-500" style={{ width: `${openRate}%` }} /></div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between border-t border-surface-100 px-3.5 py-1.5">
                      <span className="text-[11px] text-surface-500">
                        {c.sent_at ? "Sent" : "Created"} {new Date(c.sent_at ?? c.created_at).toLocaleDateString("en-BD", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      <div className="flex items-center opacity-60 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        {c.status !== "draft" && c.status !== "sending" && (
                          <button onClick={() => navigate(`/campaigns/new?from=${c.id}`)} title="Duplicate & edit" aria-label={`Duplicate ${c.name}`}
                            className="p-1 rounded text-surface-500 hover:text-brand-600 hover:bg-brand-50"><Copy size={13} /></button>
                        )}
                        {c.status === "draft" && (
                          <button onClick={() => navigate(`/campaigns/${c.id}/edit`)} title="Edit" aria-label={`Edit ${c.name}`}
                            className="p-1 rounded text-surface-500 hover:text-brand-600 hover:bg-brand-50"><Pencil size={13} /></button>
                        )}
                        <button onClick={() => setHistoryFor(c)} title="History" aria-label={`History of ${c.name}`}
                          className="p-1 rounded text-surface-500 hover:text-brand-600 hover:bg-brand-50"><History size={13} /></button>
                        {c.status !== "sending" && (
                          <button onClick={() => setDeleting(c)} title="Delete" aria-label={`Delete ${c.name}`}
                            className="p-1 rounded text-surface-500 hover:text-danger-base hover:bg-danger-light"><Trash2 size={13} /></button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}


      {historyFor && (
        <CampaignHistoryModal
          campaignId={historyFor.id}
          campaignLabel={historyFor.name}
          canRestore={historyFor.status === "draft"}
          onClose={() => setHistoryFor(null)}
          onRestored={(c) => { setCampaigns((prev) => prev.map((x) => (x.id === c.id ? c : x))); setHistoryFor(c); }}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 bg-surface-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleting(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-surface-900">Delete “{deleting.name}”?</h2>
            <p className="text-sm text-surface-600 mt-2">
              It moves to the trash and its history is kept. You can restore it any time from <strong>Trash</strong>.
              {deleting.status === "sent" && " Emails already sent are not recalled."}
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <Button size="sm" variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button size="sm" variant="danger" loading={deleteBusy} onClick={confirmDelete}>Move to trash</Button>
            </div>
          </div>
        </div>
      )}

      {showInfo && <HowItWorksModal status={connectionStatus} onClose={() => setShowInfo(false)} />}
    </AppLayout>
  );
}
