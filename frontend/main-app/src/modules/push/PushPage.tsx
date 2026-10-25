import { FormEvent, useEffect, useMemo, useState } from "react";
import { Bell, Check, Copy, Globe, Link2, Monitor, Send } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import Badge from "../../components/Badge";
import Button from "../../components/Button";
import PageHeader from "../../components/PageHeader";
import Spinner from "../../components/Spinner";
import { fetchSegments, type Segment } from "../../lib/audience";
import {
  currentSubscription, getConfig, listCampaigns, listTokens, registerToken, sendCampaign, subscribeToPush, unsubscribeFromPush,
  type PushCampaign, type PushConfig, type PushToken,
} from "../../lib/push";

const STATUS: Record<string, "default" | "info" | "success" | "danger"> = { pending: "default", sending: "info", sent: "success", failed: "danger" };
const field = "w-full border border-surface-300 rounded-[3px] px-2.5 py-2 text-base sm:text-sm bg-white focus:border-brand-500 focus:outline-none";
const SOURCE = { dashboard: "Dashboard", website: "Website", link: "Shared link" } as const;

function CopyBox({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-1"><span className="text-[11px] font-semibold text-surface-600">{label}</span>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }).catch(() => undefined); }}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline">{ok ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}</button></div>
      <pre className="text-[11px] leading-relaxed font-mono bg-surface-50 border border-surface-200 rounded-[3px] px-2.5 py-2 overflow-x-auto whitespace-pre-wrap break-all">{text}</pre>
    </div>
  );
}

