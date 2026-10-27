import { useEffect, useState } from "react";
import { Mail, Smartphone, X, FileClock } from "lucide-react";
import Button from "../../components/Button";
import Alert from "../../components/Alert";
import { fetchSenders, type SenderAddress } from "../../lib/emailDomains";
import { sendContactEmail, sendContactSms } from "../../lib/crm";

interface Props {
  contactId: string;
  contactLabel: string;
  hasEmail: boolean;
  hasSms: boolean;
  onClose: () => void;
  onSent: () => void;
}

interface Draft {
  tab: "email" | "sms";
  senderId: string;
  subject: string;
  bodyHtml: string;
  smsBody: string;
  savedAt: string;
}

const EMPTY_DRAFT = { senderId: "", subject: "", bodyHtml: "", smsBody: "" };

function draftKey(contactId: string): string {
  return `lb_compose_draft_${contactId}`;
}

function loadDraft(contactId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(contactId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function saveDraft(contactId: string, draft: Omit<Draft, "savedAt">): void {
  try {
    const isEmpty = !draft.subject.trim() && !draft.bodyHtml.trim() && !draft.smsBody.trim();
    if (isEmpty) localStorage.removeItem(draftKey(contactId));
    else localStorage.setItem(draftKey(contactId), JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {
    // Best-effort only — a lost draft isn't worth failing the close over.
  }
}

function clearDraft(contactId: string): void {
  try { localStorage.removeItem(draftKey(contactId)); } catch { /* ignore */ }
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

/** Sends a one-off email or SMS to this contact through the org's own verified
 * sender / SMS gateway — not a bulk campaign, and not admin-templated (that's
 * only for LeadBangla's own internal/team communication).
 *
 * Opens on a blank new message every time. If a draft was left from closing
 * without sending, it's offered as a banner to resume (and can be resent) or
 * discard — never silently auto-filled. */
export default function ComposeMessageModal({ contactId, contactLabel, hasEmail, hasSms, onClose, onSent }: Props) {
  const [existingDraft, setExistingDraft] = useState<Draft | null>(() => loadDraft(contactId));

  const [tab, setTab] = useState<"email" | "sms">(hasEmail ? "email" : "sms");
  const [senders, setSenders] = useState<SenderAddress[]>([]);
  const [senderId, setSenderId] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  useEffect(() => {
    if (tab !== "email") return;
    fetchSenders().then((s) => {
      setSenders(s);
      if (!senderId) {
        const def = s.find((x) => x.is_default) ?? s[0];
        if (def) setSenderId(def.id);
      }
    }).catch(() => setError("Could not load your verified senders"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function resumeDraft() {
    if (!existingDraft) return;
    setTab(existingDraft.tab);
    setSenderId(existingDraft.senderId);
    setSubject(existingDraft.subject);
    setBodyHtml(existingDraft.bodyHtml);
    setSmsBody(existingDraft.smsBody);
    setExistingDraft(null);
  }

  function discardDraft() {
    clearDraft(contactId);
    setExistingDraft(null);
  }

  function clearCurrent() {
    setSubject(EMPTY_DRAFT.subject);
    setBodyHtml(EMPTY_DRAFT.bodyHtml);
    setSmsBody(EMPTY_DRAFT.smsBody);
    clearDraft(contactId);
    setExistingDraft(null);
    setDraftSaved(false);
  }

  function handleClose() {
    saveDraft(contactId, { tab, senderId, subject, bodyHtml, smsBody });
    onClose();
  }

  async function handleSend() {
    setError(null);
    setSending(true);
    try {
      if (tab === "email") {
        if (!senderId) { setError("Pick a sender first"); setSending(false); return; }
        await sendContactEmail(contactId, senderId, subject, bodyHtml.replace(/\n/g, "<br>"));
      } else {
        await sendContactSms(contactId, smsBody);
      }
      clearDraft(contactId);
      onSent();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-surface-900">Message {contactLabel}</h2>
            <p className="text-xs text-surface-500 mt-0.5">
              {draftSaved ? "Draft saved — reopen this contact to pick up where you left off." : "Closing without sending keeps this as a draft for this contact."}
            </p>
          </div>
          <button onClick={handleClose} className="text-surface-400 hover:text-surface-600 flex-shrink-0" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {existingDraft && (
          <div className="mt-4 flex items-center gap-3 rounded-md border border-brand-200 bg-brand-50 px-3 py-2.5">
            <FileClock size={16} className="text-brand-600 flex-shrink-0" />
            <p className="flex-1 text-sm text-brand-800">
              You have a saved {existingDraft.tab === "email" ? "email" : "SMS"} draft from {timeAgo(existingDraft.savedAt)}.
            </p>
            <Button size="xs" variant="secondary" onClick={resumeDraft}>Resume</Button>
            <Button size="xs" variant="ghost" onClick={discardDraft}>Discard</Button>
          </div>
        )}

        {hasEmail && hasSms && (
          <div className="flex gap-1 bg-surface-100 p-0.5 rounded-md mt-4 w-fit">
            <button onClick={() => setTab("email")} className={`px-3.5 py-2 rounded text-sm font-medium flex items-center gap-1.5 ${tab === "email" ? "bg-white shadow-sm text-surface-900" : "text-surface-600"}`}>
              <Mail size={14} /> Email
            </button>
            <button onClick={() => setTab("sms")} className={`px-3.5 py-2 rounded text-sm font-medium flex items-center gap-1.5 ${tab === "sms" ? "bg-white shadow-sm text-surface-900" : "text-surface-600"}`}>
              <Smartphone size={14} /> SMS
            </button>
          </div>
        )}

        {error && <Alert variant="error" className="mt-4" onDismiss={() => setError(null)}>{error}</Alert>}

        {tab === "email" ? (
          <div className="space-y-4 mt-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-600">From</label>
              <select value={senderId} onChange={(e) => setSenderId(e.target.value)}
                className="w-full border border-surface-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
                {senders.length === 0 && <option value="">No verified sender yet</option>}
                {senders.map((s) => <option key={s.id} value={s.id}>{s.name ? `${s.name} <${s.email}>` : s.email}</option>)}
              </select>
            </div>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" maxLength={200}
              className="w-full border border-surface-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
            <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={14} placeholder="Write your message…"
              className="w-full border border-surface-200 rounded-md px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
          </div>
        ) : (
          <div className="space-y-2 mt-4">
            <textarea value={smsBody} onChange={(e) => setSmsBody(e.target.value.slice(0, 640))} rows={10} placeholder="Write your SMS…" autoFocus
              className="w-full border border-surface-200 rounded-md px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
            <p className="text-xs text-surface-400 text-right">{smsBody.length}/640</p>
          </div>
        )}

        <div className="flex justify-between items-center gap-2 mt-6">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { saveDraft(contactId, { tab, senderId, subject, bodyHtml, smsBody }); setDraftSaved(true); }}
            >
              Save draft
            </Button>
            <Button size="sm" variant="ghost" onClick={clearCurrent}>Clear</Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={handleClose}>Close</Button>
            <Button size="sm" loading={sending} onClick={handleSend}
              disabled={tab === "email" ? !subject.trim() || !bodyHtml.trim() : !smsBody.trim()}>
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
