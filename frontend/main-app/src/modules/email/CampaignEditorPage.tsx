import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Code2, Eye, Filter, Globe, LayoutTemplate, Save, Tags, X } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Input from "../../components/Input";
import Select from "../../components/Select";
import Spinner from "../../components/Spinner";
import { createCampaign, fetchCampaign, updateCampaign } from "../../lib/campaigns";
import { fetchMailSetup, type InboxAddress } from "../../lib/mail";
import { fetchSegmentContacts, fetchSegments, type Contact, type Segment } from "../../lib/audience";
import { fetchDomains, fetchSenders, type SenderAddress, type SendingDomain } from "../../lib/emailDomains";
import { EMAIL_TEMPLATES, fillSample, type EmailTemplate, type PreviewContact } from "../../lib/emailTemplates";
import { BUILTIN_TAGS, fetchMergeTags, type MergeTag } from "../../lib/mergeTags";
import MergeTagsModal from "./MergeTagsModal";
import { useConfirm } from "../../components/ConfirmDialog";

function segmentOptionLabel(s: Segment): string {
  const count = `${s.contact_count} contact${s.contact_count === 1 ? "" : "s"}`;
  const ruleNote = s.rules.length > 1 ? `, ${s.match_type === "any" ? "any" : "all"} rules` : "";
  return `${s.name} — ${count}${ruleNote}`;
}

/** Scaled-down live thumbnail of a template. */
function Thumb({ html }: { html: string }) {
  return (
    <div className="relative h-32 overflow-hidden bg-surface-100">
      <iframe
        title="Template thumbnail"
        srcDoc={fillSample(html)}
        sandbox=""
        tabIndex={-1}
        className="pointer-events-none absolute left-0 top-0 border-0 bg-white"
        style={{ width: 640, height: 760, transform: "scale(0.3)", transformOrigin: "top left" }}
      />
    </div>
  );
}

