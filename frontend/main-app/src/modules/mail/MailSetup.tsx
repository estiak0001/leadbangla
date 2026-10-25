import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, CheckCircle2, Circle, Clock, Copy, Mail, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import {
  addInboxAddress, createInboxDomain, deleteInboxAddress, setCatchAll, setInboxEnabled, updateInboxAddress, verifyInboxDomain,
  type InboxDomain, type MailSetup as Setup,
} from "../../lib/mail";

const inputCls = "rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";
const fmt = (iso: string) => new Date(iso).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" });

function Copy2({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); })}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium flex-shrink-0 ${done ? "bg-success-light text-success-dark" : "bg-surface-100 text-surface-600 hover:bg-brand-50 hover:text-brand-600"}`}>
      {done ? <Check size={12} /> : <Copy size={12} />}{done ? "Copied" : "Copy"}
    </button>
  );
}

function ago(iso: string, now: number) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function DomainCard({ d, setup, onChange, onError }: { d: InboxDomain; setup: Setup; onChange: () => void; onError: (m: string) => void }) {
  const [verifying, setVerifying] = useState(false);
  const [local, setLocal] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const addrs = setup.addresses.filter((a) => a.inbox_domain_id === d.id);
  const parent = setup.sending_domains.find((x) => x.id === d.sending_domain_id)?.domain ?? "";
  const shortHost = d.receive_domain === parent ? "@" : parent && d.receive_domain.endsWith(`.${parent}`) ? d.receive_domain.slice(0, -(parent.length + 1)) : d.receive_domain;
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); onChange(); } catch (e) { onError(e instanceof Error ? e.message : "Something went wrong"); } };
  const pill = { pending: ["Waiting for the MX record", "bg-warning-light text-warning-dark", Clock], active: ["Receiving mail", "bg-success-light text-success-dark", CheckCircle2], disabled: ["Turned off", "bg-surface-100 text-surface-600", Circle] }[d.status] as [string, string, typeof Clock];
  const Pill = pill[2];

  return (
    <section className="rounded-2xl border border-surface-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Mail size={18} /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-surface-900 truncate">{d.receive_domain}</h3>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium mt-1 ${pill[1]}`}><Pill size={12} />{pill[0]}</span>
        </div>
        {d.status === "pending" && <Button size="sm" icon={<RefreshCw size={14} />} loading={verifying} onClick={async () => { setVerifying(true); await run(() => verifyInboxDomain(d.id)); setVerifying(false); }}>Verify</Button>}
        {d.status === "active" && <Button size="sm" variant="ghost" onClick={() => run(() => setInboxEnabled(d.id, false))}>Turn off</Button>}
        {d.status === "disabled" && <Button size="sm" variant="secondary" onClick={() => run(() => setInboxEnabled(d.id, true))}>Turn on</Button>}
      </div>

      {d.status !== "disabled" && (
        <div className="px-5 pb-4 space-y-3">
          {d.status === "pending" && (
            <div className="rounded-xl border border-surface-200 overflow-hidden">
              <div className="grid grid-cols-[70px_1fr] sm:grid-cols-[70px_minmax(0,1fr)_70px_minmax(0,1.4fr)] gap-3 bg-surface-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-surface-500"><span>Type</span><span>Name / Host</span><span className="hidden sm:block">Priority</span><span className="hidden sm:block">Value / Points to</span></div>
              <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[70px_minmax(0,1fr)_70px_minmax(0,1.4fr)] gap-3 items-start">
                <span className="inline-block w-fit rounded bg-surface-100 px-2 py-0.5 text-xs font-bold text-surface-700">MX</span>
                <div className="flex items-start gap-2 min-w-0"><code className="flex-1 break-all rounded-md bg-surface-50 border border-surface-100 px-2 py-1 text-xs">{shortHost}</code><Copy2 text={shortHost} /></div>
                <span className="text-sm text-surface-700">{d.mx.priority}</span>
                <div className="flex items-start gap-2 min-w-0"><code className="flex-1 break-all rounded-md bg-surface-50 border border-surface-100 px-2 py-1 text-xs">{d.mx.target}</code><Copy2 text={d.mx.target} /></div>
              </div>
              <p className="px-4 pb-3 text-[11px] text-surface-500">Full name: <code>{d.mx.host}</code>. Leave TTL on Auto. Add it where your domain's DNS is managed (Cloudflare, GoDaddy, Namecheap…). Don't add quotes or a trailing dot.</p>
            </div>
          )}
          <div className={`rounded-xl px-4 py-3 text-sm ${d.status === "active" ? "bg-success-light text-success-dark" : "bg-surface-50 border border-surface-200 text-surface-700"}`}>
            {d.status_note}
            {d.status === "pending" && d.dns_submitted_at && <p className="text-xs mt-1.5 opacity-80">Usually ready in 5–30 minutes, up to a few hours. We re-check every 5 minutes{d.last_checked_at ? ` · last checked ${ago(d.last_checked_at, now)} (${fmt(d.last_checked_at)})` : ""}.</p>}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-surface-800 mb-2">Addresses</h4>
            {addrs.length === 0 && <p className="text-sm text-surface-500 mb-2">Create the first address, for example <b>support</b> or <b>hello</b>.</p>}
            <div className="space-y-2">
              {addrs.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-surface-200 px-3 py-2">
                  <Mail size={14} className="text-surface-400" />
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-surface-900 truncate">{a.display_name} {a.is_default && <span className="ml-1 rounded-full bg-brand-50 text-brand-700 text-[10px] font-semibold px-2 py-0.5">DEFAULT</span>}</p><p className="text-xs text-surface-500 truncate">{a.email}</p></div>
                  {!a.is_default && <Button size="xs" variant="ghost" icon={<Star size={12} />} onClick={() => run(() => updateInboxAddress(a.id, { make_default: true }))}>Make default</Button>}
                  <button aria-label="Remove address" onClick={() => run(() => deleteInboxAddress(a.id))} className="p-1.5 rounded-md text-surface-400 hover:text-danger-base hover:bg-danger-light"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async (e: FormEvent) => { e.preventDefault(); setAdding(true); await run(() => addInboxAddress(d.id, local, name)); setLocal(""); setName(""); setAdding(false); }}>
              <div className="flex items-center rounded-lg border border-surface-200 bg-white focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-500">
                <input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="support" required className="w-28 rounded-l-lg px-3 py-2 text-sm focus:outline-none" />
                <span className="pr-3 text-sm text-surface-500 whitespace-nowrap">@{d.receive_domain}</span>
              </div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name (optional)" className={`${inputCls} w-52`} />
              <Button type="submit" size="sm" icon={<Plus size={14} />} loading={adding}>Add address</Button>
            </form>
            <label className="mt-3 flex items-start gap-2 text-xs text-surface-600">
              <input type="checkbox" checked={d.catch_all} onChange={(e) => run(() => setCatchAll(d.id, e.target.checked))} className="mt-0.5" />
              <span><b>Catch-all:</b> mail to any other name @{d.receive_domain} (for example a typo) goes to your default address. Off means unknown names are rejected.</span>
            </label>
          </div>
          {d.status === "active" && addrs.length > 0 && <p className="text-xs text-surface-500">Try it: send an email from your own Gmail to <b>{addrs[0].email}</b>. It should appear in the Inbox within a minute.</p>}
        </div>
      )}
    </section>
  );
}

