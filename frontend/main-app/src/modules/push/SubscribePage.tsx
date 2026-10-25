import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Bell, CheckCircle2 } from "lucide-react";
import { fetchPublicPushInfo, publicSubscribe, subscribeToPush, type PublicPushInfo } from "../../lib/push";

/** The shareable page a company sends to its customers so they can switch on notifications. Needs no login. */
export default function SubscribePage() {
  const { key = "" } = useParams();
  const [info, setInfo] = useState<PublicPushInfo | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  useEffect(() => { fetchPublicPushInfo(key).then(setInfo).catch((e) => setError(e.message)); }, [key]);

  async function submit(e: FormEvent) {
    e.preventDefault(); if (!info?.public_key) return;
    setState("busy"); setError("");
    try {
      if ((await Notification.requestPermission()) !== "granted") { setError("Notifications are blocked. Allow them in your browser's site settings and try again."); setState("idle"); return; }
      const sub = await subscribeToPush(info.public_key);
      const j = sub?.toJSON();
      if (!j?.endpoint || !j.keys) throw new Error("Your browser couldn't turn on notifications.");
      await publicSubscribe(key, { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, email: email.trim() || undefined });
      setState("done");
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); setState("idle"); }
  }

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-surface-200 rounded-[6px] p-6 text-center shadow-sm">
        <span className="mx-auto w-12 h-12 rounded-[8px] bg-brand-50 text-brand-600 flex items-center justify-center mb-3">{state === "done" ? <CheckCircle2 size={24} /> : <Bell size={24} />}</span>
        {!info && !error ? <p className="text-sm text-surface-500">Loading…</p> : !info ? <p className="text-sm text-danger-dark">{error}</p> : state === "done" ? (
          <>
            <h1 className="text-lg font-bold text-surface-900">You're subscribed</h1>
            <p className="text-sm text-surface-600 mt-1">You will now get updates from {info.name} on this device. You can turn them off any time in your browser settings.</p>
          </>
        ) : !supported ? (
          <p className="text-sm text-surface-600">This browser can't show notifications. Open this link in Chrome or Firefox (on iPhone, add the page to your Home Screen first).</p>
        ) : !info.ready ? (
          <p className="text-sm text-surface-600">Notifications aren't available yet. Please try again later.</p>
        ) : (
          <form onSubmit={submit}>
            <h1 className="text-lg font-bold text-surface-900">Get updates from {info.name}</h1>
            <p className="text-sm text-surface-600 mt-1">Offers and news straight to this device. One tap to allow, and you can stop any time.</p>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email (optional)" className="mt-4 w-full border border-surface-300 rounded-[3px] px-3 py-2 text-base focus:border-brand-500 focus:outline-none" />
            {error && <p className="mt-2 text-xs text-danger-dark">{error}</p>}
            <button type="submit" disabled={state === "busy"} className="mt-3 w-full rounded-[3px] bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 text-sm disabled:opacity-60">{state === "busy" ? "Turning on…" : "Allow notifications"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
