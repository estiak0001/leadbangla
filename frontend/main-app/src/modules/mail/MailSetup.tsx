import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, AtSign, Check, CheckCircle2, Circle, Clock, Copy, Globe, Inbox, Pencil, Plus, Power,
  RefreshCw, Send, ShieldCheck, Star, Trash2,
} from "lucide-react";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Toggle from "../../components/Toggle";
import {
  addInboxAddress, createInboxDomain, deleteInboxAddress, setCatchAll, setInboxEnabled, updateInboxAddress, verifyInboxDomain,
  type InboxAddress, type InboxDomain, type MailSetup as Setup,
} from "../../lib/mail";

const inputCls = "w-full rounded-xl border border-surface-200 bg-white px-3.5 py-2.5 text-sm placeholder:text-surface-400 transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10";
const fmt = (iso: string) => new Date(iso).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" });

function ago(iso: string, now: number) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); })}
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition ${done ? "bg-success-light text-success-dark" : "bg-surface-100 text-surface-600 hover:bg-brand-50 hover:text-brand-600"}`}
    >
      {done ? <Check size={12} /> : <Copy size={12} />}{done ? "Copied" : label}
    </button>
  );
}

/* ── progress banner ─────────────────────────────────────────────────────── */

function ProgressBanner({ setup }: { setup: Setup }) {
  const hasDomain = setup.domains.length > 0;
  const mxAdded = setup.domains.some((d) => d.status === "active" || d.dns_submitted_at);
  const verified = setup.domains.some((d) => d.status === "active");
  const hasAddress = setup.addresses.length > 0;
  const steps = [
    { title: "Add inbox domain", done: hasDomain },
    { title: "Add MX record", done: mxAdded },
    { title: "Verified", done: verified },
    { title: "Create addresses", done: hasAddress && verified },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <section className="rounded-xl border border-surface-200 bg-white p-4">
      <h2 className="text-base font-semibold text-surface-900">Receive email on your own domain</h2>
      <p className="mt-1 text-sm text-surface-600">Get mail sent to support@yourbrand.com here, read it and reply from one shared inbox. Kept for {setup.retention_days} days.</p>
      <ol className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {steps.map((s, i) => (
          <li key={s.title} className={`flex items-center gap-2 ${s.done ? "text-surface-500" : i === current ? "font-medium text-surface-900" : "text-surface-400"}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${s.done ? "border-success-base bg-success-base text-white" : i === current ? "border-brand-600 text-brand-600" : "border-surface-300"}`}>
              {s.done ? <Check size={11} /> : i + 1}
            </span>
            {s.title}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ── one inbox domain ────────────────────────────────────────────────────── */

const STATUS = {
  pending: { label: "Waiting for the MX record", cls: "bg-warning-light text-warning-dark", Icon: Clock },
  active: { label: "Receiving mail", cls: "bg-success-light text-success-dark", Icon: CheckCircle2 },
  disabled: { label: "Turned off", cls: "bg-surface-100 text-surface-600", Icon: Circle },
} as const;

function DnsField({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-surface-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-surface-500">{label}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <code className="min-w-0 break-all text-sm font-medium text-surface-900">{value}</code>
        {copy && <CopyButton text={value} />}
      </div>
    </div>
  );
}

function AddressCard({ a, domains, onRun }: { a: InboxAddress; domains: InboxDomain[]; onRun: (fn: () => Promise<unknown>) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(a.local_part);
  const [domainId, setDomainId] = useState(a.inbox_domain_id);
  const [name, setName] = useState(a.display_name ?? "");
  const [saving, setSaving] = useState(false);
  const domain = domains.find((d) => d.id === a.inbox_domain_id);

  if (editing) {
    return (
      <form
        className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/30 p-4 ring-4 ring-brand-500/5"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault(); setSaving(true);
          await onRun(() => updateInboxAddress(a.id, { local_part: local, inbox_domain_id: domainId, display_name: name }));
          setSaving(false); setEditing(false);
        }}
      >
        <div className="flex items-center gap-2">
          <input value={local} onChange={(e) => setLocal(e.target.value)} required className={inputCls} aria-label="Address name" />
          <span className="text-surface-400">@</span>
          <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className={inputCls} aria-label="Domain">
            {domains.map((d) => <option key={d.id} value={d.id}>{d.receive_domain}</option>)}
          </select>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" className={inputCls} aria-label="Display name" />
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setLocal(a.local_part); setDomainId(a.inbox_domain_id); setName(a.display_name ?? ""); }}>Cancel</Button>
          <Button type="submit" size="sm" loading={saving}>Save</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-surface-200 bg-white p-3 transition hover:border-brand-200 hover:shadow-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold uppercase text-brand-600">{a.local_part.slice(0, 2)}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-semibold text-surface-900">
          <span className="truncate">{a.email}</span>
          {a.is_default && <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-brand-700">DEFAULT</span>}
          {domain?.status === "pending" && <span className="shrink-0 rounded-full bg-warning-light px-2 py-0.5 text-[10px] font-semibold text-warning-dark">WAITING FOR MX</span>}
        </p>
        <p className="truncate text-xs text-surface-500">{a.display_name || "No display name"}</p>
      </div>
      <CopyButton text={a.email} />
      <button aria-label="Edit address" title="Edit" onClick={() => setEditing(true)} className="rounded-lg p-1.5 text-surface-400 transition hover:bg-brand-50 hover:text-brand-600"><Pencil size={15} /></button>
      {!a.is_default && (
        <button aria-label="Make default" title="Make default" onClick={() => onRun(() => updateInboxAddress(a.id, { make_default: true }))} className="rounded-lg p-1.5 text-surface-400 transition hover:bg-brand-50 hover:text-brand-600"><Star size={15} /></button>
      )}
      <button aria-label="Remove address" title="Remove" onClick={() => onRun(() => deleteInboxAddress(a.id))} className="rounded-lg p-1.5 text-surface-400 transition hover:bg-danger-light hover:text-danger-base"><Trash2 size={15} /></button>
    </div>
  );
}

function DomainCard({ d, setup, onChange, onError }: { d: InboxDomain; setup: Setup; onChange: () => void; onError: (m: string) => void }) {
  const [verifying, setVerifying] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const addrs = setup.addresses.filter((a) => a.inbox_domain_id === d.id);
  const parent = setup.sending_domains.find((x) => x.id === d.sending_domain_id)?.domain ?? "";
  const shortHost = d.receive_domain === parent ? "@" : parent && d.receive_domain.endsWith(`.${parent}`) ? d.receive_domain.slice(0, -(parent.length + 1)) : d.receive_domain;
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); onChange(); } catch (e) { onError(e instanceof Error ? e.message : "Something went wrong"); } };
  const st = STATUS[d.status];

  return (
    <section className="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center gap-4 border-b border-surface-100 bg-surface-50/60 px-4 py-4 sm:px-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Globe size={20} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold text-surface-900">{d.receive_domain}</h3>
          <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}><st.Icon size={12} />{st.label}</span>
        </div>
        {d.status === "pending" && <Button size="sm" icon={<RefreshCw size={14} />} loading={verifying} onClick={async () => { setVerifying(true); await run(() => verifyInboxDomain(d.id)); setVerifying(false); }}>Verify now</Button>}
        {d.status === "active" && <Button size="sm" variant="ghost" icon={<Power size={14} />} onClick={() => run(() => setInboxEnabled(d.id, false))}>Turn off</Button>}
        {d.status === "disabled" && <Button size="sm" variant="secondary" icon={<Power size={14} />} onClick={() => run(() => setInboxEnabled(d.id, true))}>Turn on</Button>}
      </header>

      {d.status !== "disabled" && (
        <div className="space-y-6 p-4 sm:p-4">
          {d.status === "pending" && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">2</span>
                <h4 className="text-sm font-semibold text-surface-900">Add this DNS record where your domain is managed</h4>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[100px_minmax(0,1fr)_100px_minmax(0,2fr)]">
                <DnsField label="Type" value="MX" />
                <DnsField label="Name / Host" value={shortHost} copy />
                <DnsField label="Priority" value={String(d.mx.priority)} />
                <DnsField label="Value / Points to" value={d.mx.target} copy />
              </div>
              <p className="mt-3 text-xs text-surface-500">
                Full name: <code>{d.mx.host}</code>. Leave TTL on Auto and don't add quotes or a trailing dot. Works at Cloudflare, GoDaddy, Namecheap and any other DNS provider.
              </p>
            </div>
          )}

          <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${d.status === "active" ? "bg-success-light text-success-dark" : "border border-surface-200 bg-surface-50 text-surface-700"}`}>
            {d.status === "active" ? <ShieldCheck size={18} className="mt-0.5 shrink-0" /> : <Clock size={18} className="mt-0.5 shrink-0" />}
            <div>
              {d.status_note}
              {d.status === "pending" && d.dns_submitted_at && (
                <p className="mt-1 text-xs opacity-80">
                  Usually ready in 5–30 minutes, up to a few hours. We re-check every 5 minutes{d.last_checked_at ? ` · last checked ${ago(d.last_checked_at, now)} (${fmt(d.last_checked_at)})` : ""}.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border border-surface-200 p-4">
            <div>
              <p className="text-sm font-semibold text-surface-900">Catch-all</p>
              <p className="mt-0.5 text-xs text-surface-500">Mail to any other name @{d.receive_domain} (for example a typo) goes to your default address. Off means unknown names are rejected.</p>
            </div>
            <Toggle value={d.catch_all} onChange={(v) => run(() => setCatchAll(d.id, v))} />
          </div>

          {d.status === "active" && addrs.length > 0 && (
            <p className="flex items-center gap-2 rounded-xl bg-brand-50/60 px-4 py-3 text-sm text-surface-700">
              <Send size={15} className="shrink-0 text-brand-600" />
              Try it: send an email from your own Gmail to <b>{addrs.find((a) => a.is_default)?.email ?? addrs[0].email}</b>. It should appear in the Inbox within a minute.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/* ── all addresses, on any inbox domain ──────────────────────────────────── */

function AddressesSection({ setup, onChange, onError }: { setup: Setup; onChange: () => void; onError: (m: string) => void }) {
  const rootOf = (d: InboxDomain) => setup.sending_domains.find((x) => x.id === d.sending_domain_id)?.domain === d.receive_domain;
  const initial = (setup.domains.find(rootOf) ?? setup.domains[0])?.id ?? "";
  const [domainId, setDomainId] = useState(initial);
  const [local, setLocal] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (!setup.domains.some((d) => d.id === domainId)) setDomainId(initial); }, [setup.domains, domainId, initial]);
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); onChange(); } catch (e) { onError(e instanceof Error ? e.message : "Something went wrong"); } };
  const chosen = setup.domains.find((d) => d.id === domainId);

  return (
    <section className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm sm:p-4">
      <div className="mb-4 flex items-center gap-2">
        <AtSign size={18} className="text-brand-600" />
        <h3 className="text-base font-semibold text-surface-900">Addresses</h3>
        <span className="rounded-full bg-surface-100 px-2 py-0.5 text-xs text-surface-600">{setup.addresses.length}</span>
      </div>

      <form
        className="grid gap-2 rounded-xl border border-dashed border-surface-300 bg-surface-50/50 p-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_auto]"
        onSubmit={async (e: FormEvent) => { e.preventDefault(); setAdding(true); await run(() => addInboxAddress(domainId, local, name)); setLocal(""); setName(""); setAdding(false); }}
      >
        <div className="flex min-w-0 items-center rounded-xl border border-surface-200 bg-white focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10">
          <input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="support" required aria-label="Address name" className="w-28 shrink-0 rounded-l-xl bg-transparent px-3.5 py-2.5 text-sm focus:outline-none" />
          <span className="text-surface-400">@</span>
          <select value={domainId} onChange={(e) => setDomainId(e.target.value)} aria-label="Domain" className="min-w-0 flex-1 rounded-r-xl bg-transparent py-2.5 pl-2 pr-3 text-sm focus:outline-none">
            {setup.domains.map((d) => <option key={d.id} value={d.id}>{d.receive_domain}{d.status === "pending" ? " (waiting for MX)" : ""}</option>)}
          </select>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name (optional)" className={inputCls} />
        <Button type="submit" icon={<Plus size={14} />} loading={adding} disabled={!chosen}>Add address</Button>
      </form>

      {setup.addresses.length === 0 ? (
        <p className="mt-4 text-sm text-surface-500">Create the first address, for example <b>support</b> or <b>hello</b>. Pick any of your inbox domains from the list.</p>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {setup.addresses.map((a) => <AddressCard key={a.id} a={a} domains={setup.domains} onRun={run} />)}
        </div>
      )}
    </section>
  );
}

