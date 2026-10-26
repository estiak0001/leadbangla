import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Inbox, Send } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import MailSetup from "../mail/MailSetup";
import { SendingDomainsPanel } from "./EmailDomainsPage";
import { fetchMailSetup, type MailSetup as InboxSetup } from "../../lib/mail";
import type { EmailProviderInfo, SenderAddress, SendingDomain } from "../../lib/emailDomains";

type Tab = "sending" | "inbox";
interface Step { label: string; hint: string; done: boolean; tab: Tab }

function StepRow({ step, onOpen }: { step: Step; onOpen: (t: Tab) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(step.tab)} className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-surface-50">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${step.done ? "border-success-base bg-success-base text-white" : "border-surface-300 bg-white"}`}>
          {step.done && <Check size={12} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${step.done ? "text-surface-500" : "font-medium text-surface-900"}`}>{step.label}</span>
          {!step.done && <span className="block truncate text-xs text-surface-500">{step.hint}</span>}
        </span>
        {!step.done && <ArrowRight size={14} className="shrink-0 text-surface-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />}
      </button>
    </li>
  );
}

export default function EmailSetupPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "inbox" ? "inbox" : "sending";
  const [domains, setDomains] = useState<SendingDomain[]>([]);
  const [senders, setSenders] = useState<SenderAddress[]>([]);
  const [provider, setProvider] = useState<EmailProviderInfo | null>(null);
  const [inbox, setInbox] = useState<InboxSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = (t: Tab) => setParams({ tab: t });

  const loadInbox = useCallback(() => fetchMailSetup().then(setInbox).catch((e) => setError(e.message)), []);
  useEffect(() => { loadInbox(); }, [loadInbox]);

  const sending: Step[] = [
    { label: "Connect email delivery", hint: "Needed once for the whole platform", done: !!provider?.configured, tab: "sending" },
    { label: "Add and verify a domain", hint: "Add the DNS records we show you", done: domains.some((d) => d.status === "verified"), tab: "sending" },
    { label: "Create a sender address", hint: "The “From” address on your campaigns", done: senders.length > 0, tab: "sending" },
  ];
  const receiving: Step[] = [
    { label: "Turn on the inbox", hint: "Add one MX record for your domain", done: !!inbox?.domains.some((d) => d.status === "active"), tab: "inbox" },
    { label: "Create an inbox address", hint: "For example support@yourbrand.com", done: !!inbox?.addresses.length, tab: "inbox" },
  ];
  const all = [...sending, ...receiving];
  const doneCount = all.filter((s) => s.done).length;
  const next = all.find((s) => !s.done);

  const tabs: { key: Tab; label: string; icon: typeof Send; hint: string }[] = [
    { key: "sending", label: "Sending", icon: Send, hint: `${domains.filter((d) => d.status === "verified").length} of ${domains.length} verified` },
    { key: "inbox", label: "Inbox", icon: Inbox, hint: `${inbox?.addresses.length ?? 0} address${inbox?.addresses.length === 1 ? "" : "es"}` },
  ];
  const intro: Record<Tab, string> = {
    sending: "Verify your domain once, then send campaigns from your own addresses. This is what you need to send email.",
    inbox: "Optional. Receive mail sent to your domain (like support@yourbrand.com) and reply from one shared inbox. You can use sending without it.",
  };

  return (
    <AppLayout>
      <Link to="/campaigns" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"><ArrowLeft size={14} /> Back to Campaigns</Link>
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-surface-900 sm:text-2xl">Email Setup</h1>
        <p className="mt-1 text-sm text-surface-600">Sending and receiving are set up separately. Do only what you need.</p>
      </div>

      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-4">{error}</Alert>}

      <section className="mb-6 rounded-xl border border-surface-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className="text-sm font-semibold text-surface-900">Setup progress <span className="ml-1 font-normal text-surface-500">{doneCount} of {all.length} done</span></h2>
          {next ? (
            <button onClick={() => go(next.tab)} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">Next: {next.label} <ArrowRight size={14} /></button>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-success-dark"><Check size={14} /> Everything is set up</span>
          )}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-100" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={all.length}>
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(doneCount / all.length) * 100}%` }} />
        </div>
        <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
          <div>
            <p className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-surface-500"><Send size={12} /> Sending</p>
            <ul>{sending.map((s) => <StepRow key={s.label} step={s} onOpen={go} />)}</ul>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-surface-500"><Inbox size={12} /> Receiving <span className="font-normal normal-case tracking-normal text-surface-400">(optional)</span></p>
            <ul>{receiving.map((s) => <StepRow key={s.label} step={s} onOpen={go} />)}</ul>
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-10 -mx-1 mb-4 bg-surface-50/95 px-1 pb-3 pt-1 backdrop-blur">
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-surface-200 bg-white p-1 sm:inline-grid sm:min-w-[22rem]" role="tablist">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => go(t.key)}
              className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition ${tab === t.key ? "bg-brand-600 font-semibold text-white shadow-sm" : "text-surface-600 hover:bg-surface-50 hover:text-surface-900"}`}>
              <t.icon size={15} />
              <span>{t.label}</span>
              <span className={`hidden text-xs font-normal sm:inline ${tab === t.key ? "text-white/75" : "text-surface-400"}`}>{t.hint}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 max-w-3xl text-sm text-surface-600">{intro[tab]}</p>
      </div>

      {/* both stay mounted so switching tabs is instant and keeps their state */}
      <div className={tab === "sending" ? "" : "hidden"}>
        <SendingDomainsPanel onLoaded={(d, s, p) => { setDomains(d); setSenders(s); setProvider(p); loadInbox(); }} />
      </div>
      <div className={tab === "inbox" ? "" : "hidden"}>
        {inbox ? <MailSetup setup={inbox} onChange={loadInbox} hideBanner /> : <div className="flex justify-center py-12"><Spinner size="lg" /></div>}
      </div>
    </AppLayout>
  );
}
