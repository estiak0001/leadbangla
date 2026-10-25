import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, Circle, ExternalLink, KeyRound, Lightbulb, Radio, RefreshCw, Send, Trash2 } from "lucide-react";
import AppLayout from "../components/AppLayout";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import Spinner from "../components/Spinner";
import Toggle from "../components/Toggle";
import { INTEGRATION_INFO } from "../lib/integrationInfo";
import { fetchSesWebhookUrls, generatePushKeys, sendWhatsAppTest } from "../lib/integrations";
import {
  SERVICE_FIELDS, clearIntegrationCredentials, fetchSavedFields, listIntegrations, saveIntegrationCredentials,
  checkMailSetup, sendSesTestEmail, testIntegration, updateIntegration, type IntegrationTestResult, type PlatformServiceAdmin, type SavedField,
} from "../lib/integrations";
import { CATEGORY_META, pageFor, statusOf } from "./IntegrationHubPage";

const when = (ts: string | null) => (ts ? new Date(ts).toLocaleString("en-BD", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "never");

/** The page for /integrations/:code. */
const IAM_POLICY = `{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": [
        "ses:DescribeActiveReceiptRuleSet", "ses:CreateReceiptRuleSet", "ses:SetActiveReceiptRuleSet",
        "ses:CreateReceiptRule", "ses:UpdateReceiptRule", "ses:DeleteReceiptRule" ], "Resource": "*" },
    { "Effect": "Allow", "Action": [ "s3:GetObject", "s3:DeleteObject" ], "Resource": "arn:aws:s3:::YOUR_BUCKET/*" },
    { "Effect": "Allow", "Action": [ "s3:ListBucket" ], "Resource": "arn:aws:s3:::YOUR_BUCKET" }
  ]
}`;
const BUCKET_POLICY = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowSESPuts", "Effect": "Allow", "Principal": { "Service": "ses.amazonaws.com" },
    "Action": "s3:PutObject", "Resource": "arn:aws:s3:::YOUR_BUCKET/*",
    "Condition": { "StringEquals": { "AWS:SourceAccount": "YOUR_AWS_ACCOUNT_ID" } }
  }]
}`;
const TOPIC_POLICY = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowSESPublish", "Effect": "Allow", "Principal": { "Service": "ses.amazonaws.com" },
    "Action": "sns:Publish", "Resource": "YOUR_TOPIC_ARN",
    "Condition": { "StringEquals": { "AWS:SourceAccount": "YOUR_AWS_ACCOUNT_ID" } }
  }]
}`;

function Snippet({ title, text }: { title: string; text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-surface-600">{title}</p>
        <button type="button" className="text-[11px] text-brand-600 hover:underline" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); })}>{done ? "Copied" : "Copy"}</button>
      </div>
      <pre className="mt-1 overflow-x-auto rounded-[3px] bg-surface-50 border border-surface-200 p-2 text-[11px] leading-snug font-mono text-surface-700">{text}</pre>
    </div>
  );
}

function InboxGuide({ webhook, eventsUrl }: { webhook: string; eventsUrl?: string }) {
  return (
    <ol className="mt-3 list-decimal list-inside space-y-3 text-xs text-surface-700 rounded-[4px] border border-surface-200 bg-white p-3">
      <li><b>Create an S3 bucket</b> in the same region as SES (block public access on). Put its name in “Inbox: S3 bucket name” above and save.
        <Snippet title="Bucket policy (lets SES store received mail) — replace YOUR_BUCKET and YOUR_AWS_ACCOUNT_ID" text={BUCKET_POLICY} /></li>
      <li><b>Add permissions to the IAM user</b> you use for SES (an extra policy).
        <Snippet title="IAM policy — replace YOUR_BUCKET" text={IAM_POLICY} /></li>
      <li><b>For new mail to appear on its own:</b> create an SNS topic in the same region, allow SES to publish to it, put its ARN in “Inbox: SNS topic ARN”, and add an HTTPS subscription to the address below (use your Webhook Secret and a public https URL).
        <Snippet title="Topic policy — replace YOUR_TOPIC_ARN and YOUR_AWS_ACCOUNT_ID" text={TOPIC_POLICY} />
        <Snippet title="Subscription endpoint (mail received)" text={webhook} />
        {eventsUrl && <Snippet title="Subscription endpoint (bounces and complaints — separate SNS topic)" text={eventsUrl} />}</li>
      <li>Press <b>Check inbox setup</b>. When everything is green, customers can enable an inbox on their verified domain (Mail → Setup).</li>
      <li className="text-surface-500">LeadBangla creates and manages its own SES receipt rule set (<code>leadbangla-inbox</code>) and one rule per customer domain. If your AWS account already has a different active receipt rule set in this region, LeadBangla will not replace it — you'll see that in the check.</li>
    </ol>
  );
}