function CampaignsTab({ config, onSent }: { config: PushConfig; onSent: () => void }) {
  const [campaigns, setCampaigns] = useState<PushCampaign[] | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [f, setF] = useState({ title: "", body: "", click_url: "", icon_url: "", segment_id: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  useEffect(() => { Promise.all([listCampaigns(), fetchSegments().catch(() => [] as Segment[])]).then(([c, s]) => { setCampaigns(c); setSegments(s); }); }, []);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function send(e: FormEvent) {
    e.preventDefault(); setSending(true); setError("");
    try {
      const c = await sendCampaign({ title: f.title, body: f.body, icon_url: f.icon_url || undefined, click_url: f.click_url || undefined, segment_id: f.segment_id || null });
      setCampaigns((p) => [c, ...(p ?? [])]); setF({ title: "", body: "", click_url: "", icon_url: "", segment_id: "" }); onSent();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not send"); } finally { setSending(false); }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <form onSubmit={send} className="lg:col-span-3 bg-white border border-surface-200 rounded-[4px] p-4 space-y-3">
          <h2 className="text-sm font-semibold text-surface-900">New notification</h2>
          <div><label className="block text-xs font-semibold text-surface-600 mb-1">Title</label>
            <input className={field} required maxLength={200} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Eid sale — 30% off today" /></div>
          <div><label className="block text-xs font-semibold text-surface-600 mb-1">Message</label>
            <textarea className={`${field} h-20 resize-none`} required value={f.body} onChange={(e) => set("body", e.target.value)} placeholder="Visit the shop or order online before midnight." /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold text-surface-600 mb-1">Send to</label>
              <select className={field} value={f.segment_id} onChange={(e) => set("segment_id", e.target.value)}>
                <option value="">Everyone subscribed ({config.subscribers})</option>
                {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <p className="text-[11px] text-surface-500 mt-1">A segment reaches only subscribers who are linked to a contact.</p></div>
            <div><label className="block text-xs font-semibold text-surface-600 mb-1">Link when tapped <span className="font-normal text-surface-400">(optional)</span></label>
              <input className={field} type="url" value={f.click_url} onChange={(e) => set("click_url", e.target.value)} placeholder="https://yourshop.com/offer" /></div>
          </div>
          {more ? <div><label className="block text-xs font-semibold text-surface-600 mb-1">Icon image URL</label><input className={field} type="url" value={f.icon_url} onChange={(e) => set("icon_url", e.target.value)} placeholder="https://yourshop.com/logo.png" /></div>
            : <div><button type="button" onClick={() => setMore(true)} className="text-xs font-medium text-brand-600 hover:underline">Add an icon</button></div>}
          {!config.ready && <Alert variant="warning">Push isn't switched on for the platform yet, so notifications can't be sent. Please contact support.</Alert>}
          {config.ready && config.subscribers === 0 && <Alert variant="info">Nobody has subscribed yet. Open the <b>Subscribers</b> tab to get your link or website code.</Alert>}
          {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
          <Button type="submit" size="sm" icon={<Send size={13} />} loading={sending} disabled={!config.ready || !f.title.trim() || !f.body.trim()}>Send notification</Button>
        </form>

        <div className="lg:col-span-2 bg-white border border-surface-200 rounded-[4px] p-4">
          <h2 className="text-sm font-semibold text-surface-900 mb-3">Preview</h2>
          <div className="rounded-[8px] border border-surface-200 bg-surface-50 p-3 flex gap-2.5">
            <span className="w-9 h-9 rounded-[6px] bg-brand-500 text-white flex items-center justify-center flex-shrink-0"><Bell size={16} /></span>
            <div className="min-w-0"><p className="text-sm font-semibold text-surface-900 truncate">{f.title || "Your title"}</p><p className="text-xs text-surface-600 line-clamp-3">{f.body || "Your message appears here."}</p></div>
          </div>
          <p className="text-[11px] text-surface-500 mt-2">This is how it looks on a phone or computer. Keep the title short — about 40 characters.</p>
        </div>
      </div>

      <section className="bg-white border border-surface-200 rounded-[4px]">
        <h2 className="px-4 py-2.5 border-b border-surface-100 text-sm font-semibold text-surface-900">History</h2>
        {!campaigns ? <div className="py-8 flex justify-center"><Spinner /></div> : campaigns.length === 0 ? <p className="py-8 text-center text-sm text-surface-500">Nothing sent yet.</p> : (
          <ul className="divide-y divide-surface-100">
            {campaigns.map((c) => (
              <li key={c.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-surface-900 truncate">{c.title}</p><p className="text-xs text-surface-500 truncate">{c.body}</p>
                  {c.error_message && <p className="text-xs text-danger-dark mt-0.5">{c.error_message}</p>}</div>
                <div className="text-right text-xs text-surface-500 flex-shrink-0"><p><b className="text-success-dark">{c.sent_count}</b> delivered{c.failed_count > 0 && <> · <b className="text-danger-dark">{c.failed_count}</b> failed</>}</p>
                  <p className="text-[11px]">{new Date(c.created_at).toLocaleString("en-BD", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div>
                <Badge variant={STATUS[c.status] ?? "default"} size="sm">{c.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SubscribersTab({ config, onChanged }: { config: PushConfig; onChanged: () => void }) {
  const [tokens, setTokens] = useState<PushToken[] | null>(null);
  const [here, setHere] = useState<"checking" | "yes" | "no" | "unsupported">("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const origin = window.location.origin;
  const link = `${origin}/subscribe/${config.site_key}`;
  const snippet = `<script src="${origin}/api/v1/public/push/sdk.js" data-key="${config.site_key}" data-auto="8" async></script>`;
  const swFile = `importScripts("${origin}/api/v1/public/push/sw.js");`;
  const load = () => listTokens().then(setTokens).catch(() => setTokens([]));
  useEffect(() => {
    load();
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setHere("unsupported"); return; }
    currentSubscription().then((s) => setHere(s ? "yes" : "no")).catch(() => setHere("no"));
  }, []);

  async function subscribeHere() {
    if (!config.vapid_public_key) return;
    setBusy(true); setError("");
    try {
      if ((await Notification.requestPermission()) !== "granted") { setError("The browser blocked notifications."); return; }
      const sub = await subscribeToPush(config.vapid_public_key); const j = sub?.toJSON();
      if (!j?.endpoint || !j.keys) throw new Error("Subscribing failed.");
      await registerToken({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) });
      setHere("yes"); await load(); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }
  async function leaveHere() { setBusy(true); try { await unsubscribeFromPush(); setHere("no"); } finally { setBusy(false); } }

  const tiles = useMemo(() => [["Subscribers", config.subscribers], ["New in 7 days", config.last_7_days], ["Linked to a contact", config.linked]], [config]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {tiles.map(([l, n]) => <div key={l as string} className="bg-white border border-surface-200 rounded-[4px] px-3.5 py-3"><p className="text-xl font-bold text-surface-900 leading-none">{n}</p><p className="text-xs text-surface-500 mt-1">{l}</p></div>)}
      </div>
      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}

      <section className="bg-white border border-surface-200 rounded-[4px]">
        <h2 className="px-4 py-2.5 border-b border-surface-100 text-sm font-semibold text-surface-900">Get more subscribers</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-surface-100">
          <div className="p-4 space-y-2.5">
            <p className="text-sm font-semibold text-surface-800 flex items-center gap-2"><Link2 size={15} className="text-brand-600" /> Share a link <span className="text-xs font-normal text-surface-500">— no website needed</span></p>
            <p className="text-xs text-surface-600">Send it on WhatsApp, Facebook or print it as a QR code. People tap Allow and they are subscribed.</p>
            <CopyBox label="Subscribe link" text={link} />
          </div>
          <div className="p-4 space-y-2.5">
            <p className="text-sm font-semibold text-surface-800 flex items-center gap-2"><Globe size={15} className="text-brand-600" /> Add to your website</p>
            <p className="text-xs text-surface-600">1. Paste this before <code>&lt;/body&gt;</code> on your pages. It asks visitors after 8 seconds.</p>
            <CopyBox label="Website code" text={snippet} />
            <p className="text-xs text-surface-600">2. Create a file named <code>leadbangla-sw.js</code> in your website's main folder with this one line:</p>
            <CopyBox label="leadbangla-sw.js" text={swFile} />
            <p className="text-[11px] text-surface-500">Your site must use https. To ask on a button instead, remove <code>data-auto</code> and call <code>LeadBanglaPush.subscribe({"{ email }"})</code>.</p>
          </div>
        </div>
      </section>

      <section className="bg-white border border-surface-200 rounded-[4px] p-4 flex items-center justify-between gap-3 flex-wrap">
        <div><p className="text-sm font-semibold text-surface-800 flex items-center gap-2"><Monitor size={15} className="text-brand-600" /> This browser</p>
          <p className="text-xs text-surface-500">Subscribe yourself to see how a notification looks before you send to customers.</p></div>
        {here === "unsupported" ? <span className="text-xs text-surface-500">This browser can't show push notifications.</span>
          : here === "yes" ? <div className="flex items-center gap-2"><Badge variant="success" size="sm" dot>Subscribed</Badge><button onClick={leaveHere} disabled={busy} className="text-xs text-danger-dark hover:underline">Unsubscribe</button></div>
            : <Button size="sm" variant="secondary" loading={busy} disabled={here === "checking" || !config.ready} onClick={subscribeHere}>Subscribe this browser</Button>}
      </section>

      <section className="bg-white border border-surface-200 rounded-[4px]">
        <h2 className="px-4 py-2.5 border-b border-surface-100 text-sm font-semibold text-surface-900">Devices ({tokens?.length ?? "…"})</h2>
        {!tokens ? <div className="py-6 flex justify-center"><Spinner /></div> : tokens.length === 0 ? <p className="py-6 text-center text-sm text-surface-500">No subscribers yet.</p> : (
          <ul className="divide-y divide-surface-100">
            {tokens.slice(0, 100).map((t) => (
              <li key={t.id} className="px-4 py-2 flex items-center gap-3 text-sm">
                <span className="w-2 h-2 rounded-full bg-success-base flex-shrink-0" />
                <span className="min-w-0 flex-1 truncate text-surface-700">{t.email || (/Android|iPhone|Mobile/i.test(t.user_agent ?? "") ? "Phone" : "Computer")}<span className="text-xs text-surface-400"> · {(t.user_agent ?? "").match(/(Chrome|Firefox|Safari|Edg)/)?.[1] ?? "Browser"}</span></span>
                <span className="text-xs text-surface-500">{SOURCE[t.source] ?? t.source}</span>
                {t.contact_id && <Badge variant="info" size="sm">contact</Badge>}
                <span className="text-xs text-surface-400 w-20 text-right">{new Date(t.created_at).toLocaleDateString("en-BD", { day: "numeric", month: "short" })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function PushPage() {
  const [tab, setTab] = useState<"campaigns" | "subscribers">("campaigns");
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [error, setError] = useState("");
  const reload = () => getConfig().then(setConfig).catch((e) => setError(e.message));
  useEffect(() => { reload(); }, []);

  return (
    <AppLayout>
      <PageHeader title="Push notifications" description="Send short notifications to customers' phones and computers. They subscribe once, and you send for free." />
      {error ? <Alert variant="error">{error}</Alert> : !config ? <div className="py-16 flex justify-center"><Spinner size="lg" /></div> : (
        <>
          <div className="flex border-b border-surface-200 mb-4" role="tablist">
            {([["campaigns", "Send"], ["subscribers", `Subscribers (${config.subscribers})`]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-brand-500 text-brand-600" : "border-transparent text-surface-600 hover:text-surface-900"}`}>{l}</button>
            ))}
          </div>
          {tab === "campaigns" ? <CampaignsTab config={config} onSent={reload} /> : <SubscribersTab config={config} onChanged={reload} />}
        </>
      )}
    </AppLayout>
  );
}
