import { useState } from "react";
import { CheckCircle2, AlertTriangle, ChevronDown, Clock, Info, Lock, LogIn, MousePointerClick, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import Alert from "../../components/Alert";
import Badge from "../../components/Badge";
import Button from "../../components/Button";
import { checkAccount, disconnectAccount, startOAuthConnect, type OAuthProvider, type SocialAccount, type SocialPlatform } from "../../lib/social";
import { PLATFORMS, PlatformTile, ago } from "./socialMeta";

const ORDER: SocialPlatform[] = ["facebook", "instagram", "linkedin"];
// "meta" covers both Facebook and Instagram — one OAuth consent screen picks Pages for both.
const PROVIDER_OF: Record<SocialPlatform, OAuthProvider> = { facebook: "meta", instagram: "meta", linkedin: "linkedin" };

const REQUIREMENTS: Record<SocialPlatform, string[]> = {
  facebook: ["You must be an admin of the Facebook Page you want to connect.", "You'll pick the Page(s) on Facebook's own screen — LeadBangla never sees your password."],
  instagram: ["The Instagram account must be a Business or Creator account.", "It must already be linked to a Facebook Page you admin."],
  linkedin: ["This connects your own LinkedIn profile, not a Company Page, for now.", "Posting as a Company Page is coming once LinkedIn approves that access."],
};

const STEPS = [
  { icon: MousePointerClick, text: "Click Connect below" },
  { icon: LogIn, text: "Log in on the network's own screen and choose your Page(s)" },
  { icon: CheckCircle2, text: "You're brought back here, connected and ready to post" },
];

function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/50">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left">
        <Info size={15} className="text-brand-600 flex-shrink-0" />
        <span className="text-sm font-medium text-brand-900 flex-1">How connecting works</span>
        <ChevronDown size={14} className={`text-brand-600 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 pt-0.5 animate-slide-up">
          <div className="grid sm:grid-cols-3 gap-2.5">
            {STEPS.map((s, i) => (
              <div key={s.text} className="flex items-start gap-2 rounded-lg bg-white border border-brand-100 px-2.5 py-2">
                <span className="w-5 h-5 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-px">{i + 1}</span>
                <p className="text-xs text-surface-700 leading-snug">{s.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-2.5 flex items-start gap-1.5 text-[11px] text-surface-500 leading-snug">
            <Lock size={12} className="flex-shrink-0 mt-0.5" />
            Your login happens entirely on Facebook's or LinkedIn's own page. LeadBangla only receives permission to post — never your password.
          </p>
        </div>
      )}
    </div>
  );
}

function AccountRow({ a, onChange, onError }: { a: SocialAccount; onChange: (u: SocialAccount | null) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState<"check" | "del" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const bad = !a.has_token || a.last_check_ok === false;
  async function check() {
    setBusy("check");
    try { onChange(await checkAccount(a.id)); } catch (e) { onError(e instanceof Error ? e.message : "Check failed"); } finally { setBusy(null); }
  }
  async function remove() {
    setBusy("del");
    try { await disconnectAccount(a.id); onChange(null); } catch (e) { onError(e instanceof Error ? e.message : "Failed to disconnect"); setBusy(null); }
  }
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${bad ? "border-danger-base/30 bg-danger-light/40" : "border-surface-200 bg-surface-50/60"}`}>
      <div className="flex items-center gap-2">
        {bad ? <AlertTriangle size={14} className="text-danger-base flex-shrink-0" /> : <CheckCircle2 size={14} className="text-success-base flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-surface-900 truncate leading-tight">{a.account_name}</p>
          <p className="text-[10.5px] text-surface-500 truncate">{a.has_token ? `checked ${ago(a.last_checked_at)}` : "no token saved"}</p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={check} disabled={busy !== null} title="Check connection" aria-label="Check connection" className="p-1.5 rounded-md text-surface-500 hover:text-brand-600 hover:bg-brand-50 disabled:opacity-40">
            <RefreshCw size={13} className={busy === "check" ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setConfirm(true)} disabled={busy !== null} title="Disconnect" aria-label="Disconnect" className="p-1.5 rounded-md text-surface-500 hover:text-danger-base hover:bg-danger-light disabled:opacity-40"><Trash2 size={13} /></button>
        </div>
      </div>
      {(a.last_check_message || !a.has_token) && (
        <p className={`mt-1.5 text-[11px] leading-snug ${bad ? "text-danger-dark" : "text-surface-600"}`}>{a.has_token ? a.last_check_message : "This account's token is gone. Disconnect it and connect again."}</p>
      )}
      {confirm && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-white px-2.5 py-2 text-xs border border-surface-200">
          <span className="flex-1 min-w-40 text-surface-700">Disconnect “{a.account_name}”? Scheduled posts for it will fail.</span>
          <Button size="xs" variant="danger" loading={busy === "del"} onClick={remove}>Disconnect</Button>
          <Button size="xs" variant="ghost" onClick={() => setConfirm(false)}>Keep</Button>
        </div>
      )}
    </div>
  );
}

