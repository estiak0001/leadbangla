import { useEffect, useState } from "react";
import { X, Plus, Pencil, Trash2, RotateCcw, Undo2, History as HistoryIcon } from "lucide-react";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import {
  fetchContactHistory,
  restoreContactHistory,
  type Contact,
  type ContactHistoryAction,
  type ContactHistoryEntry,
} from "../../lib/audience";
import { confirmText } from "../../components/ConfirmDialog";

interface Props {
  contactId: string;
  contactLabel: string;
  onClose: () => void;
  onRestored: (contact: Contact) => void;
}

const TRACKED_FIELDS = ["email", "phone", "first_name", "last_name", "tags"] as const;
const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  first_name: "First name",
  last_name: "Last name",
  tags: "Tags",
};

const ACTION_META: Record<ContactHistoryAction, { label: string; icon: typeof Plus; dot: string; badge: "success" | "primary" | "danger" | "default" | "warning" }> = {
  created:  { label: "Created",  icon: Plus,        dot: "bg-success-base", badge: "success" },
  updated:  { label: "Updated",  icon: Pencil,       dot: "bg-brand-500",    badge: "primary" },
  deleted:  { label: "Deleted",  icon: Trash2,       dot: "bg-danger-base",  badge: "danger" },
  restored: { label: "Restored", icon: RotateCcw,    dot: "bg-success-base", badge: "success" },
  reverted: { label: "Reverted", icon: Undo2,        dot: "bg-warning-base", badge: "warning" },
};

function formatDate(ts: string): string {
  return new Date(ts).toLocaleString("en-BD", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatValue(v: string | string[] | null): string {
  if (v === null) return "(empty)";
  if (Array.isArray(v)) return v.length > 0 ? v.join(", ") : "(none)";
  return v;
}

function isRestorable(entry: ContactHistoryEntry): boolean {
  return Object.keys(entry.changes).some((f) => (TRACKED_FIELDS as readonly string[]).includes(f));
}

export default function ContactHistoryModal({ contactId, contactLabel, onClose, onRestored }: Props) {
  const [entries, setEntries] = useState<ContactHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetchContactHistory(contactId)
      .then(setEntries)
      .catch(() => setError("Failed to load history"))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [contactId]);

  async function handleRestore(entry: ContactHistoryEntry) {
    if (!(await confirmText("Restore this contact to this earlier version? This will undo the change shown below."))) return;
    setRestoringId(entry.id);
    setError(null);
    try {
      const updated = await restoreContactHistory(contactId, entry.id);
      onRestored(updated);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore this version");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-slide-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
              <HistoryIcon size={16} />
            </div>
            <div>
              <h2 className="font-semibold text-surface-900">Change History</h2>
              <p className="text-xs text-surface-500 truncate max-w-xs">{contactLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600 flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-4">{error}</Alert>}

          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-surface-500 italic text-center py-8">No history recorded yet.</p>
          ) : (
            <div className="space-y-0">
              {entries.map((entry, i) => {
                const meta = ACTION_META[entry.action];
                const Icon = meta.icon;
                const fieldChanges = Object.entries(entry.changes).filter(([f]) => (TRACKED_FIELDS as readonly string[]).includes(f));
                const restorable = isRestorable(entry);
                return (
                  <div key={entry.id} className="flex gap-3">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-white ${meta.dot}`}>
                        <Icon size={13} />
                      </span>
                      {i < entries.length - 1 && <div className="w-px flex-1 bg-surface-200 my-1 min-h-4" />}
                    </div>
                    <div className="pb-5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant={meta.badge} size="sm">{meta.label}</Badge>
                        <span className="text-xs text-surface-500">{formatDate(entry.created_at)}</span>
                      </div>
                      <p className="text-xs text-surface-500 mb-2">
                        by {entry.changed_by_email ?? "unknown user"}
                      </p>

                      {fieldChanges.length > 0 && (
                        <div className="rounded-lg border border-surface-100 bg-surface-50 p-3 space-y-1.5">
                          {fieldChanges.map(([field, change]) => (
                            <div key={field} className="text-xs">
                              <span className="font-medium text-surface-700">{FIELD_LABELS[field] ?? field}: </span>
                              <span className="text-surface-400 line-through">{formatValue(change.old)}</span>
                              <span className="mx-1 text-surface-400">→</span>
                              <span className="text-surface-800 font-medium">{formatValue(change.new)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {entry.action === "deleted" && entry.changes.tag && (
                        <p className="text-xs text-surface-500">Deleted via tag filter: "{formatValue(entry.changes.tag.new)}"</p>
                      )}

                      {restorable && (
                        <div className="mt-2">
                          <Button
                            type="button"
                            size="xs"
                            variant="secondary"
                            icon={<Undo2 size={12} />}
                            loading={restoringId === entry.id}
                            onClick={() => handleRestore(entry)}
                          >
                            Restore this version
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-surface-100 flex justify-end flex-shrink-0">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
