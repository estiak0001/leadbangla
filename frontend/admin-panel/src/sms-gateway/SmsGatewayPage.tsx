import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, ArrowUpRight, CheckCircle2, Circle, ExternalLink, KeyRound, Loader2, MessageSquareText,
  Radio, RefreshCw, Send, ShieldCheck, Trash2, Wallet,
} from "lucide-react";
import AppLayout from "../components/AppLayout";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import PageHeader from "../components/PageHeader";
import SenderIdsTab from "./SenderIdsTab";
import MaskingGuideTab from "./MaskingGuideTab";
import UsageTab from "./UsageTab";
import { VerificationQueue } from "../verifications/VerificationsPage";
import Spinner from "../components/Spinner";
import {
  activateGateway, clearGatewayCredentials, fetchGateway, saveGatewayCredentials, sendGatewayTest, testGateway,
  type GatewayOverview, type GatewayProvider, type GatewayResult,
} from "../lib/smsGateway";

const fmt = (ts: string | null) => (ts ? new Date(ts).toLocaleString("en-BD", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "never");

function Confirm({ title, body, confirmLabel, danger, busy, onConfirm, onClose }: {
  title: string; body: string; confirmLabel: string; danger?: boolean; busy: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3.5">
          <span className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${danger ? "bg-danger-light text-danger-base" : "bg-brand-50 text-brand-600"}`}>
            {danger ? <AlertTriangle size={18} /> : <Radio size={18} />}
          </span>
          <div><h2 className="font-semibold text-surface-900">{title}</h2><p className="mt-1.5 text-sm text-surface-600">{body}</p></div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" variant={danger ? "danger" : "primary"} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

export default function SmsGatewayPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab");
  const tab = (["requests", "sender-ids", "usage", "guide"] as const).find((t) => t === rawTab) ?? "gateway";
  const [data, setData] = useState<GatewayOverview | null>(null);
  const [selected, setSelected] = useState<string>("alphasms");
  const [error, setError] = useState<string | null>(null);

  const [values, setValues] = useState<Record<string, string>>({});
  const [editingSecret, setEditingSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<GatewayResult | null>(null);
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<GatewayResult | null>(null);
  const [confirm, setConfirm] = useState<null | "live" | "off" | "clear">(null);
  const [busy, setBusy] = useState(false);

  const load = () => fetchGateway().then(setData).catch((e) => {
    if (e instanceof Error && e.message === "UNAUTHORIZED") { navigate("/login"); return; }
    setError("Failed to load the SMS gateway settings");
  });
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const provider: GatewayProvider | undefined = data?.providers.find((p) => p.code === selected);
  useEffect(() => { setValues({}); setEditingSecret(false); setTest(null); setSent(null); }, [selected]);

  if (!data || !provider) return <AppLayout><div className="py-16 flex justify-center">{error ? <Alert>{error}</Alert> : <Spinner size="lg" />}</div></AppLayout>;

  const live = data.active === provider.code;
  const activeProvider = data.providers.find((p) => p.code === data.active);
  const tested = provider.last_test_ok === true;
  const steps = [
    { label: "Save credentials", done: provider.has_credentials },
    { label: "Test the connection", done: tested },
    { label: "Send yourself a test SMS", done: !!sent?.ok },
    { label: "Go live", done: live },
  ];

  const run = async <T,>(set: (b: boolean) => void, fn: () => Promise<T>) => { set(true); setError(null); try { return await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } finally { set(false); } };

  async function save(e: FormEvent) {
    e.preventDefault();
    const r = await run(setSaving, () => saveGatewayCredentials(provider!.code, values));
    if (r) { setValues({}); setEditingSecret(false); setTest(null); await load(); }
  }
  async function doTest() { const r = await run(setTesting, () => testGateway(provider!.code)); if (r) { setTest(r); await load(); } }
  async function doSend(e: FormEvent) { e.preventDefault(); const r = await run(setSending, () => sendGatewayTest(provider!.code, phone)); if (r) setSent(r); }
  async function doConfirm() {
    setBusy(true);
    try {
      if (confirm === "live") await activateGateway(provider!.code, true);
      else if (confirm === "off") await activateGateway(provider!.code, false);
      else if (confirm === "clear") await clearGatewayCredentials(provider!.code);
      setConfirm(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); setConfirm(null); } finally { setBusy(false); }
  }

  const stats = [
    { label: "SMS sent this month", value: data.stats.sent_this_month.toLocaleString(), icon: <Send size={18} />, tone: "text-sky-700 bg-sky-50" },
    { label: "Failed this month", value: data.stats.failed_this_month.toLocaleString(), icon: <AlertTriangle size={18} />, tone: data.stats.failed_this_month ? "text-danger-dark bg-danger-light" : "text-surface-500 bg-surface-100" },
    { label: "Masking requests waiting", value: data.stats.pending_masking_requests.toLocaleString(), icon: <ShieldCheck size={18} />, tone: "text-warning-dark bg-warning-light", to: "/integrations/sms?tab=requests" },
    { label: "Customers with masking", value: data.stats.masking_approved.toLocaleString(), icon: <CheckCircle2 size={18} />, tone: "text-success-dark bg-success-light" },
    { label: "Price per SMS (customers)", value: data.customer_rate_bdt != null ? `৳${data.customer_rate_bdt.toFixed(2)}` : "—", icon: <Wallet size={18} />, tone: "text-brand-700 bg-brand-50", to: "/plans" },
  ];

  return (
    <AppLayout>
      <Link to="/integrations" className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-brand-600 font-medium mb-2"><ArrowLeft size={14} /> Integrations</Link>
      <PageHeader title="SMS" description="Connect the provider that delivers every customer's SMS, test it, and manage masking Sender IDs." />
      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-4">{error}</Alert>}

      {/* Tabs */}
      <div className="flex gap-0 sm:gap-0.5 border-b border-surface-200 mb-4">
        {([["gateway", "Gateway"], ["requests", "Requests"], ["sender-ids", "Sender IDs"], ["usage", "Usage"], ["guide", "Guide"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setParams(k === "gateway" ? {} : { tab: k })}
            className={`flex items-center gap-1 whitespace-nowrap px-1.5 sm:px-3.5 py-2.5 text-[13px] sm:text-sm font-medium border-b-2 -mb-px transition-colors ${tab === k ? "border-brand-500 text-brand-700" : "border-transparent text-surface-500 hover:text-surface-800"}`}>
            {label}
            {k === "requests" && data.stats.pending_masking_requests > 0 && <span className="rounded-full bg-warning-base px-1.5 py-0.5 text-[10px] font-bold text-white">{data.stats.pending_masking_requests}</span>}
          </button>
        ))}
      </div>

      {tab === "requests" ? <VerificationQueue kind="sms_sender_id" onChanged={load} /> : tab === "sender-ids" ? <SenderIdsTab onChanged={load} /> : tab === "usage" ? <UsageTab /> : tab === "guide" ? <MaskingGuideTab /> : (
        <>
      {/* Status banner */}
      <div className={`mb-3 flex items-center gap-2.5 rounded-[4px] border px-3 py-2 ${activeProvider ? "border-success-base/30 bg-success-light" : "border-warning-base/40 bg-warning-light"}`}>
        <span className={activeProvider ? "text-success-dark" : "text-warning-dark"}>{activeProvider ? <Radio size={16} /> : <AlertTriangle size={16} />}</span>
        <p className="text-sm min-w-0"><b className="text-surface-900">{activeProvider ? `Live through ${activeProvider.name}` : "Not live — messages are simulated."}</b>{" "}
          <span className="text-xs text-surface-600">{activeProvider ? "Customer campaigns are delivered through this provider." : "Customer SMS look sent but nothing is delivered. Finish the steps below."}</span></p>
      </div>

      {/* Stats */}
      <div className="mb-3 grid grid-cols-2 lg:grid-cols-5 bg-white border border-surface-200 rounded-[4px] divide-x divide-y lg:divide-y-0 divide-surface-100 overflow-hidden">
        {stats.map((s) => {
          const inner = <div className="px-3.5 py-2"><p className="text-[11px] text-surface-500 truncate">{s.label}</p><p className="text-lg font-bold text-surface-900 tabular-nums leading-tight">{s.value}</p></div>;
          return s.to ? <Link key={s.label} to={s.to} className="hover:bg-surface-50 block">{inner}</Link> : <div key={s.label}>{inner}</div>;
        })}
      </div>

      {/* Provider picker */}
      <div className="grid sm:grid-cols-2 gap-2 mb-3">
        {data.providers.map((p) => (
          <button key={p.code} onClick={() => setSelected(p.code)}
            className={`text-left rounded-[4px] border px-3 py-2 bg-white transition ${selected === p.code ? "border-brand-500 bg-brand-50/40" : "border-surface-200 hover:bg-surface-50"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-semibold text-surface-900"><MessageSquareText size={16} className="text-brand-600" /> {p.name}</span>
              {data.active === p.code ? <Badge variant="success" size="sm" dot>Live</Badge> : p.has_credentials ? <Badge variant="default" size="sm">Configured</Badge> : <Badge variant="default" size="sm">Not set up</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-surface-500 truncate">{p.tagline}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          {/* Credentials */}
          <Card className="!p-4">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-sm font-semibold text-surface-800 flex items-center gap-2"><KeyRound size={15} /> {provider.name} credentials</h2>
              <a href={provider.docs} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">API docs <ExternalLink size={11} /></a>
            </div>
            <p className="text-xs text-surface-500 mb-3">Stored encrypted. Customers never see these.</p>
            <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 items-start">
              {provider.fields.map((f) => (
                <div key={f.key}>
                  {f.secret && f.is_set && !editingSecret ? (
                    <div>
                      <label className="block text-sm font-medium text-surface-700 mb-1.5">{f.label}</label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-[3px] border border-surface-200 bg-surface-50 px-3 py-1.5 text-sm font-mono text-surface-600">{f.value}</div>
                        <Button type="button" size="sm" variant="secondary" onClick={() => setEditingSecret(true)}>Change</Button>
                      </div>
                    </div>
                  ) : (
                    <Input inputSize="sm" label={f.label + (f.required ? " *" : "")} type={f.secret ? "password" : "text"} autoComplete="off"
                      placeholder={f.secret ? "Paste your key" : "Optional"} value={values[f.key] ?? (f.secret ? "" : f.value)} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                  )}
                  <p className="mt-1 text-[11px] text-surface-500">{f.hint}</p>
                </div>
              ))}
              <div className="sm:col-span-2 flex items-center gap-2">
                <Button type="submit" size="sm" loading={saving}>Save credentials</Button>
                {provider.has_credentials && <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={13} />} className="text-danger-base hover:bg-danger-light" onClick={() => setConfirm("clear")}>Remove</Button>}
              </div>
            </form>
          </Card>

          {/* Test connection + send test */}
          <Card className="!p-4">
            <h2 className="text-sm font-semibold text-surface-800 mb-3 flex items-center gap-2"><RefreshCw size={15} /> Test it</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 items-start">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <Button size="sm" variant="secondary" disabled={!provider.has_credentials} loading={testing} onClick={doTest}>{testing ? "Checking…" : provider.code === "alphasms" ? "Test connection & read balance" : "Test connection"}</Button>
                  <span className="text-xs text-surface-500">Last test: {fmt(provider.last_tested_at)}{provider.last_test_ok === true && " · passed"}{provider.last_test_ok === false && " · failed"}</span>
                </div>
                {test && (
                  <div className={`mt-2 rounded-[3px] px-3 py-2 text-sm flex items-start gap-2 ${test.ok ? "bg-success-light text-success-dark" : "bg-danger-light text-danger-dark"}`}>
                    {test.ok ? <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />}<span>{test.message}</span>
                  </div>
                )}
              </div>
              <form onSubmit={doSend}>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Send a real test SMS</label>
                <div className="flex gap-2">
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX"
                    className="flex-1 min-w-0 rounded-[3px] border border-surface-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
                  <Button type="submit" size="sm" icon={sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} disabled={!provider.has_credentials || phone.replace(/\D/g, "").length < 10 || sending}>Send</Button>
                </div>
                <p className="mt-1 text-[11px] text-surface-500">Uses the saved key and the default sender. Works before you go live and costs one SMS from your gateway balance.</p>
                {sent && <div className={`mt-2 rounded-[3px] px-3 py-2 text-sm ${sent.ok ? "bg-success-light text-success-dark" : "bg-danger-light text-danger-dark"}`}>{sent.message}</div>}
              </form>
            </div>
          </Card>
        </div>

        {/* Right column: checklist + go live + help */}
        <div className="space-y-4">
          <Card className="!p-4">
            <h2 className="text-sm font-semibold text-surface-800 mb-3">Setup progress</h2>
            <ol className="space-y-1.5">
              {steps.map((s, i) => (
                <li key={s.label} className="flex items-center gap-2.5 text-sm">
                  {s.done ? <CheckCircle2 size={18} className="text-success-base flex-shrink-0" /> : <Circle size={18} className="text-surface-300 flex-shrink-0" />}
                  <span className={s.done ? "text-surface-900" : "text-surface-500"}>{i + 1}. {s.label}</span>
                </li>
              ))}
            </ol>
            <div className="mt-3 pt-3 border-t border-surface-100">
              {live ? (
                <Button size="sm" variant="secondary" className="w-full" onClick={() => setConfirm("off")}>Switch off</Button>
              ) : (
                <Button size="sm" className="w-full" icon={<Radio size={14} />} disabled={!provider.has_credentials} onClick={() => setConfirm("live")}>Go live with {provider.name}</Button>
              )}
              {!provider.has_credentials && <p className="mt-2 text-[11px] text-surface-500 text-center">Save credentials first.</p>}
              {!live && provider.has_credentials && !tested && <p className="mt-2 text-[11px] text-warning-dark text-center">Tip: run “Test connection” before going live.</p>}
            </div>
          </Card>

          <Card className="!p-4 bg-surface-50">
            <details><summary className="cursor-pointer list-none text-sm font-semibold text-surface-800 flex items-center justify-between">How it fits together<span className="text-xs text-surface-400">▾</span></summary>
            <ul className="mt-2 text-xs text-surface-600 space-y-2 list-disc pl-4">
              <li><b>Plans</b> decide who may send SMS, the monthly cap and whether a masking Sender ID is allowed (<Link to="/plans" className="text-brand-600 underline">Plans &amp; Rates</Link>).</li>
              <li><b>Wallet:</b> each message is charged to the customer at the price per SMS; failed messages are refunded automatically.</li>
              <li><b>Masking:</b> a customer sends documents; you review them under the <Link to="/integrations/sms?tab=requests" className="text-brand-600 underline">Requests</Link> tab, create the Sender ID with the provider, then approve it.</li>
              {provider.code === "alphasms" && <li>Alpha SMS sender names are created in the Alpha SMS panel. Without one, messages use Alpha's default sender.</li>}
            </ul>
            <Link to="/integrations/sms?tab=guide" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">Read the masking guide <ArrowUpRight size={12} /></Link>
            </details>
          </Card>
        </div>
      </div>
        </>
      )}

      {confirm && (
        <Confirm
          busy={busy} onClose={() => setConfirm(null)} onConfirm={doConfirm}
          danger={confirm !== "live"}
          title={confirm === "live" ? `Go live with ${provider.name}?` : confirm === "off" ? "Switch SMS off?" : "Remove these credentials?"}
          body={confirm === "live"
            ? `Every customer's SMS will be delivered through ${provider.name}${data.active && data.active !== provider.code ? ` (replacing ${activeProvider?.name})` : ""}. Real messages are sent and your gateway balance is used.`
            : confirm === "off" ? "No provider will be live. Customer SMS will be simulated and nothing will be delivered."
              : "The saved key is deleted and the provider is switched off."}
          confirmLabel={confirm === "live" ? "Go live" : confirm === "off" ? "Switch off" : "Remove"}
        />
      )}
    </AppLayout>
  );
}