function PlatformCard({ p, list, connecting, onConnect, onError, onAccountsChange, accounts }: {
  p: SocialPlatform; list: SocialAccount[]; connecting: boolean; onConnect: () => void; onError: (m: string) => void;
  onAccountsChange: (a: SocialAccount[]) => void; accounts: SocialAccount[];
}) {
  const m = PLATFORMS[p];
  const [showReq, setShowReq] = useState(false);
  const troubled = list.some((a) => !a.has_token || a.last_check_ok === false);
  return (
    <section className="rounded-2xl border border-surface-200 bg-white p-3.5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2.5">
        <PlatformTile platform={p} size={34} />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-surface-900 leading-tight">{m.label}</h3>
          {list.length ? (
            <Badge size="sm" variant={troubled ? "danger" : "success"} dot className="mt-0.5">{list.length} connected{troubled ? " · needs attention" : ""}</Badge>
          ) : (
            <Badge size="sm" variant="default" dot className="mt-0.5">Not connected</Badge>
          )}
        </div>
        <Button size="xs" variant={list.length ? "secondary" : "primary"} loading={connecting} onClick={onConnect}>
          {list.length ? "Add" : "Connect"}
        </Button>
      </div>

      <button onClick={() => setShowReq((v) => !v)} className="mt-2.5 flex items-center gap-1 text-[11px] font-medium text-surface-500 hover:text-brand-600">
        <ShieldCheck size={11} /> What you'll need <ChevronDown size={10} className={`transition-transform ${showReq ? "rotate-180" : ""}`} />
      </button>
      {showReq && (
        <ul className="mt-1.5 space-y-1 rounded-lg bg-surface-50 border border-surface-100 px-2.5 py-2 animate-slide-up">
          {REQUIREMENTS[p].map((r) => <li key={r} className="text-[11px] text-surface-600 leading-snug pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-surface-400">{r}</li>)}
        </ul>
      )}

      <div className="mt-2.5 space-y-1.5">
        {list.map((a) => (
          <AccountRow key={a.id} a={a} onError={onError}
            onChange={(u) => onAccountsChange(u ? accounts.map((x) => (x.id === u.id ? u : x)) : accounts.filter((x) => x.id !== a.id))} />
        ))}
        {list.length === 0 && <p className="text-[11px] text-surface-400">{m.needsImage ? "Posts need a picture." : m.textOnly ? "Text posts only for now." : "Text and picture posts."}</p>}
      </div>
    </section>
  );
}

export default function SocialAccountsTab({ accounts, onAccountsChange }: { accounts: SocialAccount[]; onAccountsChange: (a: SocialAccount[]) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<SocialPlatform | null>(null);

  async function connect(platform: SocialPlatform) {
    setConnecting(platform); setError(null);
    try {
      const { authorize_url } = await startOAuthConnect(PROVIDER_OF[platform]);
      window.location.href = authorize_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the connection");
      setConnecting(null);
    }
  }

  return (
    <div className="space-y-3.5">
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      <HowItWorks />

      <div className="grid gap-3.5 lg:grid-cols-3 items-start">
        {ORDER.map((p) => (
          <PlatformCard key={p} p={p} list={accounts.filter((a) => a.platform === p)} connecting={connecting === p}
            onConnect={() => connect(p)} onError={setError} onAccountsChange={onAccountsChange} accounts={accounts} />
        ))}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-surface-400">
        <Clock size={12} />
        <span>Coming soon: X (Twitter), TikTok — waiting on paid API access / app review.</span>
      </div>
    </div>
  );
}
