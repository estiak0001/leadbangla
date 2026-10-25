import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Archive, Inbox, Mail, Paperclip, PenSquare, Search, Send, Settings2, ShieldAlert, Star, Trash2, X } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Spinner from "../../components/Spinner";
import {
  assignThread, fetchMailCounts, fetchMailSetup, fetchThread, fetchThreads, markThreadRead, patchThread, saveThreadContact,
  type Folder, type MailCounts, type MailSetup as Setup, type MailThreadDetail, type MailThreadRow,
} from "../../lib/mail";
import { fetchMembers, type TeamMember } from "../../lib/team";
import MailComposer from "./MailComposer";
import MailSetup from "./MailSetup";
import ThreadView from "./ThreadView";
import { avatarColor, initials, shortTime } from "./mailUtil";

const FOLDERS: { key: Folder; label: string; icon: typeof Inbox }[] = [
  { key: "inbox", label: "Inbox", icon: Inbox }, { key: "starred", label: "Starred", icon: Star }, { key: "sent", label: "Sent", icon: Send },
  { key: "archive", label: "Archive", icon: Archive }, { key: "spam", label: "Spam", icon: ShieldAlert }, { key: "trash", label: "Trash", icon: Trash2 },
];

export default function MailPage() {
  const [params, setParams] = useSearchParams();
  const folder = (params.get("folder") as Folder) || "inbox";
  const view = params.get("view") === "setup" ? "setup" : "mail";
  const selected = params.get("t");

  const [setup, setSetup] = useState<Setup | null>(null);
  const [counts, setCounts] = useState<MailCounts | null>(null);
  const [rows, setRows] = useState<MailThreadRow[]>([]);
  const [detail, setDetail] = useState<MailThreadDetail | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "mine">("all");
  const [loading, setLoading] = useState(true);
  const [listBusy, setListBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [imagesFor, setImagesFor] = useState<string | null>(null);
  const qTimer = useRef<number>();

  const set = (patch: Record<string, string | null>) => setParams((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) v === null ? n.delete(k) : n.set(k, v); return n; });

  const loadSetup = useCallback(() => fetchMailSetup().then(setSetup).catch((e) => setError(e.message)), []);
  const loadCounts = useCallback(() => fetchMailCounts().then(setCounts).catch(() => undefined), []);
  const loadList = useCallback(async (silent = false) => {
    if (!silent) setListBusy(true);
    try { setRows(await fetchThreads({ folder, q: q.trim() || undefined, unreadOnly: filter === "unread", assigned: filter === "mine" ? "me" : undefined })); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load mail"); }
    finally { setListBusy(false); }
  }, [folder, q, filter]);

  useEffect(() => { Promise.all([loadSetup(), loadCounts()]).finally(() => setLoading(false)); fetchMembers().then(setMembers).catch(() => undefined); }, [loadSetup, loadCounts]);
  useEffect(() => { window.clearTimeout(qTimer.current); qTimer.current = window.setTimeout(() => { loadList(); }, q ? 300 : 0); return () => window.clearTimeout(qTimer.current); }, [loadList, q]);
  useEffect(() => { const t = setInterval(() => { loadList(true); loadCounts(); }, 30000); return () => clearInterval(t); }, [loadList, loadCounts]);

  const openThread = useCallback(async (id: string, images = false) => {
    try {
      const d = await fetchThread(id, images); setDetail(d);
      if (d.unread_count > 0) { await markThreadRead(id); setRows((r) => r.map((x) => (x.id === id ? { ...x, unread_count: 0 } : x))); loadCounts(); }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not open this message"); set({ t: null }); }
  }, [loadCounts]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selected) { setImagesFor(null); openThread(selected); } else setDetail(null); }, [selected, openThread]);

  async function act(a: { folder?: string; starred?: boolean; unread?: boolean; assign?: string | null; saveContact?: boolean }) {
    if (!detail) return;
    const id = detail.id;
    if (a.unread) { await markThreadRead(id, false); set({ t: null }); }
    else if (a.assign !== undefined) await assignThread(id, a.assign);
    else if (a.saveContact) { await saveThreadContact(id); setNotice("Saved to your contacts."); }
    else {
      await patchThread(id, { folder: a.folder, starred: a.starred });
      if (a.folder && a.folder !== detail.folder) { setNotice(a.folder === "trash" ? "Moved to Trash." : a.folder === "archive" ? "Archived." : a.folder === "spam" ? "Marked as spam." : "Moved to Inbox."); set({ t: null }); }
    }
    await Promise.all([loadList(true), loadCounts()]);
    if (!a.unread && !(a.folder && a.folder !== detail.folder)) await openThread(id, imagesFor === id);
  }

  const noInbox = !setup || !setup.domains.some((d) => d.status !== "disabled") || !setup.addresses.length;
  const unreadTotal = counts?.inbox_unread ?? 0;
  const unreadByFolder = useMemo(() => ({ inbox: counts?.inbox_unread ?? 0, spam: counts?.spam_unread ?? 0 } as Record<string, number>), [counts]);

  if (loading) return <AppLayout><div className="flex justify-center py-20"><Spinner size="lg" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-bold text-surface-900 tracking-tight flex items-center gap-2">Inbox {unreadTotal > 0 && <span className="rounded-full bg-brand-500 text-white text-xs font-semibold px-2 py-0.5">{unreadTotal}</span>}</h1>
          <p className="text-sm text-surface-600">Shared email on your own domain — read, answer and follow up in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={view === "setup" ? "primary" : "secondary"} icon={<Settings2 size={14} />} onClick={() => set({ view: view === "setup" ? null : "setup", t: null })}>{view === "setup" ? "Back to inbox" : "Setup"}</Button>
          {view === "mail" && <Button size="sm" icon={<PenSquare size={14} />} onClick={() => (noInbox ? set({ view: "setup" }) : setComposing(true))}>Compose</Button>}
        </div>
      </div>

      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-3">{error}</Alert>}
      {notice && <Alert variant="success" onDismiss={() => setNotice(null)} className="mb-3">{notice}</Alert>}

      {view === "setup" || (noInbox && view === "mail") ? (
        setup && (
          <>
            {noInbox && view === "mail" && <div className="mb-3 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-surface-800">Your inbox isn't set up yet. Follow the steps below — it takes about 5 minutes.</div>}
            <MailSetup setup={setup} onChange={() => { loadSetup(); loadCounts(); }} />
          </>
        )
      ) : (
        <div className="grid lg:grid-cols-[180px_340px_minmax(0,1fr)] gap-3 items-stretch" style={{ minHeight: "calc(100vh - 210px)" }}>
          {/* folders */}
          <nav className={`rounded-xl border border-surface-200 bg-white p-2 space-y-0.5 ${selected ? "hidden lg:block" : ""} lg:self-start`}>
            {FOLDERS.map((f) => {
              const Icon = f.icon, active = folder === f.key, n = unreadByFolder[f.key] ?? 0;
              return (
                <button key={f.key} onClick={() => set({ folder: f.key === "inbox" ? null : f.key, t: null })}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm ${active ? "bg-brand-50 text-brand-700 font-semibold" : "text-surface-700 hover:bg-surface-50"}`}>
                  <Icon size={15} /><span className="flex-1 text-left">{f.label}</span>
                  {n > 0 ? <span className="rounded-full bg-brand-500 text-white text-[10px] font-bold px-1.5">{n}</span> : <span className="text-[11px] text-surface-400">{counts?.folders[f.key] || ""}</span>}
                </button>
              );
            })}
          </nav>

          {/* list */}
          <section className={`rounded-xl border border-surface-200 bg-white flex flex-col min-h-0 ${selected ? "hidden lg:flex" : ""}`}>
            <div className="p-2 border-b border-surface-100 space-y-2">
              <div className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search subject or sender…" className="w-full rounded-lg border border-surface-200 pl-8 pr-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
                {q && <button onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400"><X size={13} /></button>}</div>
              <div className="flex gap-1">{(["all", "unread", "mine"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${filter === f ? "bg-brand-500 text-white" : "bg-surface-100 text-surface-600 hover:bg-surface-200"}`}>{f === "all" ? "All" : f === "unread" ? "Unread" : "Assigned to me"}</button>))}</div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-surface-100" style={{ maxHeight: "calc(100vh - 300px)" }}>
              {listBusy && rows.length === 0 ? <div className="py-10 flex justify-center"><Spinner /></div>
                : rows.length === 0 ? (
                  <div className="py-14 px-6 text-center"><Mail size={26} className="mx-auto text-surface-300 mb-2" /><p className="text-sm font-medium text-surface-700">{q || filter !== "all" ? "Nothing matches" : folder === "inbox" ? "Your inbox is empty" : `No mail in ${folder}`}</p>
                    {folder === "inbox" && !q && filter === "all" && <p className="text-xs text-surface-500 mt-1">New mail to your addresses appears here within a minute.</p>}</div>
                ) : rows.map((t) => {
                  const other = (t.participants.find((p) => !setup?.addresses.some((a) => a.email === p.email)) ?? t.participants[0]) ?? { email: "", name: "" };
                  const unread = t.unread_count > 0;
                  return (
                    <button key={t.id} onClick={() => set({ t: t.id })} className={`w-full text-left px-3 py-2.5 flex gap-2.5 hover:bg-surface-50 ${selected === t.id ? "bg-brand-50/60" : ""}`}>
                      <span className={`w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 ${avatarColor(other.email)}`}>{initials(other.name, other.email)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5"><span className={`text-sm truncate flex-1 ${unread ? "font-bold text-surface-900" : "text-surface-800"}`}>{other.name || other.email}</span><span className="text-[11px] text-surface-500 flex-shrink-0">{shortTime(t.last_message_at)}</span></span>
                        <span className={`block text-xs truncate ${unread ? "font-semibold text-surface-900" : "text-surface-700"}`}>{t.subject || "(no subject)"}</span>
                        <span className="flex items-center gap-1.5 text-xs text-surface-500"><span className="truncate flex-1">{t.snippet}</span>
                          {t.message_count > 1 && <span className="text-[10px] text-surface-400">{t.message_count}</span>}{t.starred && <Star size={11} className="fill-warning-base text-warning-base flex-shrink-0" />}
                          {t.assigned_to_user_id && <span className="text-[10px] rounded bg-surface-100 px-1 flex-shrink-0">assigned</span>}{unread && <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" />}</span>
                      </span>
                    </button>
                  );
                })}
            </div>
          </section>

          {/* reading pane */}
          <section className={`rounded-xl border border-surface-200 bg-white min-h-[320px] ${selected ? "" : "hidden lg:block"}`}>
            {detail ? (
              <ThreadView thread={detail} addresses={setup?.addresses ?? []} members={members} onBack={() => set({ t: null })} onAction={act}
                imagesLoaded={imagesFor === detail.id} onLoadImages={() => { setImagesFor(detail.id); openThread(detail.id, true); }}
                onSent={(id) => { setNotice("Message sent."); set({ t: id }); openThread(id); loadList(true); loadCounts(); }} />
            ) : selected ? <div className="py-16 flex justify-center"><Spinner /></div> : (
              <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center px-6"><Paperclip size={0} /><Mail size={30} className="text-surface-300 mb-2" /><p className="text-sm font-medium text-surface-700">Select a conversation</p><p className="text-xs text-surface-500 mt-1">Pick a message on the left to read and reply.</p></div>
            )}
          </section>
        </div>
      )}

      {composing && setup && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-surface-900/40 backdrop-blur-sm p-0 sm:p-4" onClick={() => setComposing(false)}>
          <div className="w-full sm:max-w-2xl bg-white sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100"><h2 className="text-sm font-semibold text-surface-900">New message</h2><button onClick={() => setComposing(false)} aria-label="Close" className="p-1 rounded-md hover:bg-surface-100"><X size={16} /></button></div>
            <div className="p-4"><MailComposer addresses={setup.addresses} onCancel={() => setComposing(false)} onSent={(id) => { setComposing(false); setNotice("Message sent."); set({ folder: "sent", t: id }); loadList(true); loadCounts(); }} /></div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
