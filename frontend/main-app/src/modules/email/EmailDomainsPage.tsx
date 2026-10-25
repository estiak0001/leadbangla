import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Archive, Check, CheckCircle2, ChevronDown, Circle, Clock, Copy, Globe, HelpCircle, Mail,
  PauseCircle, Pencil, Plus, RefreshCw, RotateCcw, Send, ShieldCheck, Star, Trash2, X,
} from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Button from "../../components/Button";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import {
  addDomain, addSender, deleteDomain, deleteSender, fetchDomains, fetchProvider, fetchSenders, fetchTrashedDomains,
  purgeDomain, registerWithSes, restoreDomain, sendTestEmail, setDefaultSender, updateDomain, verifyDomain,
  type DnsRecord, type EmailProviderInfo, type SenderAddress, type SendingDomain,
} from "../../lib/emailDomains";

const inputCls =
  "rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-800 placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

/* ── time helpers ─────────────────────────────────────────────────────────── */

const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" });

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Re-renders the component every `ms` so "x min ago" labels stay current. */
function useNow(ms = 30000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** Shown while a domain waits for DNS: what to expect and when it was last checked. */
function VerificationStatus({ domain, checking }: { domain: SendingDomain; checking: boolean }) {
  const now = useNow();
  if (domain.status !== "pending") return null;

  if (!domain.dns_submitted_at) {
    return (
      <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-700">
        <p className="font-medium text-surface-900">Next step: add the DNS records below</p>
        <p className="text-xs text-surface-600 mt-1">When you've added them at your DNS provider, press <strong>Verify DNS</strong>. We'll keep checking automatically after that.</p>
      </div>
    );
  }

  const waitedMin = Math.round((now - new Date(domain.dns_submitted_at).getTime()) / 60000);
  const long = waitedMin > 120;
  return (
    <div className={`rounded-xl border px-4 py-3 ${long ? "border-warning-base/30 bg-warning-light" : "border-brand-100 bg-brand-50/60"}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex-shrink-0 ${checking ? "animate-spin" : ""}`}><RefreshCw size={16} className={long ? "text-warning-dark" : "text-brand-600"} /></span>
        <div className="min-w-0 text-sm">
          <p className="font-medium text-surface-900">{checking ? "Checking now…" : "Waiting for DNS to update"}</p>
          <p className="text-xs text-surface-700 mt-1">
            Usually ready in <strong>5–30 minutes</strong>; some DNS providers take up to <strong>72 hours</strong>. We re-check automatically every 5 minutes, and this page refreshes by itself — you can close it.
          </p>
          <p className="text-xs text-surface-600 mt-2">
            Records submitted: {fmtTime(domain.dns_submitted_at)} ({ago(domain.dns_submitted_at, now)})
            {domain.last_checked_at && <> · Last checked: <strong>{fmtTime(domain.last_checked_at)}</strong> ({ago(domain.last_checked_at, now)})</>}
          </p>
          {long && <p className="text-xs text-warning-dark mt-2">This is taking longer than usual. Double-check each record's Name and Value against the table below, and that Cloudflare CNAMEs are set to “DNS only”.</p>}
        </div>
      </div>
    </div>
  );
}

/* ── small pieces ─────────────────────────────────────────────────────────── */

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label ?? ""}`.trim()}
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); })}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors flex-shrink-0 ${done ? "bg-success-light text-success-dark" : "bg-surface-100 text-surface-600 hover:bg-brand-50 hover:text-brand-600"}`}
    >
      {done ? <Check size={12} /> : <Copy size={12} />}{done ? "Copied" : "Copy"}
    </button>
  );
}

