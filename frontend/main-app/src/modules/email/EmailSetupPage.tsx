import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import MailSetup from "../mail/MailSetup";
import { SendingDomainsPanel } from "./EmailDomainsPage";
import { fetchMailSetup, type MailSetup as InboxSetup } from "../../lib/mail";
import type { EmailProviderInfo, SenderAddress, SendingDomain } from "../../lib/emailDomains";

type Tab = "sending" | "inbox";

export default function EmailSetupPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "inbox" ? "inbox" : "sending";
  const [domains, setDomains] = useState<SendingDomain[]>([]);
  const [senders, setSenders] = useState<SenderAddress[]>([]);
  const [provider, setProvider] = useState<EmailProviderInfo | null>(null);
  const [inbox, setInbox] = useState<InboxSetup | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadInbox = useCallback(() => fetchMailSetup().then(setInbox).catch((e) => setError(e.message)), []);
  useEffect(() => { loadInbox(); }, [loadInbox]);

  const steps = [
    { label: "Connect email delivery", done: !!provider?.configured, tab: "sending" as Tab },
    { label: "Add and verify a domain", done: domains.some((d) => d.status === "verified"), tab: "sending" as Tab },
    { label: "Create a sender address", done: senders.length > 0, tab: "sending" as Tab },
    { label: "Turn on the inbox", done: !!inbox?.domains.some((d) => d.status === "active"), tab: "inbox" as Tab },
    { label: "Create an inbox address", done: !!inbox?.addresses.length, tab: "inbox" as Tab },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);

  const tabs: { key: Tab; label: string; hint: string }[] = [
    { key: "sending", label: "Sending", hint: `${domains.filter((d) => d.status === "verified").length}/${domains.length} verified` },
    { key: "inbox", label: "Inbox (receiving)", hint: `${inbox?.addresses.length ?? 0} address${inbox?.addresses.length === 1 ? "" : "es"}` },
  ];

  return (
    <AppLayout>
      <Link to="/campaigns" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"><ArrowLeft size={14} /> Back to Email Campaigns</Link>
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-surface-900">Email Setup</h1>
        <p className="mt-1 text-sm text-surface-600">Your domains, sender addresses and shared inbox, all in one place.</p>
      </div>

      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-4">{error}</Alert>}

      <section className="mb-6 rounded-xl border border-surface-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-surface-900">Setup progress <span className="ml-1 font-normal text-surface-500">{doneCount} of {steps.length} done</span></h2>
          {next && <button onClick={() => setParams({ tab: next.tab })} className="text-sm font-medium text-brand-600 hover:text-brand-700">Next: {next.label} →</button>}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-100"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
        <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s) => (
            <li key={s.label}>
              <button onClick={() => setParams({ tab: s.tab })} className={`flex items-center gap-2 text-left text-sm ${s.done ? "text-surface-500" : "text-surface-800 hover:text-brand-700"}`}>
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${s.done ? "border-success-base bg-success-base text-white" : "border-surface-300"}`}>{s.done && <Check size={10} />}</span>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="mb-5 flex gap-1 border-b border-surface-200" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setParams({ tab: t.key })}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition ${tab === t.key ? "border-brand-600 font-semibold text-brand-700" : "border-transparent text-surface-600 hover:text-surface-900"}`}>
            {t.label}<span className="ml-2 text-xs font-normal text-surface-400">{t.hint}</span>
          </button>
        ))}
      </div>

      {/* both stay mounted so switching tabs is instant and keeps their state */}
      <div className={tab === "sending" ? "" : "hidden"}>
        <SendingDomainsPanel onLoaded={(d, s, p) => { setDomains(d); setSenders(s); setProvider(p); loadInbox(); }} />
      </div>
      <div className={tab === "inbox" ? "" : "hidden"}>
        {inbox && <MailSetup setup={inbox} onChange={loadInbox} hideBanner />}
      </div>
    </AppLayout>
  );
}
