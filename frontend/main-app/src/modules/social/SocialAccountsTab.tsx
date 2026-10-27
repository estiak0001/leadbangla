import { useState } from "react";
import { CheckCircle2, AlertTriangle, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import { checkAccount, disconnectAccount, startOAuthConnect, type OAuthProvider, type SocialAccount, type SocialPlatform } from "../../lib/social";
import { PLATFORMS, PlatformTile, ago } from "./socialMeta";

const ORDER: SocialPlatform[] = ["facebook", "instagram", "linkedin"];
// "meta" covers both Facebook and Instagram — one OAuth consent screen picks Pages for both.
const PROVIDER_OF: Record<SocialPlatform, OAuthProvider> = { facebook: "meta", instagram: "meta", linkedin: "linkedin" };

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
    <div className={`rounded-lg border px-3 py-2.5 ${bad ? "border-danger-base/30 bg-danger-light/40" : "border-surface-200 bg-white"}`}>
      <div className="flex items-center gap-2">
        {bad ? <AlertTriangle size={15} className="text-danger-base flex-shrink-0" /> : <CheckCircle2 size={15} className="text-success-base flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-surface-900 truncate">{a.account_name}</p>
          <p className="text-[11px] text-surface-500 truncate">ID {a.page_id || "—"} · {a.has_token ? `checked ${ago(a.last_checked_at)}` : "no token saved"}</p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={check} disabled={busy !== null} title="Check connection" aria-label="Check connection" className="p-1.5 rounded-md text-surface-500 hover:text-brand-600 hover:bg-brand-50 disabled:opacity-40">
            <RefreshCw size={14} className={busy === "check" ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setConfirm(true)} disabled={busy !== null} title="Disconnect" aria-label="Disconnect" className="p-1.5 rounded-md text-surface-500 hover:text-danger-base hover:bg-danger-light disabled:opacity-40"><Trash2 size={14} /></button>
        </div>
      </div>
      {(a.last_check_message || !a.has_token) && (
        <p className={`mt-1.5 text-[11px] leading-snug ${bad ? "text-danger-dark" : "text-surface-600"}`}>{a.has_token ? a.last_check_message : "This account's token is gone. Disconnect it and connect again."}</p>
      )}
      {confirm && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-surface-50 px-2.5 py-2 text-xs">
          <span className="flex-1 min-w-40 text-surface-700">Disconnect “{a.account_name}”? Its token is erased; scheduled posts for it will fail.</span>
          <Button size="xs" variant="danger" loading={busy === "del"} onClick={remove}>Disconnect</Button>
          <Button size="xs" variant="ghost" onClick={() => setConfirm(false)}>Keep</Button>
        </div>
      )}
    </div>
  );
}

export default function SocialAccountsTab({ accounts, onAccountsChange }: { accounts: SocialAccount[]; onAccountsChange: (a: SocialAccount[]) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
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
    <div className="space-y-4">
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {ok && <Alert variant="success" onDismiss={() => setOk(null)}>{ok}</Alert>}
      <p className="text-sm text-surface-600">Connect the pages you post to. Each connection is checked with the network, so you know it works before you schedule anything.</p>

      <div className="grid gap-4 lg:grid-cols-3 items-start">
        {ORDER.map((p) => {
          const m = PLATFORMS[p];
          const list = accounts.filter((a) => a.platform === p);
          return (
            <section key={p} className="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2.5">
                <PlatformTile platform={p} size={36} />
                <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-surface-900">{m.label}</h3><p className="text-[11px] text-surface-500">{list.length ? `${list.length} connected` : "Not connected"}</p></div>
                <Button size="xs" variant={list.length ? "secondary" : "primary"} icon={<ExternalLink size={12} />} loading={connecting === p} onClick={() => connect(p)}>
                  {list.length ? "Add" : "Connect"}
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {list.map((a) => (
                  <AccountRow key={a.id} a={a} onError={setError}
                    onChange={(u) => { onAccountsChange(u ? accounts.map((x) => (x.id === u.id ? u : x)) : accounts.filter((x) => x.id !== a.id)); if (u) setOk(u.last_check_ok ? u.last_check_message : null); }} />
                ))}
                {list.length === 0 && <p className="text-xs text-surface-500">{m.needsImage ? "Posts need a picture." : m.textOnly ? "Text posts only for now." : "Text and picture posts."}</p>}
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-xs text-surface-500">X (Twitter) and TikTok aren't available yet — they need paid API access or app review.</p>
    </div>
  );
}
