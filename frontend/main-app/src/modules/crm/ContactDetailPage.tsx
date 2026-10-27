import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { MapPin, Pencil, History, Mail, Phone, ChevronRight, ChevronDown, MessageSquare, MessageCircle, Trash2, Check, Smartphone, FileText, Zap, StickyNote, Activity, ShieldCheck, Send, type LucideIcon } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Button from "../../components/Button";
import Alert from "../../components/Alert";
import Badge from "../../components/Badge";
import Spinner from "../../components/Spinner";
import {
  createNote, deleteNote, fetchConsent, fetchContactDues, fetchContactTasks, fetchCrmContact, fetchCustomFields, fetchNotes, fetchStages, fetchTeam,
  fetchSettings, fetchTimeline, taka, updateContactStage, whatsappLink,
  type ConsentEntry, type ContactNote, type CrmContact, type CustomField, type PipelineStage, type TeamMember, type TimelineEntry,
} from "../../lib/crm";
import { fetchOrganizationProfile } from "../../lib/organization";
import SalesDetailsCard from "./SalesDetailsCard";
import MapPicker from "../../components/MapPicker";
import { placeLine } from "../../lib/locations";
import FollowUpsCard from "./FollowUpsCard";
import BakiCard from "./BakiCard";
import LostReasonDialog from "./LostReasonDialog";
import { fetchContactSegments, type Segment } from "../../lib/audience";
import ContactHistoryModal from "../audience/ContactHistoryModal";
import ComposeMessageModal from "./ComposeMessageModal";

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email", sms: "SMS", form: "Form", workflow: "Workflow", note: "Note", activity: "Sales activity",
};

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString("en-BD", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const CHANNEL_ICON: Record<string, { icon: LucideIcon; tile: string }> = {
  email:    { icon: Mail,        tile: "bg-info-light text-info-dark" },
  sms:      { icon: Smartphone,  tile: "bg-success-light text-success-dark" },
  form:     { icon: FileText,    tile: "bg-brand-50 text-brand-600" },
  workflow: { icon: Zap,         tile: "bg-warning-light text-warning-dark" },
  note:     { icon: StickyNote,  tile: "bg-surface-100 text-surface-600" },
  activity: { icon: Activity,    tile: "bg-danger-light text-danger-dark" },
};

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-BD", { month: "short", day: "numeric" });
}

function dayLabel(ts: string): string {
  const d = new Date(ts);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(d)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-BD", { weekday: "long", month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const [open, setOpen] = useState(false);
  const meta = CHANNEL_ICON[entry.channel] ?? { icon: MessageSquare, tile: "bg-surface-100 text-surface-600" };
  const Icon = meta.icon;
  const label = CHANNEL_LABEL[entry.channel] ?? entry.channel;
  const expandable = !!entry.detail;

  return (
    <div className="rounded-md border border-surface-200 bg-white transition-all hover:border-brand-200 hover:shadow-card-hover">
      <button
        type="button"
        onClick={() => expandable && setOpen((o) => !o)}
        aria-expanded={expandable ? open : undefined}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left ${expandable ? "cursor-pointer" : "cursor-default"}`}
      >
        <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${meta.tile}`}>
          <Icon size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-surface-900 truncate leading-tight">{entry.title}</p>
          <p className="text-[11px] text-surface-500 leading-tight mt-0.5" title={formatTs(entry.timestamp)}>
            {label} · {relativeTime(entry.timestamp)}
          </p>
        </div>
        {expandable && (
          <ChevronDown size={16} className={`text-surface-400 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180 text-brand-600" : ""}`} />
        )}
      </button>
      {open && entry.detail && (
        <p className="px-3 pb-2.5 pt-0.5 ml-[38px] text-xs text-surface-600 border-t border-surface-100 whitespace-pre-wrap">{entry.detail}</p>
      )}
    </div>
  );
}

