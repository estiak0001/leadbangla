import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, FileText, Filter, Save, X } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Input from "../../components/Input";
import Select from "../../components/Select";
import Spinner from "../../components/Spinner";
import PhonePreview from "./PhonePreview";
import { useWallet } from "./useWallet";
import { useEntitlement } from "./useEntitlement";
import PlanLock from "./PlanLock";
import { useConfirm } from "../../components/ConfirmDialog";
import { createSmsCampaign, fetchSmsCampaign, fetchSmsSettings, fetchWhatsAppTemplates, type SmsChannel, type WaTemplates } from "../../lib/sms";
import MetaTemplatePicker, { fillTemplate, keyOf } from "./MetaTemplatePicker";
import { fetchSegments, type Segment } from "../../lib/audience";
import { fetchCreditRates, type CreditRate } from "../../lib/billing";
import { fetchMergeTags, BUILTIN_TAGS, type MergeTag } from "../../lib/mergeTags";
import { fillSample } from "../../lib/emailTemplates";
import {
  CHANNELS, STARTER_TEMPLATES, fetchMessageTemplates, smsParts, type MessageTemplate,
} from "../../lib/messaging";

export default function ComposePage({ channel }: { channel: SmsChannel }) {
  const cfg = CHANNELS[channel];
  const isSms = channel === "sms";
  const navigate = useNavigate();
  const confirmAsk = useConfirm();
  const [search] = useSearchParams();
  const fromId = search.get("from");
  const tplId = search.get("tpl");

  const [loading, setLoading] = useState(true);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tags, setTags] = useState<MergeTag[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [rates, setRates] = useState<CreditRate[]>([]);
  const [senderLabel, setSenderLabel] = useState("LeadBangla");
  const [senderPending, setSenderPending] = useState(false);

  const [name, setName] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [body, setBody] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [wa, setWa] = useState<WaTemplates | null>(null);
  const [waKey, setWaKey] = useState("");
  const [waParams, setWaParams] = useState<string[]>([]);
  const metaMode = !isSms && wa?.mode === "meta";
  const waTemplate = wa?.templates.find((x) => keyOf(x) === waKey);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const wallet = useWallet(channel);
  const ent = useEntitlement();

  useEffect(() => { if (!isSms) fetchWhatsAppTemplates().then(setWa).catch(() => undefined); }, [isSms]);
  useEffect(() => { if (metaMode) setBody(waTemplate ? fillTemplate(waTemplate.body, waParams) : ""); }, [metaMode, waTemplate, waParams]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchSegments(),
      fetchMergeTags().catch(() => [] as MergeTag[]),
      fetchMessageTemplates(channel).catch(() => [] as MessageTemplate[]),
      fetchCreditRates().catch(() => [] as CreditRate[]),
      isSms ? fetchSmsSettings().catch(() => null) : Promise.resolve(null),
      fromId ? fetchSmsCampaign(fromId).catch(() => null) : Promise.resolve(null),
    ]).then(([segs, mt, tpls, cr, settings, from]) => {
      if (!alive) return;
      setSegments(segs); setTags(mt); setTemplates(tpls); setRates(cr);
      setSegmentId(from?.segment_id ?? segs[0]?.id ?? "");
      if (from) { setName(`${from.name} (copy)`); setBody(from.message_body); }
      const t = tplId ? tpls.find((x) => x.id === tplId) : undefined;
      const starter = search.get("starter");
      const st = starter ? STARTER_TEMPLATES[channel].find((x) => x.id === starter) : undefined;
      if (t) { setBody(t.body); setName((n) => n || t.name); }
      else if (st) { setBody(st.body); setName((n) => n || st.name); }
      if (settings) {
        setSenderLabel(settings.approved ? (settings.sms_sender_id || settings.suggested_sender_id) : "Shared sender");
        setSenderPending(!settings.approved);
      } else if (!isSms) setSenderLabel("Your business");
    }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const customTags = tags.filter((t) => !t.builtin);
  const customValues = useMemo(() => Object.fromEntries(tags.map((t) => [t.key, t.value])), [tags]);
  const segment = segments.find((s) => s.id === segmentId);
  const parts = smsParts(body);
  const rate = rates.find((r) => r.service === cfg.creditService);
  const units = isSms ? Math.max(parts.parts, body.trim() ? 1 : 0) : (body.trim() ? 1 : 0);
  const estCost = rate && segment ? units * segment.contact_count * Number(rate.rate_bdt) : null;

  function insert(text: string) {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + text + body.slice(end));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + text.length, start + text.length); });
  }

  async function applyText(text: string, tplName: string) {
    if (body.trim() && body !== text && !(await confirmAsk({
      title: "Replace your message?",
      message: <>The template “{tplName}” will replace the message you have written so far.</>,
      confirmLabel: "Use this template", icon: "replace", tone: "warning",
    }))) return;
    setBody(text);
    if (!name.trim()) setName(tplName);
    setShowTemplates(false);
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!segmentId) { setError("Create a segment first — a campaign needs someone to send to."); return; }
    if (metaMode && !waTemplate) { setError("Choose an approved WhatsApp template."); return; }
    if (metaMode && waTemplate && waTemplate.params > 0 && waParams.slice(0, waTemplate.params).filter((p) => p?.trim()).length < waTemplate.params) { setError("Fill every blank in the template."); return; }
    if (!name.trim() || !body.trim()) { setError("Name and message are required."); return; }
    setError(null); setSaving(true);
    try {
      const c = await createSmsCampaign({ name: name.trim(), segment_id: segmentId, channel, message_body: body, ...(metaMode && waTemplate ? { wa_template: { name: waTemplate.name, language: waTemplate.language, params: waParams.slice(0, waTemplate.params) } } : {}) });
      navigate(`${cfg.path}/campaigns/${c.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
      setSaving(false);
    }
  }

  if (loading) return <AppLayout><div className="flex justify-center py-16"><Spinner size="lg" /></div></AppLayout>;
  if (ent && !(isSms ? ent.sms_enabled : ent.whatsapp_enabled)) {
    return <AppLayout><PlanLock title={`${cfg.label} isn't in your plan`} message={`Upgrade your plan to create ${cfg.label} campaigns.`} planName={ent.plan_name} /></AppLayout>;
  }

  return (
    <AppLayout>
      <form onSubmit={handleSubmit} className="w-full">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to={cfg.path + "?tab=campaigns"} aria-label="Back" className="p-1.5 -ml-1.5 rounded-md text-surface-500 hover:bg-surface-100 hover:text-surface-800"><ArrowLeft size={18} /></Link>
            <div>
              <h1 className="text-lg font-bold text-surface-900 leading-tight">New {cfg.label} campaign</h1>
              <p className="text-xs text-surface-500">Saved as a draft — nothing is sent until you confirm.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => navigate(cfg.path + "?tab=campaigns")}>Cancel</Button>
            <Button type="submit" size="sm" icon={<Save size={14} />} loading={saving} disabled={segments.length === 0}>Create draft</Button>
          </div>
        </div>

        {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-3">{error}</Alert>}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 lg:items-stretch">
          <div className="lg:col-span-3 space-y-3 min-w-0">
            <Card className="!p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2.5">
                <Input inputSize="sm" label="Campaign name" placeholder={isSms ? "e.g. Eid SMS offer" : "e.g. Eid WhatsApp offer"} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
                <div>
                  <Select selectSize="sm" label="Send to segment" value={segmentId} onChange={(e) => setSegmentId(e.target.value)} required>
                    {segments.length === 0 ? <option value="">No segments yet</option>
                      : segments.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.contact_count} contacts</option>)}
                  </Select>
                  <Link to="/segments" className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700 font-medium">
                    <Filter size={11} /> {segments.length === 0 ? "Create a segment first" : "Manage segments"}
                  </Link>
                </div>
              </div>
            </Card>

            {metaMode && wa && <MetaTemplatePicker templates={wa.templates} error={wa.error} value={waKey} params={waParams} onPick={(k) => { setWaKey(k); setWaParams([]); }} onParams={setWaParams} tags={BUILTIN_TAGS.filter((b) => b.key !== "email")} />}
            {!metaMode && <Card padding={false} className="overflow-hidden">
              <div className="flex items-center gap-1.5 flex-wrap px-3 py-2 border-b border-surface-100 bg-surface-50">
                <Button type="button" size="xs" variant="secondary" icon={<FileText size={13} />} onClick={() => setShowTemplates(true)}>Use a template</Button>
                <span className="hidden sm:block w-px h-4 bg-surface-200 mx-1" />
                <span className="text-xs text-surface-500">Insert:</span>
                {BUILTIN_TAGS.filter((b) => b.key !== "email" || !isSms).map((b) => (
                  <button type="button" key={b.key} onClick={() => insert(`{{${b.key}}}`)}
                    className="text-[11px] rounded-full border border-surface-200 bg-white px-2 py-0.5 text-surface-700 hover:border-brand-300 hover:text-brand-700">{b.label}</button>
                ))}
                {customTags.map((t) => (
                  <button type="button" key={t.id} title={t.value} onClick={() => insert(`{{${t.key}}}`)}
                    className="text-[11px] rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-brand-700 hover:bg-brand-100">{t.key}</button>
                ))}
              </div>
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={cfg.maxChars}
                placeholder={isSms ? "আপনার মেসেজ লিখুন…" : "WhatsApp মেসেজ লিখুন… (এক লাইন ফাঁকা রাখতে Enter চাপুন)"}
                className="block w-full h-[260px] resize-none border-0 px-3 py-2.5 text-sm leading-relaxed text-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-0"
              />
              <div className="flex items-center justify-between gap-3 flex-wrap px-3 py-2 border-t border-surface-100 bg-surface-50 text-xs text-surface-600">
                {isSms ? (
                  <span>
                    <b className="text-surface-900">{parts.length}</b> characters · <b className="text-surface-900">{parts.parts || 0}</b> SMS {parts.parts === 1 ? "part" : "parts"}
                    <span className="text-surface-400"> ({parts.unicode ? "Bangla/Unicode: 70 per part" : "English: 160 per part"})</span>
                  </span>
                ) : (
                  <span><b className="text-surface-900">{[...body].length}</b> / {cfg.maxChars} characters</span>
                )}
                {estCost !== null && body.trim() && (
                  <span>Estimated cost ≈ <b className="text-surface-900">৳{estCost.toFixed(2)}</b> <span className="text-surface-400">for {segment?.contact_count} contacts</span></span>
                )}
              </div>
            </Card>}

            {isSms && ent && ent.remaining !== null && segment && segment.contact_count > ent.remaining && (
              <Alert variant="warning">
                Your plan has <b>{ent.remaining.toLocaleString()}</b> SMS left this month, but this segment has {segment.contact_count.toLocaleString()} contacts. Pick a smaller segment or <Link to="/billing?tab=plan" className="font-semibold underline">upgrade your plan</Link>.
              </Alert>
            )}
            {estCost !== null && wallet.balance !== null && body.trim() && wallet.balance < estCost && (
              <Alert variant="warning">
                This send is estimated at ৳{estCost.toFixed(2)} but your wallet has ৳{wallet.balance.toFixed(2)}. <Link to="/billing?tab=wallet" className="font-semibold underline">Top up</Link> before sending.
              </Alert>
            )}
            {isSms ? (
              <Alert variant="info">
                <b>Good to know:</b> promotional SMS may only be sent between 10:00 and 17:00, and Bangla messages cost more parts than English.
                {senderPending && " Your masking Sender ID is still pending, so messages go out from the shared sender."}
              </Alert>
            ) : metaMode ? null : (
              <Alert variant="info" >
                <span className="inline-flex items-start gap-1.5">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>WhatsApp only delivers business-started messages that use a Meta-approved template. Save this message as a template in the Templates tab and mark it approved once Meta confirms.</span>
                </span>
              </Alert>
            )}
          </div>

          {/* Phone preview */}
          <Card className="lg:col-span-2 !p-4 flex flex-col items-center">
            <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">Preview</p>
            <PhonePreview channel={channel} body={fillSample(body, customValues)} sender={senderLabel} />
            <p className="mt-3 text-[11px] text-surface-400 text-center">Names are shown as samples. Each contact gets their own details.</p>
          </Card>
        </div>
      </form>

      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4" onClick={() => setShowTemplates(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100">
              <h2 className="text-sm font-semibold text-surface-900">Choose a {cfg.label} template</h2>
              <button type="button" onClick={() => setShowTemplates(false)} className="p-1 rounded text-surface-400 hover:bg-surface-100" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4">
              {templates.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-2">Your templates</p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {templates.map((t) => (
                      <button type="button" key={t.id} onClick={() => applyText(t.body, t.name)} className="text-left rounded-lg border border-surface-200 p-3 hover:border-brand-300 hover:bg-brand-50/30">
                        <p className="text-sm font-semibold text-surface-900 truncate">{t.name}{channel === "whatsapp" && t.approved && <span className="ml-2 text-[10px] text-success-dark bg-success-light rounded-full px-1.5 py-0.5">Approved</span>}</p>
                        <p className="mt-1 text-xs text-surface-500 line-clamp-3 whitespace-pre-line">{t.body}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-2">Starter ideas</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {STARTER_TEMPLATES[channel].map((t) => (
                    <button type="button" key={t.id} onClick={() => applyText(t.body, t.name)} className="text-left rounded-lg border border-surface-200 p-3 hover:border-brand-300 hover:bg-brand-50/30">
                      <p className="text-sm font-semibold text-surface-900">{t.emoji} {t.name}</p>
                      <p className="mt-1 text-xs text-surface-500 line-clamp-3 whitespace-pre-line">{t.body}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