export default function MailSetup({ setup, onChange }: { setup: Setup; onChange: () => void }) {
  const [sd, setSd] = useState(setup.sending_domains[0]?.id ?? "");
  const chosen = setup.sending_domains.find((s) => s.id === sd);
  const [receive, setReceive] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!sd && setup.sending_domains[0]) setSd(setup.sending_domains[0].id); }, [setup.sending_domains, sd]);
  useEffect(() => { if (chosen) setReceive(`mail.${chosen.domain}`); }, [chosen?.domain]);  // eslint-disable-line react-hooks/exhaustive-deps
  const unused = setup.sending_domains.filter((s) => !setup.domains.some((d) => d.sending_domain_id === s.id && d.receive_domain === receive));

  async function create(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await createInboxDomain(sd, receive); onChange(); } catch (err) { setError(err instanceof Error ? err.message : "Could not create the inbox"); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {!setup.platform_ready && <Alert variant="warning">{setup.platform_message}</Alert>}

      <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-surface-900">Receive email on your own domain</h2>
        <p className="text-sm text-surface-600 mt-1">Get mail sent to addresses like <b>support@mail.yourbrand.com</b> right here, read it, and reply — with your brand, in one shared inbox. Mail is kept for {setup.retention_days} days.</p>
        <ol className="mt-3 grid sm:grid-cols-4 gap-2 text-xs text-surface-700">
          {["Pick a verified domain", "Add one MX record at your DNS provider", "We detect it automatically", "Create addresses and start answering"].map((s, i) => (
            <li key={s} className="rounded-xl bg-surface-50 p-3"><span className="inline-flex w-5 h-5 rounded-full bg-brand-500 text-white text-[11px] font-bold items-center justify-center mb-1.5">{i + 1}</span><br />{s}</li>
          ))}
        </ol>
      </div>

      {setup.sending_domains.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-surface-300 bg-white p-5 text-sm text-surface-700">
          You need a domain verified for sending first. <Link to="/email-domains" className="font-medium text-brand-600 hover:underline">Add and verify a domain →</Link>
        </div>
      ) : (
        <form onSubmit={create} className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-surface-900">Add an inbox</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-surface-600 mb-1">Your verified domain</label>
              <select value={sd} onChange={(e) => setSd(e.target.value)} className={`${inputCls} w-full`}>{setup.sending_domains.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-surface-600 mb-1">Receive mail at</label>
              <input value={receive} onChange={(e) => setReceive(e.target.value)} className={`${inputCls} w-full`} required /></div>
          </div>
          <div className="rounded-xl bg-info-light/60 border border-info-base/20 px-3 py-2 text-xs text-info-dark">
            <b>Use a subdomain (recommended), like mail.{chosen?.domain ?? "yourbrand.com"}.</b> A domain can only send incoming mail to one place. If {chosen?.domain ?? "your domain"} already has mailboxes (Google Workspace, Zoho…), pointing it here would stop those from receiving mail. A subdomain keeps them working.
          </div>
          <Button type="submit" size="sm" icon={<Plus size={14} />} loading={busy} disabled={!setup.platform_ready || !sd || !receive.trim() || unused.length === 0 && setup.domains.some((d) => d.receive_domain === receive)}>Create inbox</Button>
        </form>
      )}

      {setup.domains.map((d) => <DomainCard key={d.id} d={d} setup={setup} onChange={onChange} onError={setError} />)}
    </div>
  );
}