/* ── add-an-inbox panel ──────────────────────────────────────────────────── */

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-surface-900"><span className="text-brand-600">{icon}</span>{title}</h3>
      {children}
    </section>
  );
}

export default function MailSetup({ setup, onChange, hideBanner = false }: { setup: Setup; onChange: () => void; hideBanner?: boolean }) {
  const [sd, setSd] = useState(setup.sending_domains[0]?.id ?? "");
  const chosen = setup.sending_domains.find((s) => s.id === sd);
  const [mode, setMode] = useState<"sub" | "root">("sub");
  const [prefix, setPrefix] = useState("mail");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!sd && setup.sending_domains[0]) setSd(setup.sending_domains[0].id); }, [setup.sending_domains, sd]);

  const receive = chosen ? (mode === "root" ? chosen.domain : `${prefix.trim().toLowerCase() || "mail"}.${chosen.domain}`) : "";
  const exists = setup.domains.some((d) => d.receive_domain === receive);

  async function create(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await createInboxDomain(sd, receive); onChange(); } catch (err) { setError(err instanceof Error ? err.message : "Could not create the inbox"); } finally { setBusy(false); }
  }

  return (
    <div className="w-full space-y-4">
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {!setup.platform_ready && <Alert variant="warning">{setup.platform_message}</Alert>}

      {!hideBanner && <ProgressBanner setup={setup} />}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* domains */}
        <div className="space-y-4">
          {setup.domains.length > 0 && <AddressesSection setup={setup} onChange={onChange} onError={setError} />}
          {setup.domains.length === 0 ? (
            <div className="rounded-xl border border-dashed border-surface-300 bg-white p-10 text-center">
              <Inbox size={24} className="mx-auto text-surface-400" />
              <h3 className="mt-4 text-lg font-semibold text-surface-900">No inbox yet</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-surface-500">Choose a domain on the right and press <b>Create inbox</b>. You'll then get one DNS record to add, and we'll do the rest.</p>
            </div>
          ) : (
            setup.domains.map((d) => <DomainCard key={d.id} d={d} setup={setup} onChange={onChange} onError={setError} />)
          )}
        </div>

        {/* sidebar */}
        <aside className="space-y-4 xl:sticky xl:top-16">
          {setup.sending_domains.length === 0 ? (
            <Panel title="Verify a domain first" icon={<Globe size={16} />}>
              <p className="text-sm text-surface-600">To receive mail you first need a domain that's verified for sending.</p>
              <Link to="/email-setup?tab=sending" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">Add and verify a domain <ArrowRight size={14} /></Link>
            </Panel>
          ) : (
            <Panel title="Add an inbox" icon={<Plus size={16} />}>
              <form onSubmit={create} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-surface-600">Your verified domain</label>
                  <select value={sd} onChange={(e) => setSd(e.target.value)} className={inputCls}>
                    {setup.sending_domains.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-surface-600">Receive mail at</label>
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-100 p-1">
                    {([["sub", "Subdomain"], ["root", "Main domain"]] as const).map(([k, label]) => (
                      <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${mode === k ? "bg-white text-brand-700 shadow-sm" : "text-surface-600 hover:text-surface-900"}`}>{label}{k === "sub" && <span className="ml-1.5 rounded-full bg-success-light px-1.5 py-0.5 text-[10px] font-semibold text-success-dark">Recommended</span>}</button>
                    ))}
                  </div>
                  {mode === "sub" && (
                    <div className="mt-2 flex items-center rounded-xl border border-surface-200 bg-white focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10">
                      <input value={prefix} onChange={(e) => setPrefix(e.target.value.replace(/[^a-z0-9-]/gi, ""))} className="w-24 rounded-l-xl bg-transparent px-3.5 py-2.5 text-sm focus:outline-none" aria-label="Subdomain" required />
                      <span className="truncate pr-3.5 text-sm text-surface-500">.{chosen?.domain}</span>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-surface-500">Addresses will look like <b className="text-surface-800">support@{receive || "yourbrand.com"}</b></p>
                </div>

                {mode === "root" ? (
                  <div className="flex gap-2.5 rounded-xl border border-warning-base/30 bg-warning-light/60 p-3 text-xs text-warning-dark">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <p><b>All incoming mail for {chosen?.domain} will come here.</b> If it already has mailboxes (Google Workspace, Zoho…), they'll stop receiving mail once you add the MX record. Make sure nothing else uses it.</p>
                  </div>
                ) : (
                  <div className="flex gap-2.5 rounded-xl border border-info-base/20 bg-info-light/60 p-3 text-xs text-info-dark">
                    <ShieldCheck size={16} className="mt-0.5 shrink-0" />
                    <p>A subdomain keeps any existing mailboxes on {chosen?.domain} working, because a domain can send incoming mail to only one place.</p>
                  </div>
                )}

                <Button type="submit" className="w-full" icon={<Plus size={14} />} loading={busy} disabled={!setup.platform_ready || !sd || !receive || exists}>
                  {exists ? "This inbox already exists" : "Create inbox"}
                </Button>
              </form>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