function ActivityFeed({ entries }: { entries: TimelineEntry[] }) {
  const groups = useMemo(() => {
    const sorted = [...entries].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
    const map = new Map<string, TimelineEntry[]>();
    for (const e of sorted) {
      const k = dayLabel(e.timestamp);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [entries]);

  return (
    <div className="space-y-5">
      {groups.map(([day, items]) => (
        <section key={day}>
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-surface-600">{day}</h3>
            <span className="text-xs text-surface-400">{items.length} event{items.length > 1 ? "s" : ""}</span>
            <div className="flex-1 h-px bg-surface-200" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2 items-start">
            {items.map((entry, i) => <TimelineItem key={i} entry={entry} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-surface-200 rounded-lg px-3.5 py-3">
      {title && <p className="text-[11px] font-semibold uppercase tracking-wide text-surface-500 mb-2">{title}</p>}
      {children}
    </div>
  );
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  // Where the person came from decides the breadcrumb: the CRM board, or (the default) the Contacts list.
  const cameFromCrm = (useLocation().state as { from?: string } | null)?.from === "crm";
  const [contact, setContact]   = useState<CrmContact | null>(null);
  const [stages, setStages]     = useState<PipelineStage[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [notes, setNotes]       = useState<ContactNote[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [actionError, setActionError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [tab, setTab]           = useState<"followups" | "timeline" | "notes" | "baki">("followups");
  const [openTasks, setOpenTasks] = useState(0);
  const [balance, setBalance]   = useState(0);
  const [channelFilter, setChannelFilter] = useState("all");
  const [confirmNoteId, setConfirmNoteId] = useState<string | null>(null);
  const [team, setTeam]         = useState<TeamMember[]>([]);
  const [fields, setFields]     = useState<CustomField[]>([]);
  const [consent, setConsent]   = useState<ConsentEntry[]>([]);
  const [role, setRole]         = useState("member");
  const [lostAsk, setLostAsk]   = useState<string | null>(null);
  const [lostReasons, setLostReasons] = useState<string[] | undefined>(undefined);
  useEffect(() => { fetchSettings().then((s) => setLostReasons(s.lost_reasons)).catch(() => undefined); }, []);

  const refreshCounts = () => {
    if (!id) return;
    fetchContactTasks(id).then((t) => setOpenTasks(t.filter((x) => !x.done_at).length)).catch(() => undefined);
    fetchContactDues(id).then((d) => setBalance(d.balance)).catch(() => undefined);
  };
  const refreshTimeline = () => { if (id) fetchTimeline(id).then(setTimeline).catch(() => undefined); };

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchCrmContact(id), fetchStages(), fetchTimeline(id), fetchNotes(id), fetchContactSegments(id)])
      .then(([c, s, tl, n, seg]) => { setContact(c); setStages([...s].sort((x, y) => x.position - y.position)); setTimeline(tl); setNotes(n); setSegments(seg); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    fetchTeam().then(setTeam).catch(() => undefined);
    fetchCustomFields().then(setFields).catch(() => undefined);
    fetchConsent(id).then(setConsent).catch(() => undefined);
    refreshCounts();
    fetchOrganizationProfile().then((p) => setRole(p.my_role)).catch(() => undefined);
  }, [id]);

  const handleStageChange = async (stageId: string | null, lostReason?: string) => {
    if (!id || stageId === contact?.pipeline_stage_id) return;
    const target = stages.find((x) => x.id === stageId);
    if (target?.outcome === "lost" && lostReason === undefined) { setLostAsk(stageId); return; }
    setActionError("");
    try { setContact(await updateContactStage(id, stageId, lostReason)); refreshTimeline(); }
    catch (e: any) { setActionError(e.message); }
  };

  const handleAddNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !noteText.trim()) return;
    setAddingNote(true); setActionError("");
    try {
      const note = await createNote(id, noteText.trim());
      setNotes((prev) => [note, ...prev]);
      setNoteText("");
      fetchTimeline(id).then(setTimeline);
    } catch (e: any) { setActionError(e.message); }
    finally { setAddingNote(false); }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!id) return;
    setConfirmNoteId(null); setActionError("");
    try {
      await deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      fetchTimeline(id).then(setTimeline);
    } catch (e: any) { setActionError(e.message); }
  };

  if (loading) return <AppLayout><div className="flex justify-center py-16"><Spinner size="lg" /></div></AppLayout>;
  if (error || !contact) return <AppLayout><Alert variant="error" className="max-w-lg mx-auto mt-16">{error || "Contact not found"}</Alert></AppLayout>;

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || contact.phone || "Unnamed contact";
  const initials = ((contact.first_name?.[0] ?? "") + (contact.last_name?.[0] ?? "")).toUpperCase() || contact.email?.[0]?.toUpperCase() || "?";
  const channelCounts = timeline.reduce<Record<string, number>>((acc, e) => { acc[e.channel] = (acc[e.channel] ?? 0) + 1; return acc; }, {});
  const shownTimeline = channelFilter === "all" ? timeline : timeline.filter((e) => e.channel === channelFilter);
  const currentStage = stages.find((s) => s.id === contact.pipeline_stage_id);
  const currentIdx = stages.findIndex((s) => s.id === contact.pipeline_stage_id);
  const waHref = whatsappLink(contact.whatsapp_number || contact.phone);
  const canAssign = role !== "sales";
  const dateOnly = (ts: string) => new Date(ts).toLocaleDateString("en-BD", { year: "numeric", month: "short", day: "numeric" });

  const lastContact = contact.last_contacted_at ? relativeTime(contact.last_contacted_at) : null;
  const scoreCls = contact.lead_score >= 60 ? "bg-success-light text-success-dark" : contact.lead_score >= 30 ? "bg-warning-light text-warning-dark" : "bg-surface-100 text-surface-600";
  const scoreLabel = contact.lead_score >= 60 ? "Hot" : contact.lead_score >= 30 ? "Warm" : "Cold";
  const tabs = [
    { key: "followups", label: "Follow-ups", count: openTasks },
    { key: "timeline", label: "Activity", count: timeline.length },
    { key: "notes", label: "Notes", count: notes.length },
    { key: "baki", label: "Dues", badge: balance > 0 ? taka(balance) : undefined },
  ] as const;

  return (
    <AppLayout>
      <nav className="flex items-center gap-1.5 text-sm text-surface-600 mb-3">
        <Link to={cameFromCrm ? "/crm" : "/contacts"} className="text-brand-600 hover:text-brand-700 font-medium">{cameFromCrm ? "CRM" : "Contacts"}</Link>
        <ChevronRight size={14} className="text-surface-300" />
        <span className="text-surface-900 font-medium truncate max-w-xs">{fullName}</span>
      </nav>

      {actionError && <Alert variant="error" className="mb-3">{actionError}</Alert>}

      {/* ── Summary strip ── */}
      <section className="bg-white border border-surface-200 rounded-lg p-3.5 mb-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-lg font-bold uppercase flex-shrink-0">{initials}</div>
          <div className="min-w-0 flex-1 basis-56">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-surface-900 leading-tight break-words">{fullName}</h1>
              {currentStage ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-surface-100 text-surface-700">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: currentStage.color }} />{currentStage.name}
                </span>
              ) : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-warning-light text-warning-dark">Unassigned</span>}
              <span title="Lead score" className={`text-xs font-semibold px-2 py-0.5 rounded-full ${scoreCls}`}>{scoreLabel} · {contact.lead_score}</span>
            </div>
            <p className="text-[13px] text-surface-600 mt-0.5 flex flex-wrap gap-x-2">
              {[contact.company, placeLine(contact)].filter(Boolean).join(" · ") || <span className="text-surface-400">No shop or place yet</span>}
              {contact.deal_value != null && <span className="font-semibold text-success-dark">· {taka(contact.deal_value)}</span>}
              {contact.expected_close_date && <span>· closes {new Date(contact.expected_close_date).toLocaleDateString("en-BD", { day: "numeric", month: "short" })}</span>}
              {lastContact && <span>· last contact {lastContact}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(!!contact.email || contact.sms_opt_in) && (
              <Button size="xs" variant="secondary" icon={<Send size={13} />} onClick={() => setShowCompose(true)}>Message</Button>
            )}
            {contact.email && <a href={`mailto:${contact.email}`}><Button size="xs" variant="secondary" icon={<Mail size={13} />}>Email</Button></a>}
            {contact.phone && <a href={`tel:${contact.phone}`}><Button size="xs" variant="secondary" icon={<Phone size={13} />}>Call</Button></a>}
            {waHref && <a href={waHref} target="_blank" rel="noreferrer"><Button size="xs" variant="secondary" icon={<MessageCircle size={13} />}>WhatsApp</Button></a>}
            <Link to={`/contacts/${contact.id}/edit`}><Button size="xs" variant="secondary" icon={<Pencil size={13} />}>Edit</Button></Link>
            <Button size="xs" variant="ghost" icon={<History size={13} />} onClick={() => setShowHistory(true)}>History</Button>
          </div>
        </div>

        {/* Stage stepper */}
        <div className="flex gap-1.5 overflow-x-auto mt-3 pt-3 border-t border-surface-100">
          {stages.map((st, i) => {
            const active = st.id === contact.pipeline_stage_id;
            const done = currentIdx >= 0 && i < currentIdx;
            return (
              <button key={st.id} onClick={() => handleStageChange(st.id)}
                className={`flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${active ? "text-white border-transparent shadow-sm" : done ? "bg-surface-50 text-surface-700 border-surface-200 hover:bg-surface-100" : "bg-white text-surface-600 border-surface-200 hover:bg-surface-50"}`}
                style={active ? { backgroundColor: st.color } : undefined}>
                {done && <Check size={12} className="text-success-base" />}{st.name}
              </button>
            );
          })}
          {contact.pipeline_stage_id && (
            <button onClick={() => handleStageChange(null)} className="flex-shrink-0 px-2 py-1 text-xs text-surface-400 hover:text-surface-700">Clear</button>
          )}
          {stages.length === 0 && <p className="text-xs text-surface-400 italic">No stages yet — add some on the CRM page.</p>}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 items-start">
        {/* ── Left: facts ── */}
        <aside className="space-y-3 lg:sticky lg:top-3 min-w-0 order-2 lg:order-1">
          <Panel title="Contact">
            <div className="space-y-1.5 text-[13px]">
              {contact.email ? <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-surface-800 hover:text-brand-600 break-all"><Mail size={13} className="text-surface-400 flex-shrink-0" />{contact.email}</a> : <p className="text-surface-400 italic">No email</p>}
              {contact.phone ? <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-surface-800 hover:text-brand-600"><Phone size={13} className="text-surface-400 flex-shrink-0" />{contact.phone}</a> : <p className="text-surface-400 italic">No phone</p>}
              <div className="flex flex-wrap gap-1 pt-0.5">
                <Badge variant={contact.sms_opt_in ? "success" : "default"} size="sm">SMS {contact.sms_opt_in ? "✓" : "✗"}</Badge>
                <Badge variant={contact.whatsapp_opt_in ? "success" : "default"} size="sm">WhatsApp {contact.whatsapp_opt_in ? "✓" : "✗"}</Badge>
              </div>
            </div>
          </Panel>

          <Panel title="Location">
            {contact.latitude != null && contact.longitude != null ? (
              <>
                <MapPicker readOnly lat={contact.latitude} lng={contact.longitude} height={190} />
                {(contact.address || placeLine(contact)) && <p className="text-[13px] text-surface-700 mt-2">{[contact.address, placeLine(contact)].filter(Boolean).join(" — ")}</p>}
              </>
            ) : (
              <div className="text-[13px] text-surface-500">
                <p>No exact location saved{placeLine(contact) ? <> — {placeLine(contact)}</> : ""}.</p>
                <Link to={`/contacts/${contact.id}/edit`} className="inline-flex items-center gap-1 mt-1.5 text-brand-600 hover:underline font-medium"><MapPin size={13} />Add a map pin</Link>
              </div>
            )}
          </Panel>

          <Panel>
            <SalesDetailsCard contact={contact} team={team} fields={fields} canAssign={canAssign}
              onUpdated={(c) => { setContact(c); refreshTimeline(); }} />
          </Panel>

          <Panel title="Tags & segments">
            <div className="flex flex-wrap gap-1">
              {contact.tags.map((t) => <span key={t} className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">{t}</span>)}
              {segments.map((sg) => <Badge key={sg.id} variant="info" size="sm">{sg.name}</Badge>)}
              {contact.tags.length === 0 && segments.length === 0 && <p className="text-[13px] text-surface-400 italic">None yet</p>}
            </div>
          </Panel>

          <details className="bg-white border border-surface-200 rounded-lg group">
            <summary className="cursor-pointer select-none list-none flex items-center justify-between px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-surface-500">
              Consent & dates <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-3.5 pb-3 space-y-2">
              {consent.length === 0 ? <p className="text-xs text-surface-400 italic">No opt-in or opt-out recorded.</p> : (
                <ul className="space-y-1.5">
                  {consent.slice(0, 6).map((c) => (
                    <li key={c.id} className="flex items-start gap-2 text-xs text-surface-600">
                      <ShieldCheck size={13} className={`mt-0.5 flex-shrink-0 ${c.granted ? "text-success-base" : "text-danger-base"}`} />
                      <span><span className="font-medium text-surface-800">{c.channel.toUpperCase()} {c.granted ? "opt-in" : "opt-out"}</span> via {c.method}{c.recorded_by ? ` by ${c.recorded_by}` : ""} · {dateOnly(c.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-surface-500 pt-1 border-t border-surface-100">Added {dateOnly(contact.created_at)} · updated {dateOnly(contact.updated_at)}</p>
            </div>
          </details>
        </aside>

        {/* ── Right: work area ── */}
        <section className="bg-white border border-surface-200 rounded-lg min-w-0 order-1 lg:order-2">
          <div className="flex border-b border-surface-200 px-1.5 overflow-x-auto" role="tablist">
            {tabs.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.key ? "border-brand-500 text-brand-600" : "border-transparent text-surface-600 hover:text-surface-900"}`}>
                {t.label}
                {"count" in t && t.count > 0 && <span className="ml-1.5 text-[11px] bg-surface-100 text-surface-600 rounded-full px-1.5 py-0.5">{t.count}</span>}
                {"badge" in t && t.badge && <span className="ml-1.5 text-[11px] bg-danger-light text-danger-dark rounded-full px-1.5 py-0.5">{t.badge}</span>}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab === "followups" && <FollowUpsCard bare contactId={contact.id} team={team} onChanged={() => { refreshTimeline(); refreshCounts(); }} />}
            {tab === "baki" && <BakiCard bare contactId={contact.id} onChanged={refreshCounts} />}
            {tab === "timeline" && (
              <>
                {timeline.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {[["all", "All", timeline.length] as const, ...Object.entries(channelCounts).map(([ch, n]) => [ch, CHANNEL_LABEL[ch] ?? ch, n] as const)].map(([ch, label, n]) => (
                      <button key={ch} onClick={() => setChannelFilter(ch)}
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${channelFilter === ch ? "bg-brand-500 text-white border-brand-500" : "bg-white text-surface-600 border-surface-200 hover:bg-surface-50"}`}>{label} · {n}</button>
                    ))}
                  </div>
                )}
                {shownTimeline.length === 0 ? (
                  <div className="text-center py-5">
                    <MessageSquare size={24} className="mx-auto text-surface-300 mb-2" />
                    <p className="text-sm font-medium text-surface-700">No activity yet</p>
                    <p className="text-xs text-surface-500 mt-1">Emails, SMS, calls, stage moves and notes show up here.</p>
                  </div>
                ) : <ActivityFeed entries={shownTimeline} />}
              </>
            )}
            {tab === "notes" && (
              <>
                <form onSubmit={handleAddNote} className="mb-4">
                  <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAddNote(e as unknown as FormEvent); }}
                    placeholder="Write a note about this contact…" rows={2}
                    className="w-full border border-surface-200 rounded-md px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 bg-white" />
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs text-surface-500">Ctrl + Enter to save · notes are private to your team</span>
                    <Button type="submit" size="xs" loading={addingNote} disabled={!noteText.trim()}>Add note</Button>
                  </div>
                </form>
                {notes.length === 0 ? <p className="text-sm text-surface-500 text-center py-4">No notes yet.</p> : (
                  <div className="space-y-2">
                    {notes.map((note) => (
                      <div key={note.id} className="bg-surface-50 rounded-md border border-surface-100 px-3 py-2.5 text-sm text-surface-800">
                        <p className="whitespace-pre-wrap">{note.content}</p>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-xs text-surface-500">{formatTs(note.created_at)}</span>
                          {confirmNoteId === note.id ? (
                            <span className="flex items-center gap-2 text-xs">
                              <span className="text-surface-600">Delete this note?</span>
                              <button onClick={() => handleDeleteNote(note.id)} className="font-medium text-danger-base hover:text-danger-dark">Yes, delete</button>
                              <button onClick={() => setConfirmNoteId(null)} className="text-surface-600 hover:text-surface-900">Cancel</button>
                            </span>
                          ) : <button onClick={() => setConfirmNoteId(note.id)} className="text-surface-400 hover:text-danger-base" aria-label="Delete note"><Trash2 size={13} /></button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      {lostAsk && (
        <LostReasonDialog name={fullName} reasons={lostReasons} onCancel={() => setLostAsk(null)}
          onConfirm={(reason) => { const sid = lostAsk; setLostAsk(null); handleStageChange(sid, reason); }} />
      )}

      {showCompose && id && (
        <ComposeMessageModal
          contactId={id}
          contactLabel={fullName}
          hasEmail={!!contact.email}
          hasSms={!!contact.sms_opt_in}
          onClose={() => setShowCompose(false)}
          onSent={refreshTimeline}
        />
      )}

      {showHistory && id && (
        <ContactHistoryModal
          contactId={id}
          contactLabel={contact.email ?? contact.phone ?? fullName}
          onClose={() => setShowHistory(false)}
          onRestored={() => { fetchCrmContact(id).then(setContact); }}
        />
      )}
    </AppLayout>
  );
}
