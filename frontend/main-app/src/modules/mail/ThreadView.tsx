import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, ArrowLeft, ChevronDown, Download, Forward, Image as ImageIcon, Inbox, MailOpen, Paperclip, Reply, ReplyAll, ShieldAlert, Star, Trash2, UserPlus } from "lucide-react";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import { downloadAttachment, type InboxAddress, type MailMessageView, type MailThreadDetail } from "../../lib/mail";
import type { TeamMember } from "../../lib/team";
import MailComposer from "./MailComposer";
import { avatarColor, fileSize, fullTime, initials, quote, shortTime } from "./mailUtil";

/** Sanitised email HTML in a script-free frame that grows to fit its content. */
function HtmlFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(120);
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;font:14px/1.5 system-ui,sans-serif;color:#1f2937;word-wrap:break-word}a{color:#4f46e5}img{max-width:100%;height:auto}table{max-width:100%}blockquote{margin:0 0 0 .5em;padding-left:.8em;border-left:3px solid #e5e7eb;color:#6b7280}</style></head><body>${html}</body></html>`;
  return <iframe ref={ref} title="Email content" sandbox="allow-same-origin" srcDoc={doc} style={{ height: h }} className="w-full border-0"
    onLoad={() => { const d = ref.current?.contentDocument; if (d) setH(Math.min(Math.max(d.documentElement.scrollHeight, 60), 4000)); }} />;
}

function Verdicts({ m }: { m: MailMessageView }) {
  const issues: string[] = [];
  if (m.virus === "FAIL") issues.push("A virus scan flagged this email — attachments are blocked.");
  if (m.spam === "FAIL") issues.push("Our spam filter flagged this email.");
  if (m.direction === "in" && (m.dmarc === "FAIL" || (m.spf === "FAIL" && m.dkim !== "PASS"))) issues.push("The sender couldn't be verified — it may not really come from who it says.");
  if (!issues.length) return null;
  return <div className="rounded-lg bg-warning-light px-3 py-2 text-xs text-warning-dark space-y-0.5">{issues.map((i) => <p key={i} className="flex gap-1.5"><ShieldAlert size={13} className="flex-shrink-0 mt-px" />{i}</p>)}</div>;
}