function StatusPill({ status }: { status: SendingDomain["status"] }) {
  const m = {
    pending:  { t: "Setup in progress", cls: "bg-warning-light text-warning-dark", Icon: Clock },
    verified: { t: "Ready to send",     cls: "bg-success-light text-success-dark", Icon: ShieldCheck },
    paused:   { t: "Paused",            cls: "bg-danger-light text-danger-dark",   Icon: PauseCircle },
  }[status];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${m.cls}`}><m.Icon size={12} />{m.t}</span>;
}

/** 4-step progress: Domain → DNS → Verified → Sender */
function Stepper({ domain, senderCount }: { domain: SendingDomain; senderCount: number }) {
  const dnsStarted = domain.dns_records.some((r) => r.verified) || domain.status !== "pending";
  const verified = domain.status === "verified" || domain.status === "paused";
  const steps = [
    { label: "Domain added", done: true },
    { label: "Add DNS records", done: dnsStarted },
    { label: "Verified", done: verified },
    { label: "Create sender", done: senderCount > 0 },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1">
      {steps.map((s, i) => {
        const active = i === current;
        return (
          <li key={s.label} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${s.done ? "bg-success-base text-white" : active ? "bg-brand-500 text-white" : "bg-surface-200 text-surface-500"}`}>
              {s.done ? <Check size={11} /> : i + 1}
            </span>
            <span className={`text-xs ${s.done ? "text-surface-700" : active ? "font-semibold text-surface-900" : "text-surface-400"}`}>{s.label}</span>
            {i < steps.length - 1 && <span className={`w-4 sm:w-8 h-px ${s.done ? "bg-success-base" : "bg-surface-200"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

/* ── DNS records ──────────────────────────────────────────────────────────── */

const PURPOSE: Record<DnsRecord["purpose"], { title: string; why: string }> = {
  dkim: { title: "DKIM", why: "Proves your emails really come from you" },
  spf: { title: "SPF", why: "Lists who may send for your domain (keep only one)" },
  dmarc: { title: "DMARC", why: "Tells inboxes how to treat fake mail (optional)" },
};

/** "abc._domainkey.example.com" → "abc._domainkey"; the bare domain → "@" */
function shortName(host: string, domain: string): string {
  if (host === domain) return "@";
  return host.endsWith(`.${domain}`) ? host.slice(0, -(domain.length + 1)) : host;
}

function DnsGuide({ domain }: { domain: string }) {
  return (
    <div className="rounded-xl bg-brand-50/60 border border-brand-100 p-4 text-sm text-surface-700">
      <p className="font-semibold text-surface-900 mb-2 flex items-center gap-1.5"><HelpCircle size={15} className="text-brand-600" />How to add these records</p>
      <ol className="list-decimal list-inside space-y-1">
        <li>Log in to wherever <strong>{domain}</strong> is managed (Cloudflare, GoDaddy, Namecheap, your hosting panel).</li>
        <li>Open <strong>DNS settings</strong> → <strong>Add record</strong>.</li>
        <li>Pick the <strong>Type</strong>, paste the <strong>Name</strong> and <strong>Value</strong> from the table below, leave TTL on Auto, and save. Repeat for each row.</li>
        <li>Wait a few minutes, then press <strong>Verify DNS</strong>.</li>
      </ol>
      <ul className="mt-3 space-y-1 text-xs text-surface-600 list-disc list-inside">
        <li><code>@</code> means the bare domain. If your provider wants the full name, use the “Full name” under each row.</li>
        <li>Don't add quotes around values or a trailing dot.</li>
        <li>On Cloudflare, set CNAME records to <strong>DNS only</strong> (grey cloud).</li>
        <li>Already have an SPF record (a TXT starting with <code>v=spf1</code>)? Don't create a second one — add the <code>include:</code> part to it.</li>
        <li>Changes usually appear within minutes, but can take up to 24–72 hours.</li>
      </ul>
    </div>
  );
}

function DnsTable({ records, domain }: { records: DnsRecord[]; domain: string }) {
  return (
    <div className="rounded-xl border border-surface-200 overflow-hidden bg-white">
      <div className="hidden md:grid grid-cols-[28px_70px_minmax(0,1fr)_minmax(0,2fr)] gap-3 px-4 py-2 bg-surface-50 border-b border-surface-200 text-[11px] font-semibold uppercase tracking-wide text-surface-500">
        <span /><span>Type</span><span>Name / Host</span><span>Value</span>
      </div>
      <div className="divide-y divide-surface-100">
        {records.map((r, i) => {
          const name = shortName(r.host, domain);
          return (
            <div key={r.host + i} className="px-4 py-3">
              <div className="md:grid md:grid-cols-[28px_70px_minmax(0,1fr)_minmax(0,2fr)] md:gap-3 md:items-start space-y-2 md:space-y-0">
                <span className="hidden md:block mt-0.5">
                  {r.verified ? <CheckCircle2 size={18} className="text-success-base" /> : <Circle size={18} className="text-surface-300" />}
                </span>
                <div className="flex items-center gap-2 md:block">
                  {r.verified ? <CheckCircle2 size={16} className="md:hidden text-success-base" /> : <Circle size={16} className="md:hidden text-surface-300" />}
                  <span className="inline-block rounded bg-surface-100 px-2 py-0.5 text-xs font-bold text-surface-700">{r.type}</span>
                  <span className="md:hidden text-sm font-semibold text-surface-900">{PURPOSE[r.purpose].title}</span>
                </div>
                <div className="min-w-0">
                  <p className="hidden md:block text-sm font-semibold text-surface-900 mb-1">{PURPOSE[r.purpose].title}
                    <span className={`ml-2 text-[10px] font-medium rounded-full px-1.5 py-0.5 ${r.required ? "bg-brand-50 text-brand-700" : "bg-surface-100 text-surface-500"}`}>{r.required ? "Required" : "Optional"}</span>
                  </p>
                  <div className="flex items-start gap-2">
                    <code className="flex-1 min-w-0 break-all rounded-md bg-surface-50 border border-surface-100 px-2 py-1 text-xs text-surface-800">{name}</code>
                    <CopyButton text={name} label="name" />
                  </div>
                  {name !== "@" && <p className="text-[11px] text-surface-400 mt-1 break-all">Full name: {r.host}</p>}
                </div>
                <div className="min-w-0">
                  <div className="flex items-start gap-2">
                    <code className="flex-1 min-w-0 break-all rounded-md bg-surface-50 border border-surface-100 px-2 py-1 text-xs text-surface-800">{r.data}</code>
                    <CopyButton text={r.data} label="value" />
                  </div>
                  <p className="text-[11px] text-surface-400 mt-1">{PURPOSE[r.purpose].why} · TTL: Auto</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── one domain ───────────────────────────────────────────────────────────── */

function DomainCard({
  domain, senders, provider, open, onToggle, onChanged, onError,
}: {
  domain: SendingDomain; senders: SenderAddress[]; provider: EmailProviderInfo | null;
  open: boolean; onToggle: (open: boolean) => void;
  onChanged: () => void; onError: (m: string) => void;
}) {
  const [tab, setTab] = useState<"dns" | "senders">(domain.status === "pending" ? "dns" : "senders");
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => onToggle(typeof v === "function" ? v(open) : v);
  const [showGuide, setShowGuide] = useState(domain.status === "pending" && !domain.dns_records.some((r) => r.verified));
  const [verifying, setVerifying] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(domain.domain);
  const [savingName, setSavingName] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [local, setLocal] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [testFor, setTestFor] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try { return await fn(); } catch (e) { onError(e instanceof Error ? e.message : "Something went wrong"); }
  }

  const verifiedCount = domain.dns_records.filter((r) => r.verified).length;
  const needsSesRegistration = provider?.kind === "ses" && domain.provider !== "ses";

  return (
    <section className="rounded-2xl border border-surface-200 bg-white shadow-sm">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0"><Globe size={20} /></div>
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-surface-900 truncate">{domain.domain}</h3>
            <StatusPill status={domain.status} />
          </div>
          <p className="text-xs text-surface-500 mt-0.5">
            {senders.length} sender address{senders.length === 1 ? "" : "es"} · {verifiedCount}/{domain.dns_records.length} DNS records found{domain.last_checked_at ? ` · checked ${fmtTime(domain.last_checked_at)}` : ""}
          </p>
        </button>
        <div className="flex items-center gap-1.5">
          {domain.status === "pending" && (
            <Button size="sm" icon={<RefreshCw size={14} />} loading={verifying} disabled={needsSesRegistration}
              onClick={async () => { setVerifying(true); await run(async () => { await verifyDomain(domain.id); onChanged(); }); setVerifying(false); }}>
              Verify DNS
            </Button>
          )}
          {domain.status === "verified" && (
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => { setOpen(true); setTab("senders"); }}>Add address</Button>
          )}
          <button onClick={() => { setNewName(domain.domain); setEditing((v) => !v); setOpen(true); }} title="Edit domain" aria-label="Edit domain" className="p-2 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50"><Pencil size={15} /></button>
          <button onClick={() => setConfirmTrash(true)} title="Move to trash" aria-label="Move domain to trash" className="p-2 rounded-lg text-surface-400 hover:text-danger-base hover:bg-danger-light"><Trash2 size={15} /></button>
          <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? "Collapse" : "Expand"} title={open ? "Collapse" : "Expand"} className="p-2 rounded-lg text-surface-500 hover:bg-surface-100"><ChevronDown size={18} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} /></button>
        </div>
      </div>

      {confirmTrash && (
        <div className="mx-5 mb-4 rounded-lg border border-danger-base/30 bg-danger-light px-4 py-3 text-sm flex flex-wrap items-center gap-3">
          <span className="flex-1 min-w-48 text-danger-dark">Move <strong>{domain.domain}</strong> to the trash? Campaigns can't send from it until you restore it.</span>
          <Button size="xs" variant="danger" onClick={() => run(async () => { await deleteDomain(domain.id); onChanged(); })}>Move to trash</Button>
          <Button size="xs" variant="secondary" onClick={() => setConfirmTrash(false)}>Cancel</Button>
        </div>
      )}

      {editing && (
        <form
          className="mx-5 mb-4 rounded-xl border border-surface-200 bg-surface-50 p-4"
          onSubmit={async (e) => {
            e.preventDefault(); setSavingName(true);
            await run(async () => { await updateDomain(domain.id, newName); setEditing(false); onChanged(); });
            setSavingName(false);
          }}
        >
          <label className="block text-sm font-medium text-surface-800 mb-1.5">Change domain name</label>
          <div className="flex flex-wrap items-center gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} required className={`${inputCls} flex-1 min-w-52`} />
            <Button type="submit" size="sm" loading={savingName} disabled={newName.trim().toLowerCase() === domain.domain}>Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
          <p className="text-xs text-surface-500 mt-2">Verification restarts with new DNS records, and sender addresses move to the new domain (same name before the @).</p>
        </form>
      )}

      {open && (
        <div className="border-t border-surface-100">
          <div className="px-5 pt-4"><Stepper domain={domain} senderCount={senders.length} /></div>

          <div className="px-5 pt-3 space-y-3">
            {needsSesRegistration && (
              <div className="rounded-xl border border-warning-base/30 bg-warning-light px-4 py-3 text-sm text-warning-dark flex flex-wrap items-center gap-3">
                <span className="flex-1 min-w-48">This domain was set up before Amazon SES was connected, so SES doesn't know it yet. Register it to get the DNS records SES needs.</span>
                <Button size="xs" loading={registering} onClick={async () => { setRegistering(true); await run(async () => { await registerWithSes(domain.id); onChanged(); }); setRegistering(false); }}>Register with Amazon SES</Button>
              </div>
            )}
            {domain.status === "paused" && <Alert variant="error">{domain.paused_reason}</Alert>}
            <VerificationStatus domain={domain} checking={verifying} />
            {domain.status_note && domain.status !== "paused" && (
              <div className={`rounded-xl px-4 py-3 text-sm ${domain.status === "verified" ? "bg-success-light text-success-dark" : "bg-surface-50 border border-surface-200 text-surface-700"}`}>
                {domain.status_note}
                {domain.last_checked_at && <span className="block text-xs opacity-75 mt-1">Last checked {fmtTime(domain.last_checked_at)}</span>}
              </div>
            )}
          </div>

          {/* tabs */}
          <div className="px-5 mt-3 flex gap-1 border-b border-surface-100">
            {([["dns", "DNS records", domain.dns_records.length], ["senders", "Sender addresses", senders.length]] as const).map(([k, label, n]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === k ? "border-brand-500 text-brand-700" : "border-transparent text-surface-500 hover:text-surface-800"}`}>
                {label} <span className="ml-1 rounded-full bg-surface-100 px-1.5 py-0.5 text-[11px] text-surface-600">{n}</span>
              </button>
            ))}
          </div>

          <div className="px-5 py-5">
            {tab === "dns" ? (
              <div className="space-y-4">
                {domain.status === "pending" && (
                  <>
                    <button onClick={() => setShowGuide((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
                      <HelpCircle size={15} />{showGuide ? "Hide instructions" : "Show me how to add these"}
                    </button>
                    {showGuide && <DnsGuide domain={domain.domain} />}
                  </>
                )}
                <DnsTable records={domain.dns_records} domain={domain.domain} />
              </div>
            ) : (
              <div className="space-y-4">
                {senders.length === 0 && (
                  <p className="text-sm text-surface-500">
                    {domain.status === "pending" ? "Finish DNS verification first, then create the address your emails will be sent from." : "No sender addresses yet — create one below."}
                  </p>
                )}
                <div className="space-y-2">
                  {senders.map((s) => (
                    <div key={s.id} className="rounded-xl border border-surface-200 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-surface-100 text-surface-600 flex items-center justify-center flex-shrink-0"><Mail size={15} /></div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-surface-900 truncate">{s.name || s.email.split("@")[0]}
                            {s.is_default && <span className="ml-2 rounded-full bg-brand-50 text-brand-700 text-[10px] font-semibold px-2 py-0.5">DEFAULT</span>}
                          </p>
                          <p className="text-xs text-surface-500 truncate">{s.email}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {domain.status === "verified" && <Button size="xs" variant="secondary" icon={<Send size={12} />} onClick={() => { setTestFor(testFor === s.id ? null : s.id); setTestMsg(null); }}>Send test</Button>}
                          {!s.is_default && <Button size="xs" variant="ghost" icon={<Star size={12} />} onClick={() => run(async () => { await setDefaultSender(s.id); onChanged(); })}>Make default</Button>}
                          <button onClick={() => run(async () => { await deleteSender(s.id); onChanged(); })} aria-label="Remove address" title="Remove" className="p-1.5 rounded-lg text-surface-400 hover:text-danger-base hover:bg-danger-light"><Trash2 size={14} /></button>
                        </div>
                      </div>
                      {testFor === s.id && (
                        <div className="mt-3 pt-3 border-t border-surface-100">
                          <div className="flex flex-wrap items-center gap-2">
                            <input value={testTo} onChange={(e) => setTestTo(e.target.value)} type="email" placeholder="Send a test to (your email)…" className={`${inputCls} flex-1 min-w-52`} />
                            <Button size="sm" loading={testBusy} disabled={!testTo.includes("@")} onClick={async () => {
                              setTestBusy(true); setTestMsg(null);
                              try { await sendTestEmail(s.id, testTo); setTestMsg({ ok: true, text: `Test email accepted for ${testTo}. Check the inbox (and spam).` }); }
                              catch (e) { setTestMsg({ ok: false, text: e instanceof Error ? e.message : "Sending failed" }); }
                              setTestBusy(false);
                            }}>Send</Button>
                          </div>
                          {testMsg && <p className={`mt-2 text-xs ${testMsg.ok ? "text-success-dark" : "text-danger-dark"}`}>{testMsg.text}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {domain.status === "verified" && (
                  <form
                    onSubmit={async (e: FormEvent) => {
                      e.preventDefault(); setAdding(true);
                      await run(async () => { await addSender(domain.id, `${local.trim()}@${domain.domain}`, name); setLocal(""); setName(""); onChanged(); });
                      setAdding(false);
                    }}
                    className="rounded-xl border border-dashed border-surface-300 bg-surface-50/60 p-4"
                  >
                    <p className="text-sm font-medium text-surface-800 mb-3">Create a sender address</p>
                    <div className="grid sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] gap-3 items-end">
                      <div>
                        <label className="block text-xs text-surface-500 mb-1">Address</label>
                        <div className="flex items-center rounded-lg border border-surface-200 bg-white focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-500">
                          <input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="hello" required pattern="[A-Za-z0-9._%+\-]+" className="w-full min-w-0 rounded-l-lg px-3 py-2 text-sm focus:outline-none" />
                          <span className="pr-3 text-sm text-surface-500 whitespace-nowrap">@{domain.domain}</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-surface-500 mb-1">Display name (shown to recipients)</label>
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your Brand" className={`${inputCls} w-full`} />
                      </div>
                      <Button type="submit" icon={<Plus size={14} />} loading={adding}>Create</Button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ── page ─────────────────────────────────────────────────────────────────── */

function Welcome(): ReactNode {
  const steps = [
    ["Add your domain", "Enter the website domain you want to send email from, like yourbrand.com."],
    ["Add DNS records", "Copy a few records into your domain provider. Takes about 5 minutes."],
    ["Verify", "We check the records. Once found, the domain is ready."],
    ["Create a sender", "Make addresses like hello@yourbrand.com and pick one in your campaigns."],
  ];
  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-surface-900">Send from your own brand address</h2>
      <p className="text-sm text-surface-600 mt-1">Emails sent from <strong>hello@yourbrand.com</strong> look more trustworthy and land in the inbox more often than a shared address.</p>
      <ol className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map(([t, d], i) => (
          <li key={t} className="rounded-xl bg-surface-50 p-4">
            <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center mb-2">{i + 1}</span>
            <p className="text-sm font-semibold text-surface-900">{t}</p>
            <p className="text-xs text-surface-600 mt-1">{d}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function EmailDomainsPage() {
  const [domains, setDomains] = useState<SendingDomain[]>([]);
  const [senders, setSenders] = useState<SenderAddress[]>([]);
  const [provider, setProvider] = useState<EmailProviderInfo | null>(null);
  const [trash, setTrash] = useState<SendingDomain[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [purgeId, setPurgeId] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);

  const load = () =>
    Promise.all([fetchDomains(), fetchSenders(), fetchProvider(), fetchTrashedDomains()])
      .then(([d, s, p, t]) => { setDomains(d); setSenders(s); setProvider(p); setTrash(t); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  // While any domain is waiting for DNS, quietly refresh so the status updates without a click.
  const waiting = domains.some((d) => d.status === "pending" && d.dns_submitted_at);
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => { load(); }, 30000);
    return () => clearInterval(t);
  }, [waiting]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAdding(true); setError(null);
    try {
      const d = await addDomain(newDomain);
      setNewDomain(""); await load();
      setOpenIds((prev) => new Set(prev).add(d.id)); // show the DNS records of the new domain right away
    }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to add domain"); }
    finally { setAdding(false); }
  }

  return (
    <AppLayout>
      <Link to="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium mb-4">
        <ArrowLeft size={14} /> Back to Email Campaigns
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-surface-900 tracking-tight">Sending Domains</h1>
          <p className="mt-1 text-sm text-surface-600">Verify your domain once, then send campaigns from your own addresses.</p>
        </div>
        {provider && (
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${provider.configured ? "border-success-base/30 bg-success-light text-success-dark" : "border-warning-base/30 bg-warning-light text-warning-dark"}`}
            title={provider.message}>
            {provider.configured ? <ShieldCheck size={13} /> : <PauseCircle size={13} />}
            {provider.configured ? `Delivery: ${provider.label}` : "Email delivery not connected"}
          </span>
        )}
      </div>

      {provider && !provider.configured && <Alert variant="warning" className="mb-4">{provider.message}</Alert>}
      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-4">{error}</Alert>}

      <form onSubmit={handleAdd} className="mb-6 rounded-2xl border border-surface-200 bg-white p-4 shadow-sm">
        <label htmlFor="new-domain" className="block text-sm font-semibold text-surface-900 mb-2">Add a domain</label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-56">
            <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input id="new-domain" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="yourbrand.com" required className={`${inputCls} w-full pl-9`} />
          </div>
          <Button type="submit" icon={<Plus size={15} />} loading={adding}>Add domain</Button>
        </div>
        <p className="text-xs text-surface-500 mt-2">Use the domain without “https://” or “www”. You must be able to edit its DNS settings.</p>
      </form>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : domains.length === 0 ? (
        <Welcome />
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-surface-600">{domains.length} domain{domains.length === 1 ? "" : "s"}</p>
            <div className="flex gap-1">
              <Button size="xs" variant="ghost" onClick={() => setOpenIds(new Set(domains.map((d) => d.id)))} disabled={openIds.size === domains.length}>Expand all</Button>
              <Button size="xs" variant="ghost" onClick={() => setOpenIds(new Set())} disabled={openIds.size === 0}>Collapse all</Button>
            </div>
          </div>
          <div className="space-y-3">
            {domains.map((d) => (
              <DomainCard
                key={d.id}
                domain={d}
                senders={senders.filter((s) => s.domain_id === d.id)}
                provider={provider}
                open={openIds.has(d.id)}
                onToggle={(o) => setOpenIds((prev) => { const n = new Set(prev); if (o) n.add(d.id); else n.delete(d.id); return n; })}
                onChanged={load}
                onError={setError}
              />
            ))}
          </div>
        </>
      )}

      {trash.length > 0 && (
        <div className="mt-8">
          <button onClick={() => setShowTrash((v) => !v)} className="inline-flex items-center gap-2 text-sm font-medium text-surface-600 hover:text-surface-900">
            <Archive size={15} /> Trash ({trash.length})
            <ChevronDown size={14} className={`transition-transform ${showTrash ? "rotate-180" : ""}`} />
          </button>
          {showTrash && (
            <div className="mt-3 space-y-2">
              {trash.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
                  <Globe size={16} className="text-surface-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface-700">{d.domain}</p>
                    <p className="text-xs text-surface-500">Deleted {d.deleted_at ? new Date(d.deleted_at).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" }) : ""}</p>
                  </div>
                  <Button size="xs" variant="secondary" icon={<RotateCcw size={12} />} onClick={async () => {
                    try { await restoreDomain(d.id); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Failed to restore"); }
                  }}>Restore</Button>
                  {purgeId === d.id ? (
                    <span className="inline-flex items-center gap-1 text-xs">Delete forever?
                      <Button size="xs" variant="danger" onClick={async () => {
                        try { await purgeDomain(d.id); setPurgeId(null); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Failed to delete"); }
                      }}>Yes</Button>
                      <Button size="xs" variant="ghost" icon={<X size={12} />} onClick={() => setPurgeId(null)}>No</Button>
                    </span>
                  ) : (
                    <Button size="xs" variant="ghost" icon={<Trash2 size={12} />} onClick={() => setPurgeId(d.id)}>Delete forever</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
