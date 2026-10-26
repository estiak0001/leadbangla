import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Inbox, PauseCircle, Send, ShieldCheck } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import PlanUsageStrip from "../../components/PlanUsageStrip";
import MailSetup from "../mail/MailSetup";
import { SendingDomainsPanel } from "./EmailDomainsPage";
import { fetchMailSetup, type MailSetup as InboxSetup } from "../../lib/mail";
import type { EmailProviderInfo, SenderAddress, SendingDomain } from "../../lib/emailDomains";

type Tab = "sending" | "inbox";
interface Step { label: string; done: boolean; tab: Tab }

function Ring({ pct, complete }: { pct: number; complete: boolean }) {
  const r = 18, c = 2 * Math.PI * r;
  return (
    <div className="relative h-12 w-12 shrink-0" aria-hidden>
      <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-surface-100" />
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          className={`transition-all duration-500 ${complete ? "stroke-success-base" : "stroke-brand-600"}`} />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums ${complete ? "text-success-dark" : "text-surface-900"}`}>
        {complete ? <Check size={16} /> : `${Math.round(pct)}%`}
      </span>
    </div>
  );
}

/** Where you are in the setup: a ring for the overall progress and a timeline of the steps. */
function StepBar({ groups, onOpen }: { groups: { title: string; icon: typeof Send; optional?: boolean; steps: Step[] }[]; onOpen: (t: Tab) => void }) {
  const all = groups.flatMap((g) => g.steps);
  const next = all.find((s) => !s.done);
  const done = all.filter((s) => s.done).length;
  const pct = (done / all.length) * 100;
  return (
    <section className="mb-4 rounded-xl border border-surface-200 bg-white px-4 py-3.5" aria-label="Setup progress">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex items-center gap-3 lg:w-56 lg:shrink-0">
          <Ring pct={pct} complete={!next} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-surface-900">Setup progress</p>
            <p className="text-xs text-surface-500">{done} of {all.length} steps done</p>
            {next
              ? <button type="button" onClick={() => onOpen(next.tab)} className="mt-0.5 text-xs font-medium text-brand-600 hover:text-brand-700">Next: {next.label} →</button>
              : <p className="mt-0.5 text-xs font-medium text-success-dark">Everything is set up</p>}
          </div>
        </div>

        <div className="-mx-1 overflow-x-auto px-1 lg:flex-1">
          <div className="flex min-w-[34rem] items-start gap-5">
            {groups.map((g, gi) => (
              <div key={g.title} className={`min-w-0 ${gi === 0 ? "flex-[3]" : "flex-[2] border-l border-surface-100 pl-5"}`}>
                <p className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-surface-400">
                  <g.icon size={11} />{g.title}{g.optional && <span className="font-normal normal-case tracking-normal">· optional</span>}
                </p>
                <ol className="flex">
                  {g.steps.map((s, i) => {
                    const isNext = next === s;
                    const prev = g.steps[i - 1];
                    return (
                      <li key={s.label} className="relative flex flex-1 flex-col items-center text-center">
                        {i > 0 && <span className={`absolute right-1/2 top-3 -z-0 h-0.5 w-full ${prev?.done && s.done ? "bg-success-base" : prev?.done ? "bg-brand-300" : "bg-surface-200"}`} aria-hidden />}
                        <button type="button" onClick={() => onOpen(s.tab)} title={s.label} className="group relative z-10 flex flex-col items-center focus:outline-none">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold transition
                            ${s.done ? "border-success-base bg-success-base text-white" : isNext ? "border-brand-600 bg-white text-brand-600 ring-4 ring-brand-100" : "border-surface-300 bg-white text-surface-400 group-hover:border-surface-400"}`}>
                            {s.done ? <Check size={12} strokeWidth={3} /> : i + 1}
                          </span>
                          <span className={`mt-1.5 max-w-[6.5rem] text-[11px] leading-tight ${isNext ? "font-semibold text-brand-700" : s.done ? "text-surface-500" : "text-surface-600"}`}>{s.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
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

  const groups = [
    { title: "Sending", icon: Send, steps: [
      { label: "Delivery connected", done: !!provider?.configured, tab: "sending" as Tab },
      { label: "Domain verified", done: domains.some((d) => d.status === "verified"), tab: "sending" as Tab },
      { label: "Sender address", done: senders.length > 0, tab: "sending" as Tab },
    ] },
    { title: "Receiving", icon: Inbox, optional: true, steps: [
      { label: "Inbox on", done: !!inbox?.domains.some((d) => d.status === "active"), tab: "inbox" as Tab },
      { label: "Inbox address", done: !!inbox?.addresses.length, tab: "inbox" as Tab },
    ] },
  ];

  const tabs: { key: Tab; label: string; icon: typeof Send; count: string }[] = [
    { key: "sending", label: "Sending", icon: Send, count: `${domains.filter((d) => d.status === "verified").length}/${domains.length} verified` },
    { key: "inbox", label: "Inbox", icon: Inbox, count: `${inbox?.addresses.length ?? 0} address${inbox?.addresses.length === 1 ? "" : "es"}` },
  ];

  return (
    <AppLayout>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <Link to="/campaigns" aria-label="Back to Campaigns" title="Back to Campaigns" className="rounded-md p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-700"><ArrowLeft size={16} /></Link>
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-tight text-surface-900 sm:text-xl">Email Setup</h1>
            <p className="text-xs text-surface-500">Sending and receiving are separate. Set up only what you need.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {provider && (
            <span title={provider.message}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${provider.configured ? "border-success-base/30 bg-success-light text-success-dark" : "border-warning-base/30 bg-warning-light text-warning-dark"}`}>
              {provider.configured ? <ShieldCheck size={12} /> : <PauseCircle size={12} />}
              {provider.configured ? provider.label : "Delivery not connected"}
            </span>
          )}
          <PlanUsageStrip items={["emails"]} chip className="" />
        </div>
      </div>

      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-3">{error}</Alert>}

      <StepBar groups={groups} onOpen={go} />

      <div className="sticky top-0 z-10 -mx-1 mb-3 border-b border-surface-200 bg-surface-50/95 px-1 backdrop-blur" role="tablist">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => go(t.key)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition ${tab === t.key ? "border-brand-600 font-semibold text-brand-700" : "border-transparent text-surface-600 hover:text-surface-900"}`}>
              <t.icon size={14} />{t.label}
              <span className="hidden text-xs font-normal text-surface-400 sm:inline">{t.count}</span>
            </button>
          ))}
        </div>
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
