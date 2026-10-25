import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import Alert from "../../../components/Alert";
import Badge from "../../../components/Badge";
import Button from "../../../components/Button";
import Spinner from "../../../components/Spinner";
import { connectOwnWaAccount, disconnectOwnWaAccount, fetchOwnWaAccount, type OwnWaAccount } from "../../../lib/sms";

const field = "w-full border border-surface-300 rounded-[3px] px-2.5 py-2 text-base sm:text-sm bg-white focus:border-brand-500 focus:outline-none font-mono";

/** Bring your own Meta WhatsApp account: your number, your Meta bill. We still approve the connection. */
export default function OwnMetaAccount() {
  const [acc, setAcc] = useState<OwnWaAccount | null>(null);
  const [f, setF] = useState({ access_token: "", phone_number_id: "", waba_id: "", app_secret: "" });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetchOwnWaAccount().then((a) => { setAcc(a); setF((p) => ({ ...p, phone_number_id: a.phone_number_id ?? "", waba_id: a.waba_id ?? "" })); }).catch((e) => setError(e.message)); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { setAcc(await connectOwnWaAccount({ ...f })); setF((p) => ({ ...p, access_token: "", app_secret: "" })); setEditing(false); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not connect"); } finally { setBusy(false); }
  }
  async function disconnect() {
    if (!window.confirm("Disconnect your Meta account? Your campaigns go back to using our WhatsApp number.")) return;
    setBusy(true);
    try { setAcc(await disconnectOwnWaAccount()); setEditing(false); } catch (err) { setError(err instanceof Error ? err.message : "Failed"); } finally { setBusy(false); }
  }

  if (!acc) return error ? <Alert variant="error">{error}</Alert> : <div className="py-10 flex justify-center"><Spinner /></div>;
  const webhook = acc.webhook_key ? `${window.location.origin}/api/v1/public/whatsapp/webhook/${acc.webhook_key}` : null;

  return (
    <div className="space-y-3">
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {acc.connected && !editing ? (
        <div className="bg-white border border-surface-200 rounded-[4px] p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-surface-900">{acc.verified_name || "Your WhatsApp number"} <span className="font-mono font-normal text-surface-600">{acc.number}</span></p>
              <p className="text-xs text-surface-500 mt-0.5">Quality rating: {acc.quality?.toLowerCase() || "unknown"}</p>
            </div>
            {acc.approved ? <Badge variant="success" size="sm" dot>Approved — in use</Badge> : <Badge variant="warning" size="sm" dot>Waiting for our approval</Badge>}
          </div>
          {acc.health && !acc.health.ok && (
            <Alert variant="error">Problem with your Meta connection: {acc.health.message} <span className="opacity-70">(checked {new Date(acc.health.checked_at).toLocaleString()})</span></Alert>
          )}
          {acc.health?.ok && acc.health.quality === "YELLOW" && (
            <Alert variant="warning">{acc.health.message}</Alert>
          )}
          {acc.approved ? (
            <p className="text-sm text-surface-700 flex items-start gap-1.5"><CheckCircle2 size={15} className="text-success-base mt-0.5 flex-shrink-0" />Campaigns send from your own number. Meta bills you directly for the messages. Your templates are managed in your Meta account, and new ones you request here go straight to Meta.</p>
          ) : (
            <p className="text-sm text-surface-700 flex items-start gap-1.5"><Clock size={15} className="text-warning-dark mt-0.5 flex-shrink-0" />We check the connection before it is used. Until then campaigns use our WhatsApp number. You will be notified.</p>
          )}
          {webhook && (
            <div className="text-xs text-surface-600 rounded-[3px] bg-surface-50 border border-surface-200 px-3 py-2">
              <p className="font-semibold text-surface-700 mb-0.5">Delivery reports (optional)</p>
              In your Meta app → WhatsApp → Configuration, set the callback URL to <code className="font-mono break-all">{webhook}</code>, use your verify token, and subscribe to <b>messages</b>. This shows delivered/failed and turns on automatic STOP opt-outs.
            </div>
          )}
          <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Change details</Button><Button size="sm" variant="ghost" className="text-danger-base" loading={busy} onClick={disconnect}>Disconnect</Button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="bg-white border border-surface-200 rounded-[4px] p-4 space-y-3">
          <p className="text-sm text-surface-700">Use a number that is already in your own Meta Business account. You keep control of it and Meta bills you directly. Find these in <b>developers.facebook.com → your app → WhatsApp → API setup</b>.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><label className="block text-xs font-semibold text-surface-600 mb-1">Access token {acc.connected && <span className="font-normal text-surface-400">(leave blank to keep the saved one)</span>}</label>
              <input className={field} type="password" autoComplete="off" value={f.access_token} onChange={(e) => setF({ ...f, access_token: e.target.value })} placeholder="Permanent token from a System User" required={!acc.connected} />
              <p className="text-[11px] text-surface-500 mt-1">Needs the whatsapp_business_messaging and whatsapp_business_management permissions. Stored encrypted.</p></div>
            <div><label className="block text-xs font-semibold text-surface-600 mb-1">Phone number ID</label>
              <input className={field} inputMode="numeric" value={f.phone_number_id} onChange={(e) => setF({ ...f, phone_number_id: e.target.value })} placeholder="e.g. 109876543210987" required />
              <p className="text-[11px] text-surface-500 mt-1">An ID, not the phone number itself.</p></div>
            <div><label className="block text-xs font-semibold text-surface-600 mb-1">WhatsApp Business Account ID</label>
              <input className={field} inputMode="numeric" value={f.waba_id} onChange={(e) => setF({ ...f, waba_id: e.target.value })} placeholder="Needed to list and create templates" />
            </div>
            <div className="sm:col-span-2"><label className="block text-xs font-semibold text-surface-600 mb-1">App secret <span className="font-normal text-surface-400">(optional — only for delivery reports)</span></label>
              <input className={field} type="password" autoComplete="off" value={f.app_secret} onChange={(e) => setF({ ...f, app_secret: e.target.value })} /></div>
          </div>
          <div className="flex gap-2"><Button type="submit" size="sm" loading={busy}>{acc.connected ? "Save and check" : "Connect and check"}</Button>{editing && <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>}</div>
          <p className="text-[11px] text-surface-500">We check the token against Meta straight away, then our team approves the connection before it is used.</p>
        </form>
      )}
    </div>
  );
}