function MessageCard({ m, open, onToggle, onLoadImages, imagesLoaded, onError }: {
  m: MailMessageView; open: boolean; onToggle: () => void; onLoadImages: () => void; imagesLoaded: boolean; onError: (s: string) => void;
}) {
  const name = m.from_name || m.from_email;
  return (
    <div className="rounded-xl border border-surface-200 bg-white">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className={`w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 ${avatarColor(m.from_email)}`}>{initials(m.from_name ?? "", m.from_email)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-surface-900 truncate">{name} {m.direction === "out" && <span className="ml-1 text-[10px] font-medium text-brand-700 bg-brand-50 rounded px-1.5 py-0.5">You</span>}</p>
          <p className="text-xs text-surface-500 truncate">{open ? `to ${m.to.map((p) => p.name || p.email).join(", ")}${m.cc.length ? `, cc ${m.cc.map((p) => p.email).join(", ")}` : ""}` : m.text.replace(/\s+/g, " ").slice(0, 110)}</p>
        </div>
        <span className="text-xs text-surface-500 flex-shrink-0" title={fullTime(m.sent_at)}>{shortTime(m.sent_at)}</span>
        <ChevronDown size={14} className={`text-surface-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <Verdicts m={m} />
          {m.status === "failed" && <Alert variant="error">Not delivered: {m.error}</Alert>}
          {m.html ? (
            <>
              {m.has_images && !imagesLoaded && (
                <button type="button" onClick={onLoadImages} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"><ImageIcon size={13} />Pictures are hidden to protect your privacy — show them</button>
              )}
              <HtmlFrame html={m.html} />
            </>
          ) : <pre className="whitespace-pre-wrap break-words font-sans text-sm text-surface-800">{m.text || "(no text)"}</pre>}
          {m.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {m.attachments.map((a) => (
                <button key={a.idx} type="button" onClick={() => downloadAttachment(m.id, a.idx, a.filename).catch((e) => onError(e instanceof Error ? e.message : "Download failed"))}
                  className="inline-flex items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 px-2.5 py-1.5 text-xs text-surface-700 hover:bg-surface-100">
                  <Paperclip size={12} /><span className="max-w-[200px] truncate">{a.filename}</span><span className="text-surface-400">{fileSize(a.size)}</span><Download size={12} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  thread: MailThreadDetail; addresses: InboxAddress[]; members: TeamMember[]; currentUserEmail?: string;
  onBack: () => void;
  onAction: (a: { folder?: string; starred?: boolean; unread?: boolean; assign?: string | null; saveContact?: boolean }) => Promise<void>;
  onLoadImages: () => void; imagesLoaded: boolean; onSent: (threadId: string) => void;
}

export default function ThreadView({ thread, addresses, members, onBack, onAction, onLoadImages, imagesLoaded, onSent }: Props) {
  const [opened, setOpened] = useState<Set<string>>(new Set([thread.messages[thread.messages.length - 1]?.id]));
  const [reply, setReply] = useState<null | "reply" | "all" | "forward">(null);
  const [error, setError] = useState<string | null>(null);
  const last = [...thread.messages].reverse().find((m) => m.direction === "in") ?? thread.messages[thread.messages.length - 1];
  const myAddress = addresses.find((a) => a.id === thread.address_id) ?? addresses.find((a) => a.is_default) ?? addresses[0];
  const mine = new Set(addresses.map((a) => a.email.toLowerCase()));

  useEffect(() => { setOpened(new Set([thread.messages[thread.messages.length - 1]?.id])); setReply(null); }, [thread.id]);

  const run = (a: Parameters<Props["onAction"]>[0]) => onAction(a).catch((e) => setError(e instanceof Error ? e.message : "That didn't work"));
  const inSpam = thread.folder === "spam", inTrash = thread.folder === "trash", archived = thread.folder === "archive";
  const subject = /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`;
  const replyTo = last.direction === "in" ? [last.from_email] : last.to.map((p) => p.email);
  const allCc = [...last.to, ...last.cc].map((p) => p.email).filter((e) => !mine.has(e.toLowerCase()) && !replyTo.includes(e));
  const who = last.from_name || last.from_email;
  const fwdSubject = /^fwd?:/i.test(thread.subject) ? thread.subject : `Fwd: ${thread.subject}`;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-1 border-b border-surface-100 px-3 py-2">
        <button onClick={onBack} aria-label="Back" className="lg:hidden p-1.5 rounded-md hover:bg-surface-100 mr-1"><ArrowLeft size={16} /></button>
        {inSpam ? <Button size="xs" variant="secondary" icon={<Inbox size={13} />} onClick={() => run({ folder: "inbox" })}>Not spam</Button>
          : <>
            {archived ? <Button size="xs" variant="ghost" icon={<Inbox size={13} />} onClick={() => run({ folder: "inbox" })}>Move to inbox</Button>
              : <Button size="xs" variant="ghost" icon={<Archive size={13} />} onClick={() => run({ folder: "archive" })}>Archive</Button>}
            <Button size="xs" variant="ghost" icon={<ShieldAlert size={13} />} onClick={() => run({ folder: "spam" })}>Spam</Button>
          </>}
        {inTrash ? <Button size="xs" variant="ghost" icon={<Inbox size={13} />} onClick={() => run({ folder: "inbox" })}>Restore</Button>
          : <Button size="xs" variant="ghost" icon={<Trash2 size={13} />} onClick={() => run({ folder: "trash" })}>Delete</Button>}
        <Button size="xs" variant="ghost" icon={<MailOpen size={13} />} onClick={() => run({ unread: true })}>Mark unread</Button>
        <button onClick={() => run({ starred: !thread.starred })} aria-label={thread.starred ? "Remove star" : "Star"} className="p-1.5 rounded-md hover:bg-surface-100"><Star size={15} className={thread.starred ? "fill-warning-base text-warning-base" : "text-surface-400"} /></button>
        <div className="ml-auto flex items-center gap-2">
          {members.length > 0 && (
            <select value={thread.assigned_to_user_id ?? ""} onChange={(e) => run({ assign: e.target.value || null })} className="rounded-lg border border-surface-200 bg-white px-2 py-1 text-xs text-surface-700" aria-label="Assign to">
              <option value="">Unassigned</option>
              {members.filter((m) => m.is_active).map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
            </select>
          )}
          {thread.contact ? <Link to={`/contacts/${thread.contact.id}`} className="text-xs font-medium text-brand-600 hover:underline">CRM: {[thread.contact.first_name, thread.contact.last_name].filter(Boolean).join(" ") || thread.contact.email}</Link>
            : <Button size="xs" variant="secondary" icon={<UserPlus size={13} />} onClick={() => run({ saveContact: true })}>Save as contact</Button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
        <h2 className="text-lg font-semibold text-surface-900 break-words">{thread.subject || "(no subject)"}</h2>
        <p className="text-xs text-surface-500 -mt-2">{thread.address ? `to ${thread.address} · ` : ""}{thread.message_count} message{thread.message_count === 1 ? "" : "s"}</p>
        {thread.messages.map((m) => (
          <MessageCard key={m.id} m={m} open={opened.has(m.id)} imagesLoaded={imagesLoaded} onLoadImages={onLoadImages} onError={setError}
            onToggle={() => setOpened((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })} />
        ))}
        {reply ? (
          <MailComposer compact addresses={addresses} defaultAddressId={myAddress?.id} threadId={reply === "forward" ? undefined : thread.id} initialSubject={reply === "forward" ? fwdSubject : subject}
            initialTo={reply === "forward" ? [] : replyTo} initialCc={reply === "all" ? allCc : []} initialBody={reply === "forward" ? `\n\n---------- Forwarded message ----------\nFrom: ${who} <${last.from_email}>\nDate: ${fullTime(last.sent_at)}\nSubject: ${thread.subject}\n\n${last.text}` : quote(last.text, who, last.sent_at)}
            onSent={(id) => { setReply(null); onSent(id); }} onCancel={() => setReply(null)} />
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon={<Reply size={14} />} onClick={() => setReply("reply")}>Reply</Button>
            {allCc.length > 0 && <Button size="sm" variant="ghost" icon={<ReplyAll size={14} />} onClick={() => setReply("all")}>Reply all</Button>}
            <Button size="sm" variant="ghost" icon={<Forward size={14} />} onClick={() => setReply("forward")}>Forward</Button>
          </div>
        )}
      </div>
    </div>
  );
}