export default function CampaignEditorPage() {
  const { id } = useParams<{ id: string }>();
  const editing = !!id;
  const navigate = useNavigate();
  const confirmAsk = useConfirm();
  const [search] = useSearchParams();
  const fromId = editing ? null : search.get("from"); // duplicate an existing campaign into a new draft

  const [segments, setSegments] = useState<Segment[]>([]);
  const [senders, setSenders] = useState<SenderAddress[]>([]);
  const [domains, setDomains] = useState<SendingDomain[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [senderId, setSenderId] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [inboxAddrs, setInboxAddrs] = useState<InboxAddress[]>([]);
  useEffect(() => { fetchMailSetup().then((m) => setInboxAddrs(m.addresses)).catch(() => undefined); }, []);
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);

  const [showTemplates, setShowTemplates] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [segContacts, setSegContacts] = useState<Contact[]>([]);
  const [previewAs, setPreviewAs] = useState<string>(""); // contact id, "" = sample data
  const [mergeTags, setMergeTags] = useState<MergeTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchSegments(),
      fetchSenders().catch(() => [] as SenderAddress[]),
      fetchDomains().catch(() => [] as SendingDomain[]),
      editing ? fetchCampaign(id!) : fromId ? fetchCampaign(fromId).catch(() => null) : Promise.resolve(null),
      fetchMergeTags().catch(() => [] as MergeTag[]),
    ])
      .then(([segs, snd, dom, c, tags]) => {
        if (!alive) return;
        setMergeTags(tags);
        setSegments(segs); setSenders(snd); setDomains(dom);
        if (c) {
          if (editing && c.status !== "draft") { navigate(`/campaigns/${c.id}`, { replace: true }); return; }
          setName(editing ? c.name : `${c.name} (copy)`); setSubject(c.subject ?? ""); setHtmlBody(c.html_body ?? "");
          setSegmentId(c.segment_id ?? segs[0]?.id ?? ""); setSenderId(c.sender_id ?? ""); setReplyTo(c.reply_to ?? "");
        } else {
          setSegmentId(segs[0]?.id ?? "");
          setShowTemplates(true); // new campaign: offer templates up front
        }
      })
      .catch(() => alive && setError("Failed to load the editor"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id, editing, fromId, navigate]);

  const usableSenders = senders.filter((s) => domains.find((d) => d.id === s.domain_id)?.status === "verified");
  // Load a few real contacts from the chosen segment so the preview shows real names.
  useEffect(() => {
    setSegContacts([]); setPreviewAs("");
    if (!segmentId) return;
    let alive = true;
    fetchSegmentContacts(segmentId)
      .then((cs) => { if (alive) { setSegContacts(cs.slice(0, 25)); setPreviewAs(cs[0]?.id ?? ""); } })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [segmentId]);

  const customValues = useMemo(() => Object.fromEntries(mergeTags.map((t) => [t.key, t.value])), [mergeTags]);
  const previewContact: PreviewContact | undefined = useMemo(() => {
    const c = segContacts.find((x) => x.id === previewAs);
    return c ? { first_name: c.first_name, last_name: c.last_name, email: c.email, phone: c.phone } : undefined;
  }, [segContacts, previewAs]);
  const previewHtml = useMemo(() => fillSample(htmlBody, customValues, previewContact), [htmlBody, customValues, previewContact]);
  const customTags = mergeTags.filter((t) => !t.builtin);

  async function applyTemplate(t: EmailTemplate) {
    if (htmlBody.trim() && templateId !== t.id && !(await confirmAsk({
      title: "Replace your email content?",
      message: <>The “{t.name}” template will replace what you have written so far. Your campaign name and segment stay the same.</>,
      confirmLabel: "Use this template", icon: "replace", tone: "warning",
    }))) return;
    setHtmlBody(t.html);
    setTemplateId(t.id);
    if (!subject.trim() || EMAIL_TEMPLATES.some((x) => x.subject === subject)) setSubject(t.subject);
    if (!name.trim()) setName(t.name);
    setShowTemplates(false);
  }

  function insertAt(el: HTMLInputElement | HTMLTextAreaElement | null, value: string, text: string, set: (v: string) => void) {
    if (!el) { set(value + text); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    set(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + text.length, start + text.length); });
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!segmentId) { setError("Create a segment first — a campaign needs someone to send to."); return; }
    if (!name.trim() || !subject.trim() || !htmlBody.trim()) { setError("Name, subject and email content are all required."); return; }
    setError(null);
    setSaving(true);
    try {
      const saved = editing
        ? await updateCampaign(id!, { name: name.trim(), segment_id: segmentId, subject: subject.trim(), html_body: htmlBody, ...(senderId ? { sender_id: senderId } : {}), reply_to: replyTo })
        : await createCampaign(name.trim(), segmentId, subject.trim(), htmlBody, senderId || null, replyTo || null);
      navigate(`/campaigns/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save campaign");
      setSaving(false);
    }
  }

  if (loading) return <AppLayout><div className="flex justify-center py-16"><Spinner size="lg" /></div></AppLayout>;

  const saveLabel = editing ? "Save changes" : "Create draft";
  const currentTemplate = EMAIL_TEMPLATES.find((t) => t.id === templateId);

  return (
    <AppLayout>
      <form onSubmit={handleSubmit} className="w-full">
        {/* Title bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to={editing ? `/campaigns/${id}` : "/campaigns"} aria-label="Back" className="p-1.5 -ml-1.5 rounded-md text-surface-500 hover:bg-surface-100 hover:text-surface-800">
              <ArrowLeft size={18} />
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-surface-900 leading-tight">{editing ? "Edit campaign" : fromId ? "Duplicate campaign" : "New campaign"}</h1>
              <p className="text-xs text-surface-500 truncate">{editing ? "Changes are saved to history." : "Saved as a draft — nothing is sent until you confirm."}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => navigate(editing ? `/campaigns/${id}` : "/campaigns")}>Cancel</Button>
            <Button type="submit" size="sm" icon={<Save size={14} />} loading={saving} disabled={segments.length === 0}>{saveLabel}</Button>
          </div>
        </div>

        {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-3">{error}</Alert>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:items-stretch">
          {/* LEFT: details + editor */}
          <div className="space-y-3 min-w-0">
            <Card className="!p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2.5">
                <Input inputSize="sm" label="Campaign name" placeholder="e.g. Eid offer 2026" value={name} onChange={(e) => setName(e.target.value)} required autoFocus={!editing} />
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label htmlFor="campaign-subject" className="text-sm font-medium text-surface-700">
                      Subject line<span className="ml-1 text-danger-base">*</span>
                    </label>
                    <span className="flex items-center gap-2 text-[11px]">
                      <button type="button" onClick={() => insertAt(subjectRef.current, subject, "{{first_name}}", setSubject)} className="font-medium text-brand-600 hover:text-brand-700">+ first name</button>
                      <span className={subject.length > 60 ? "text-warning-dark" : "text-surface-500"}>{subject.length}/60</span>
                    </span>
                  </div>
                  <Input id="campaign-subject" ref={subjectRef} inputSize="sm" placeholder="Your email subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required />
                </div>
                <div>
                  <Select selectSize="sm" label="Send to segment" value={segmentId} onChange={(e) => setSegmentId(e.target.value)} required>
                    {segments.length === 0
                      ? <option value="">No segments yet</option>
                      : segments.map((s) => <option key={s.id} value={s.id}>{segmentOptionLabel(s)}</option>)}
                  </Select>
                  <Link to="/segments" className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700 font-medium">
                    <Filter size={11} /> {segments.length === 0 ? "Create a segment first" : "Manage segments"}
                  </Link>
                </div>
                <div>
                  <Select selectSize="sm" label="Send from" value={senderId} onChange={(e) => setSenderId(e.target.value)}>
                    <option value="">{usableSenders.length ? "Default sender" : "Platform address"}</option>
                    {usableSenders.map((s) => <option key={s.id} value={s.id}>{s.name ? `${s.name} <${s.email}>` : s.email}</option>)}
                  </Select>
                  <Link to="/email-domains" className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700 font-medium">
                    <Globe size={11} /> {usableSenders.length ? "Manage sending domains" : "Use your own domain"}
                  </Link>
                </div>
                {inboxAddrs.length > 0 && (
                  <div>
                    <Select selectSize="sm" label="Replies go to" value={replyTo} onChange={(e) => setReplyTo(e.target.value)}>
                      <option value="">The sender address</option>
                      {inboxAddrs.map((a) => <option key={a.id} value={a.email}>{a.display_name ? `${a.display_name} <${a.email}>` : a.email}</option>)}
                    </Select>
                    <span className="mt-1 block text-[11px] text-surface-500">Customer replies arrive in your Inbox.</span>
                  </div>
                )}
              </div>
            </Card>

            <Card padding={false} className="overflow-hidden">
              <div className="flex items-center gap-1.5 flex-wrap px-3 py-2 border-b border-surface-100 bg-surface-50">
                <Button type="button" size="xs" variant="secondary" icon={<LayoutTemplate size={13} />} onClick={() => setShowTemplates(true)}>
                  {currentTemplate ? "Change template" : "Choose template"}
                </Button>
                <Button type="button" size="xs" variant="secondary" icon={<Tags size={13} />} onClick={() => setShowTags(true)}>Manage tags</Button>
                {currentTemplate && <span className="text-xs text-surface-500">{currentTemplate.emoji} {currentTemplate.name}</span>}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap px-3 py-1.5 border-b border-surface-100">
                <span className="text-xs text-surface-500">Insert:</span>
                {BUILTIN_TAGS.map((m) => (
                  <button type="button" key={m.key} onClick={() => insertAt(bodyRef.current, htmlBody, `{{${m.key}}}`, setHtmlBody)}
                    className="text-[11px] rounded-full border border-surface-200 bg-white px-2 py-0.5 text-surface-700 hover:border-brand-300 hover:text-brand-700">
                    {m.label}
                  </button>
                ))}
                {customTags.map((t) => (
                  <button type="button" key={t.id} title={t.value} onClick={() => insertAt(bodyRef.current, htmlBody, `{{${t.key}}}`, setHtmlBody)}
                    className="text-[11px] rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-brand-700 hover:bg-brand-100">
                    {t.key}
                  </button>
                ))}
                <button type="button" onClick={() => setShowTags(true)} className="text-[11px] font-medium text-brand-600 hover:text-brand-700">+ add tag</button>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-surface-600 border-b border-surface-100"><Code2 size={13} /> HTML</div>
              <textarea
                ref={bodyRef}
                placeholder="<p>প্রিয় {{first_name}}, …</p>"
                value={htmlBody}
                onChange={(e) => setHtmlBody(e.target.value)}
                spellCheck={false}
                className="block w-full h-[420px] lg:h-[calc(100vh-24rem)] lg:min-h-[320px] resize-none border-0 px-3 py-2 text-[12.5px] leading-relaxed text-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-0 font-mono"
              />
            </Card>
          </div>

          {/* RIGHT: preview, full height */}
          <Card padding={false} className="overflow-hidden flex flex-col min-w-0 h-[520px] lg:h-auto">
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs border-b border-surface-200 bg-white flex-shrink-0">
              <span className="flex items-center gap-1.5 font-semibold text-surface-700"><Eye size={13} /> Preview</span>
              <span className="text-surface-400 truncate">Subject: <span className="text-surface-700">{fillSample(subject, customValues, previewContact) || "—"}</span></span>
            </div>
            <div className="flex-1 min-h-0 bg-surface-100 p-2">
              {htmlBody.trim() ? (
                <iframe title="Live email preview" srcDoc={previewHtml} sandbox="" className="h-full w-full rounded bg-white ring-1 ring-surface-200" />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-sm text-surface-400">
                  <LayoutTemplate size={26} className="mb-2 text-surface-300" />
                  Choose a template or write HTML<br />to see the preview here.
                </div>
              )}
            </div>
            <div className="px-3 py-1.5 text-[11px] text-surface-500 border-t border-surface-200 bg-white flex-shrink-0 flex items-center justify-between gap-2 flex-wrap">
              <span>Each recipient gets their own details when sent.</span>
              <label className="inline-flex items-center gap-1.5 text-surface-700">
                Preview as
                <select value={previewAs} onChange={(e) => setPreviewAs(e.target.value)}
                  className="rounded border border-surface-300 bg-white py-0.5 pl-1.5 pr-5 text-[11px] max-w-[11rem]">
                  {segContacts.length === 0 && <option value="">Sample data (no contacts in segment)</option>}
                  {segContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone || "Unnamed contact"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Card>
        </div>
      </form>

      {showTags && (
        <MergeTagsModal
          tags={mergeTags}
          onChange={setMergeTags}
          onInsert={(t) => insertAt(bodyRef.current, htmlBody, t, setHtmlBody)}
          onClose={() => setShowTags(false)}
        />
      )}

      {/* Template picker modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4" onClick={() => setShowTemplates(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 flex-shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-surface-900">Choose a template</h2>
                <p className="text-xs text-surface-500">Pick a layout, then edit the text. Shop name, phone, offer and links are placeholders.</p>
              </div>
              <button type="button" onClick={() => setShowTemplates(false)} className="p-1 rounded text-surface-400 hover:bg-surface-100 hover:text-surface-700" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="p-4 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <button type="button" onClick={() => { setTemplateId(null); setShowTemplates(false); }}
                  className="rounded-lg border border-dashed border-surface-300 hover:border-brand-400 hover:bg-brand-50/40 flex flex-col items-center justify-center gap-1 text-xs text-surface-600 min-h-[10rem] p-2 text-center">
                  <Code2 size={20} /> Blank<br />write your own HTML
                </button>
                {EMAIL_TEMPLATES.map((t) => (
                  <button type="button" key={t.id} onClick={() => applyTemplate(t)}
                    className={`text-left rounded-lg border bg-white overflow-hidden transition hover:shadow-card-hover hover:border-brand-300 ${templateId === t.id ? "border-brand-500 ring-2 ring-brand-500/20" : "border-surface-200"}`}>
                    <Thumb html={t.html} />
                    <div className="px-2.5 py-2">
                      <p className="text-xs font-semibold text-surface-900 flex items-center gap-1">
                        <span>{t.emoji}</span><span className="truncate">{t.name}</span>
                        {templateId === t.id && <Check size={13} className="text-brand-600 flex-shrink-0" />}
                      </p>
                      <p className="text-[11px] text-surface-500 mt-0.5 line-clamp-2">{t.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
