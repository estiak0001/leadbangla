import { useEffect, useState } from "react";
import { X, Plus, Pencil, Trash2, RotateCcw, Undo2, History as HistoryIcon } from "lucide-react";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import {
  fetchCampaignHistory, restoreCampaignHistory,
  type Campaign, type CampaignHistoryAction, type CampaignHistoryEntry,
} from "../../lib/campaigns";

const FIELD_LABELS: Record<string, string> = {
  name: "Name", subject: "Subject", html_body: "Email body", segment_id: "Segment", sender_id: "Sender",
};

const ACTION_META: Record<CampaignHistoryAction, { label: string; icon: typeof Plus; dot: string; badge: "success" | "primary" | "danger" | "warning" }> = {
  created:  { label: "Created",  icon: Plus,      dot: "bg-success-base", badge: "success" },
  updated:  { label: "Updated",  icon: Pencil,    dot: "bg-brand-500",    badge: "primary" },
  deleted:  { label: "Deleted",  icon: Trash2,    dot: "bg-danger-base",  badge: "danger" },
  restored: { label: "Restored", icon: RotateCcw, dot: "bg-success-base", badge: "success" },
  reverted: { label: "Reverted", icon: Undo2,     dot: "bg-warning-base", badge: "warning" },
};

function formatDate(ts: string): string {
  return new Date(ts).toLocaleString("en-BD", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function show(field: string, v: string | null): string {
  if (v === null || v === "") return "(empty)";
  if (field === "segment_id") return "another segment";
  if (field === "sender_id") return "another sender";
  if (field === "html_body") return v.length > 80 ? `${v.slice(0, 80)}…` : v;
  return v;
}

interface Props {
  campaignId: string;
  campaignLabel: string;
  /** Whether old versions can be restored (only drafts). */
  canRestore: boolean;
  onClose: () => void;
  onRestored: (c: Campaign) => void;
}

export default function CampaignHistoryModal({ campaignId, campaignLabel, canRestore, onClose, onRestored }: Props) {
  const [entries, setEntries] = useState<CampaignHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchCampaignHistory(campaignId).then(setEntries).catch(() => setError("Failed to load history")).finally(() => setLoading(false));
  };
  useEffect(load, [campaignId]);

  async function handleRestore(entry: CampaignHistoryEntry) {
    setConfirmId(null); setBusyId(entry.id); setError(null);
    try {
      onRestored(await restoreCampaignHistory(campaignId, entry.id));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore this version");
    } finally { setBusyId(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-surface-900/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white shadow-2xl w-full max-w-md h-full flex flex-col animate-slide-in-right"
        role="dialog"
        aria-modal="true"
        aria-label="Campaign history"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center"><HistoryIcon size={16} /></div>
            <div>
              <h2 className="text-sm font-semibold text-surface-900">Campaign History</h2>
              <p className="text-xs text-surface-500 truncate max-w-xs">{campaignLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="px-4 py-3 overflow-y-auto flex-1">
          {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-3">{error}</Alert>}
          {!canRestore && <Alert variant="info" className="mb-3">Versions can only be restored while the campaign is a draft.</Alert>}
          {loading ? (
            <div className="flex justify-center py-8"><Spinner size="lg" /></div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-surface-500 italic text-center py-8">No history recorded yet.</p>
          ) : (
            entries.map((entry, i) => {
              const meta = ACTION_META[entry.action];
              const Icon = meta.icon;
              const fields = Object.entries(entry.changes);
              const restorable = canRestore && entry.action === "updated" && fields.length > 0;
              return (
                <div key={entry.id} className="flex gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white ${meta.dot}`}><Icon size={12} /></span>
                    {i < entries.length - 1 && <div className="w-px flex-1 bg-surface-200 my-0.5 min-h-3" />}
                  </div>
                  <div className="pb-3 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={meta.badge} size="sm">{meta.label}</Badge>
                      <span className="text-xs text-surface-500">{formatDate(entry.created_at)}</span>
                    </div>
                    <p className="text-[11px] text-surface-500 mt-0.5 mb-1.5">by {entry.changed_by_email ?? "unknown user"}</p>
                    {entry.action !== "created" && fields.length > 0 && (
                      <div className="rounded-md border border-surface-100 bg-surface-50 px-2.5 py-2 space-y-1">
                        {fields.map(([field, c]) => (
                          <div key={field} className="text-xs break-words">
                            <span className="font-medium text-surface-700">{FIELD_LABELS[field] ?? field}: </span>
                            <span className="text-surface-400 line-through">{show(field, c.old)}</span>
                            <span className="mx-1 text-surface-400">→</span>
                            <span className="text-surface-800 font-medium">{show(field, c.new)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {restorable && (
                      <div className="mt-1.5">
                        {confirmId === entry.id ? (
                          <span className="inline-flex items-center gap-2 text-xs">
                            <span className="text-surface-600">Undo this change?</span>
                            <Button type="button" size="xs" loading={busyId === entry.id} onClick={() => handleRestore(entry)}>Yes, restore</Button>
                            <Button type="button" size="xs" variant="ghost" onClick={() => setConfirmId(null)}>Cancel</Button>
                          </span>
                        ) : (
                          <Button type="button" size="xs" variant="secondary" icon={<Undo2 size={12} />} onClick={() => setConfirmId(entry.id)}>
                            Restore previous version
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="px-4 py-2 border-t border-surface-100 flex justify-end flex-shrink-0">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
