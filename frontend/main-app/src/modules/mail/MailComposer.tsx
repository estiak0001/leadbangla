import { KeyboardEvent, useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import { sendMail, uploadMailFile, type InboxAddress } from "../../lib/mail";
import { fileSize, isEmail } from "./mailUtil";

function Recipients({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [bad, setBad] = useState(false);
  function commit(raw = draft) {
    const parts = raw.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return;
    const ok = parts.filter(isEmail);
    setBad(ok.length !== parts.length);
    onChange([...value, ...ok.filter((p) => !value.includes(p))]);
    setDraft(ok.length === parts.length ? "" : parts.filter((p) => !isEmail(p)).join(" "));
  }
  function key(e: KeyboardEvent<HTMLInputElement>) {
    if (["Enter", ",", ";", " ", "Tab"].includes(e.key) && draft.trim()) { e.preventDefault(); commit(); }
    else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
  }
  return (
    <div className="flex items-start gap-2 border-b border-surface-100 py-1.5">
      <span className="w-9 pt-1 text-xs text-surface-500 flex-shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1 flex-1 min-w-0">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-surface-100 pl-2 pr-1 py-0.5 text-xs text-surface-800">{v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-full p-0.5 hover:bg-surface-200"><X size={11} /></button>
          </span>
        ))}
        <input value={draft} onChange={(e) => { setDraft(e.target.value); setBad(false); }} onKeyDown={key} onBlur={() => commit()}
          onPaste={(e) => { const t = e.clipboardData.getData("text"); if (/[,;\s]/.test(t)) { e.preventDefault(); commit(t); } }}
          placeholder={value.length ? "" : "name@example.com"} className={`flex-1 min-w-[140px] bg-transparent text-sm py-0.5 focus:outline-none ${bad ? "text-danger-base" : ""}`} />
      </div>
    </div>
  );
}

interface Props {
  addresses: InboxAddress[];
  defaultAddressId?: string;
  initialTo?: string[]; initialCc?: string[]; initialSubject?: string; initialBody?: string;
  threadId?: string;
  compact?: boolean;                      // inline reply (no subject / from row unless needed)
  onSent: (threadId: string) => void;
  onCancel: () => void;
}

export default function MailComposer({ addresses, defaultAddressId, initialTo = [], initialCc = [], initialSubject = "", initialBody = "", threadId, compact, onSent, onCancel }: Props) {
  const [from, setFrom] = useState(defaultAddressId ?? addresses.find((a) => a.is_default)?.id ?? addresses[0]?.id ?? "");
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState(initialCc);
  const [showCc, setShowCc] = useState(initialCc.length > 0);
  const [subject, setSubject] = useState(initialSubject);
  const [text, setText] = useState(initialBody);
  const [files, setFiles] = useState<{ id: string; filename: string; size: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(list: FileList | null) {
    if (!list) return;
    setUploading(true); setError(null);
    try { const added: { id: string; filename: string; size: number }[] = []; for (const f of Array.from(list)) added.push(await uploadMailFile(f)); setFiles((p) => [...p, ...added]); }
    catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function send() {
    setSending(true); setError(null);
    try {
      const r = await sendMail({ address_id: from, to, cc, subject, text, thread_id: threadId, upload_ids: files.map((f) => f.id) });
      onSent(r.thread_id);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send"); }
    finally { setSending(false); }
  }
  const noAddress = addresses.length === 0;
  return (
    <div className="space-y-2">
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {noAddress && <Alert variant="warning">Create an inbox address first (Setup) — mail is sent from one of your addresses.</Alert>}
      <div className="rounded-xl border border-surface-200 bg-white px-3">
        {(addresses.length > 1 || !compact) && (
          <div className="flex items-center gap-2 border-b border-surface-100 py-1.5">
            <span className="w-9 text-xs text-surface-500">From</span>
            <select value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 bg-transparent text-sm focus:outline-none py-0.5">
              {addresses.map((a) => <option key={a.id} value={a.id}>{a.display_name ? `${a.display_name} <${a.email}>` : a.email}</option>)}
            </select>
          </div>
        )}
        <Recipients label="To" value={to} onChange={setTo} />
        {showCc ? <Recipients label="Cc" value={cc} onChange={setCc} /> : (
          <button type="button" onClick={() => setShowCc(true)} className="text-[11px] text-brand-600 hover:underline py-1 pl-11">Add Cc</button>
        )}
        {!compact && (
          <div className="flex items-center gap-2 border-b border-surface-100 py-1.5">
            <span className="w-9 text-xs text-surface-500">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="flex-1 bg-transparent text-sm focus:outline-none py-0.5" maxLength={500} />
          </div>
        )}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={compact ? 7 : 12} placeholder="Write your message…" autoFocus={compact}
          className="block w-full bg-transparent py-2 text-sm focus:outline-none resize-y" />
      </div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f) => (
            <span key={f.id} className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-surface-50 pl-2 pr-1 py-1 text-xs text-surface-700"><Paperclip size={11} />{f.filename} <span className="text-surface-400">{fileSize(f.size)}</span>
              <button type="button" aria-label="Remove file" onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))} className="rounded p-0.5 hover:bg-surface-200"><X size={11} /></button></span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" icon={<Send size={14} />} loading={sending} disabled={noAddress || !from || to.length === 0 || !text.trim() || uploading} onClick={send}>Send</Button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => pick(e.target.files)} />
        <Button size="sm" variant="ghost" icon={<Paperclip size={14} />} loading={uploading} onClick={() => fileRef.current?.click()}>Attach</Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onCancel}>Discard</Button>
      </div>
    </div>
  );
}