export default function IntegrationDetailPage() {
  const { code = "" } = useParams<{ code: string }>();
  return <AppLayout><IntegrationPanel code={code} /></AppLayout>;
}

/** Credentials, test, go-live and guidance for one integration. Also embedded in the WhatsApp panel. */
export function IntegrationPanel({ code, embedded = false }: { code: string; embedded?: boolean }) {
  const navigate = useNavigate();
  const [svc, setSvc] = useState<PlatformServiceAdmin | null>(null);
  const [saved, setSaved] = useState<Record<string, SavedField>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [changing, setChanging] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<IntegrationTestResult | null>(null);
  const [waTo, setWaTo] = useState("");
  const [waBusy, setWaBusy] = useState(false);
  const [waResult, setWaResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [mailTo, setMailTo] = useState("");
  const [mailing, setMailing] = useState(false);
  const [mailResult, setMailResult] = useState<IntegrationTestResult | null>(null);
  const [inboxChecks, setInboxChecks] = useState<{ ok: boolean; region: string; mx: string; checks: { name: string; ok: boolean; message: string }[] } | null>(null);
  const [inboxBusy, setInboxBusy] = useState(false);
  const [inboxGuide, setInboxGuide] = useState(false);
  const [sesUrls, setSesUrls] = useState<{ inbound: string; events: string } | null>(null);
  useEffect(() => {
    if (code === "amazon_ses" && inboxGuide && !sesUrls) fetchSesWebhookUrls().then(setSesUrls).catch(() => undefined);
  }, [code, inboxGuide, sesUrls]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [genKeys, setGenKeys] = useState(false);

  const fields = SERVICE_FIELDS[code] ?? [];
  const info = INTEGRATION_INFO[code];

  const fail = (e: unknown) => {
    if (e instanceof Error && e.message === "UNAUTHORIZED") { navigate("/login"); return; }
    setError(e instanceof Error ? e.message : "Something went wrong");
  };
  const reload = async () => {
    const [all, fl] = await Promise.all([listIntegrations(), fetchSavedFields(code)]);
    setSvc(all.find((s) => s.code === code) ?? null);
    setSaved(fl);
  };
  useEffect(() => { reload().catch(fail); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [code]);

  if (svc && !embedded && svc.category === "sms") return <Navigate to="/integrations/sms" replace />;
  if (svc && !embedded && svc.category === "whatsapp") return <Navigate to="/integrations/whatsapp" replace />;
  if (!svc) return <div className="py-16 flex justify-center">{error ? <Alert>{error}</Alert> : <Spinner size="lg" />}</div>;

  const st = statusOf(svc);
  const meta = CATEGORY_META[svc.category];
  const Icon = meta.icon;
  const required = info?.required ?? fields.map((f) => f.key);
  const complete = required.every((k) => saved[k]?.is_set);
  const tested = svc.last_test_ok === true;
  const steps = [
    { label: "Save the required credentials", done: complete },
    { label: "Test the connection", done: tested },
    { label: "Switch it on", done: svc.is_live && svc.is_enabled },
  ];

  async function save(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try { await saveIntegrationCredentials(code, values, required); setValues({}); setChanging({}); setResult(null); await reload(); }
    catch (err) { fail(err); } finally { setSaving(false); }
  }
  async function makeKeys() {
    if (saved.vapid_private_key?.is_set && !window.confirm("Replace the platform's push keys? Everyone who already subscribed will have to subscribe again.")) return;
    setGenKeys(true); setError(null);
    try { await generatePushKeys(); setResult(null); await reload(); } catch (err) { fail(err); } finally { setGenKeys(false); }
  }
  async function test() { setTesting(true); setError(null); try { setResult(await testIntegration(code)); await reload(); } catch (err) { fail(err); } finally { setTesting(false); } }
  async function sendWa(e: FormEvent) { e.preventDefault(); setWaBusy(true); try { setWaResult(await sendWhatsAppTest(waTo)); } catch (err) { fail(err); } finally { setWaBusy(false); } }
  async function runInboxCheck() { setInboxBusy(true); setError(null); try { setInboxChecks(await checkMailSetup()); } catch (err) { fail(err); } finally { setInboxBusy(false); } }
  async function sendMail(e: FormEvent) { e.preventDefault(); setMailing(true); try { setMailResult(await sendSesTestEmail(mailTo)); } catch (err) { fail(err); } finally { setMailing(false); } }
  async function toggle(key: "is_live" | "is_enabled", v: boolean) {
    setError(null);
    try { setSvc(await updateIntegration(code, { [key]: v })); } catch (err) { fail(err); }
  }
  async function clear() { try { await clearIntegrationCredentials(code); setConfirmClear(false); setResult(null); await reload(); } catch (err) { fail(err); } }

  return (
    <>
      {!embedded && <Link to="/integrations" className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-brand-600 font-medium mb-2"><ArrowLeft size={14} /> Integrations</Link>}

      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-10 h-10 rounded-[4px] flex items-center justify-center flex-shrink-0 ${meta.tone}`}><Icon size={20} /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-surface-900 tracking-tight">{svc.name}</h1>
              <Badge variant={st.variant} dot>{st.label}</Badge>
              <span className="text-xs text-surface-400">{meta.label}</span>
            </div>
            <p className="text-sm text-surface-500">{info?.tagline ?? svc.description}</p>
          </div>
        </div>
        {svc.docs_url && <a href={svc.docs_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"><BookOpen size={15} /> Provider docs <ExternalLink size={12} /></a>}
      </div>

      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-4">{error}</Alert>}
      {svc.is_live && !svc.has_credentials && <Alert variant="warning" className="mb-4">This service is switched on but has no credentials, so it falls back to simulated/fake mode.</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <Card className="!p-4">
            <h2 className="text-sm font-semibold text-surface-800 flex items-center gap-2"><KeyRound size={15} /> Credentials</h2>
            <p className="text-xs text-surface-500 mb-3">Stored encrypted and never shown in full. Leave a secret blank to keep what is saved.</p>
            {code === "firebase_vapid" && (
              <div className="mb-3 flex items-center gap-3 flex-wrap rounded-[3px] bg-surface-50 border border-surface-200 px-3 py-2">
                <Button type="button" size="sm" variant="secondary" loading={genKeys} onClick={makeKeys}>{saved.vapid_private_key?.is_set ? "Generate new key pair" : "Generate key pair"}</Button>
                <span className="text-xs text-surface-500">{saved.vapid_private_key?.is_set ? "Replaces the saved keys. Existing subscribers must subscribe again." : "Creates and saves both keys for you."}</span>
              </div>
            )}
            <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              {fields.map((f) => {
                const sv = saved[f.key];
                const isSecret = f.type === "password";
                const req = required.includes(f.key);
                return (
                  <div key={f.key}>
                    {isSecret && sv?.is_set && !changing[f.key] ? (
                      <div>
                        <label className="block text-sm font-medium text-surface-700 mb-1.5">{f.label}{req && <span className="text-danger-base"> *</span>}</label>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 rounded-[3px] border border-surface-200 bg-surface-50 px-3 py-1.5 text-sm font-mono text-surface-600">{sv.preview}</div>
                          <Button type="button" size="sm" variant="secondary" onClick={() => setChanging({ ...changing, [f.key]: true })}>Change</Button>
                        </div>
                      </div>
                    ) : (
                      <Input inputSize="sm" label={f.label + (req ? " *" : "")} type={isSecret ? "password" : "text"} autoComplete="off"
                        placeholder={isSecret ? "Paste the value" : ""} value={values[f.key] ?? (isSecret ? "" : sv?.preview ?? "")} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                    )}
                    {f.hint && <p className="mt-1 text-[11px] text-surface-500">{f.hint}</p>}
                  </div>
                );
              })}
              <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                <Button type="submit" size="sm" loading={saving}>Save credentials</Button>
                {svc.has_credentials && <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={13} />} className="text-danger-base hover:bg-danger-light" onClick={() => setConfirmClear(true)}>Remove all</Button>}
              </div>
            </form>
          </Card>

          <Card className="!p-4">
            <h2 className="text-sm font-semibold text-surface-800 mb-3 flex items-center gap-2"><RefreshCw size={15} /> Test</h2>
            <div className="flex items-center gap-3 flex-wrap">
              <Button size="sm" variant="secondary" disabled={!svc.has_credentials} loading={testing} onClick={test}>{testing ? "Checking…" : "Test connection"}</Button>
              <span className="text-xs text-surface-500">Last test: {when(svc.last_tested_at)}{svc.last_test_ok === true && " · passed"}{svc.last_test_ok === false && " · failed"}</span>
            </div>
            {(result || (svc.last_test_ok === false && svc.last_test_error)) && (
              <div className={`mt-2 rounded-[3px] px-3 py-2 text-sm flex items-start gap-2 ${(result ? result.ok : false) ? "bg-success-light text-success-dark" : "bg-danger-light text-danger-dark"}`}>
                {result?.ok ? <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />}
                <span>{result ? result.message : svc.last_test_error}</span>
              </div>
            )}
            {(code === "whatsapp_bsp" || code === "meta_whatsapp") && (
              <form onSubmit={sendWa} className="mt-4 max-w-md">
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Send a test WhatsApp message</label>
                {code === "meta_whatsapp" && <p className="text-[11px] text-surface-500 mb-1.5">Sends Meta’s built-in “hello_world” template. Your own number must be allowed in the app while it is in test mode.</p>}
                <div className="flex gap-2">
                  <input type="tel" value={waTo} onChange={(e) => setWaTo(e.target.value)} placeholder="01XXXXXXXXX" className="flex-1 min-w-0 rounded-[3px] border border-surface-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
                  <Button type="submit" size="sm" icon={<Send size={13} />} loading={waBusy} disabled={!svc.has_credentials || waTo.replace(/\D/g, "").length < 10}>Send</Button>
                </div>
                {waResult && <div className={`mt-2 rounded-[3px] px-3 py-2 text-sm ${waResult.ok ? "bg-success-light text-success-dark" : "bg-danger-light text-danger-dark"}`}>{waResult.message}</div>}
              </form>
            )}
            {code === "amazon_ses" && (
              <form onSubmit={sendMail} className="mt-4 max-w-md">
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Send a real test email</label>
                <div className="flex gap-2">
                  <input type="email" value={mailTo} onChange={(e) => setMailTo(e.target.value)} placeholder="you@example.com" className="flex-1 min-w-0 rounded-[3px] border border-surface-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
                  <Button type="submit" size="sm" icon={<Send size={13} />} loading={mailing} disabled={!svc.has_credentials || !mailTo.includes("@")}>Send</Button>
                </div>
                {mailResult && <div className={`mt-2 rounded-[3px] px-3 py-2 text-sm ${mailResult.ok ? "bg-success-light text-success-dark" : "bg-danger-light text-danger-dark"}`}>{mailResult.message}</div>}
              </form>
            )}
            {code === "amazon_ses" && (
              <div className="mt-6 pt-5 border-t border-surface-100">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-surface-800">Shared inbox (receiving email)</h3>
                  <Button type="button" size="xs" variant="secondary" loading={inboxBusy} disabled={!svc.has_credentials} onClick={runInboxCheck}>Check inbox setup</Button>
                  <button type="button" onClick={() => setInboxGuide((v) => !v)} className="text-xs font-medium text-brand-600 hover:underline">{inboxGuide ? "Hide" : "Show"} AWS setup guide</button>
                </div>
                <p className="text-xs text-surface-500">Lets customers receive and answer mail at addresses on their own domain, inside LeadBangla. Needs an S3 bucket (below) and a few extra AWS permissions.</p>
                {inboxChecks && (
                  <div className="mt-3 space-y-1.5">
                    {inboxChecks.checks.map((c) => (
                      <div key={c.name} className={`rounded-[3px] px-3 py-2 text-xs ${c.ok ? "bg-success-light text-success-dark" : "bg-danger-light text-danger-dark"}`}><b>{c.ok ? "✓" : "✗"} {c.name}.</b> {c.message}</div>
                    ))}
                    <p className="text-[11px] text-surface-500">Customers' MX record will be <code className="font-mono">{inboxChecks.mx}</code>. {inboxChecks.ok ? "Setup looks ready." : "Fix the red items, then check again."}</p>
                  </div>
                )}
                {inboxGuide && <InboxGuide webhook={sesUrls?.inbound ?? `${window.location.origin}/api/v1/public/mail/inbound?secret=YOUR_WEBHOOK_SECRET`} eventsUrl={sesUrls?.events} />}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="!p-4">
            <h2 className="text-sm font-semibold text-surface-800 mb-3">Setup progress</h2>
            <ol className="space-y-1.5">
              {steps.map((s, i) => (
                <li key={s.label} className="flex items-center gap-2.5 text-sm">
                  {s.done ? <CheckCircle2 size={16} className="text-success-base flex-shrink-0" /> : <Circle size={16} className="text-surface-300 flex-shrink-0" />}
                  <span className={s.done ? "text-surface-900" : "text-surface-500"}>{i + 1}. {s.label}</span>
                </li>
              ))}
            </ol>
            <div className="mt-3 pt-3 border-t border-surface-100 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-sm font-medium text-surface-800 flex items-center gap-1.5"><Radio size={14} /> Live</p><p className="text-[11px] text-surface-500">{info?.liveAffects ? `Affects ${info.liveAffects}` : "Use the real service"}</p></div>
                <Toggle value={svc.is_live} disabled={!svc.has_credentials} onChange={(v) => toggle("is_live", v)} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-sm font-medium text-surface-800">Enabled</p><p className="text-[11px] text-surface-500">Turn off to pause it without deleting credentials</p></div>
                <Toggle value={svc.is_enabled} onChange={(v) => toggle("is_enabled", v)} />
              </div>
              {!svc.has_credentials && <p className="text-[11px] text-surface-500">Save credentials to be able to go live.</p>}
            </div>
          </Card>

          {info && (
            <Card className="!p-0 divide-y divide-surface-100">
              <details className="group p-4" open>
                <summary className="cursor-pointer list-none text-sm font-semibold text-surface-800 flex items-center justify-between">What it&apos;s used for<span className="text-surface-400 text-xs group-open:rotate-180 transition">▾</span></summary>
                <ul className="mt-2 text-sm text-surface-700 space-y-1 list-disc pl-4">{info.usedFor.map((u) => <li key={u}>{u}</li>)}</ul>
                <p className="mt-3 text-xs text-surface-600 rounded-[3px] bg-warning-light px-2.5 py-2"><b>If it&apos;s not set up:</b> {info.ifMissing}</p>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-surface-500"><span>Cost</span><span className="font-medium text-surface-700 text-right">{svc.cost_model ?? "—"}</span></div>
              </details>
              <details className="group p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-surface-800 flex items-center justify-between"><span className="flex items-center gap-2"><Lightbulb size={15} className="text-amber-500" /> How to get the credentials</span><span className="text-surface-400 text-xs group-open:rotate-180 transition">▾</span></summary>
                <ol className="mt-2 text-xs text-surface-700 space-y-2 list-decimal pl-4">{info.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                {info.notes && <ul className="mt-3 text-xs text-surface-500 space-y-1 list-disc pl-4">{info.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
              </details>
            </Card>
          )}
        </div>
      </div>

      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4" onClick={() => setConfirmClear(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3.5">
              <span className="w-10 h-10 rounded-full flex items-center justify-center bg-danger-light text-danger-base flex-shrink-0"><AlertTriangle size={18} /></span>
              <div><h2 className="font-semibold text-surface-900">Remove all credentials?</h2><p className="mt-1.5 text-sm text-surface-600">{svc.name} is switched off and everything saved here is deleted. {info?.ifMissing}</p></div>
            </div>
            <div className="mt-5 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button><Button size="sm" variant="danger" onClick={clear}>Remove</Button></div>
          </div>
        </div>
      )}
    </>
  );
}

export { pageFor };
