import { FormEvent, useState } from "react";
import { CheckCircle2, AlertTriangle, ChevronDown, HelpCircle, KeyRound, Plus, RefreshCw, Trash2 } from "lucide-react";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import { checkAccount, connectAccount, disconnectAccount, type SocialAccount, type SocialPlatform } from "../../lib/social";
import { PLATFORMS, PlatformTile, ago } from "./socialMeta";

const ORDER: SocialPlatform[] = ["facebook", "instagram", "linkedin"];
const inputCls = "block w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

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
        <p className={`mt-1.5 text-[11px] leading-snug ${bad ? "text-danger-dark" : "text-surface-600"}`}>{a.has_token ? a.last_check_message : "This account needs a token before it can post. Disconnect it and connect again with a token."}</p>
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

function ConnectForm({ platform, onDone, onCancel }: { platform: SocialPlatform; onDone: (a: SocialAccount) => void; onCancel: () => void }) {
  const m = PLATFORMS[platform];
  const [name, setName] = useState("");
  const [pid, setPid] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { onDone(await connectAccount(platform, name.trim(), pid.trim(), token.trim())); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not connect"); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-2.5 rounded-xl border border-brand-100 bg-brand-50/40 p-3 animate-slide-up">
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      <div className="grid sm:grid-cols-2 gap-2.5">
        <div><label className="block text-[11px] font-semibold text-surface-600 mb-1">Name (for you)</label><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. My ${m.label}`} required minLength={2} /></div>
        <div><label className="block text-[11px] font-semibold text-surface-600 mb-1">{m.idLabel}</label><input className={inputCls} value={pid} onChange={(e) => setPid(e.target.value)} inputMode="numeric" placeholder="123456789012345" required /><p className="text-[10px] text-surface-500 mt-0.5">{m.idHint}</p></div>
      </div>
      <div><label className="flex items-center gap-1 text-[11px] font-semibold text-surface-600 mb-1"><KeyRound size={11} /> Access token</label><input className={`${inputCls} font-mono`} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste token" required /><p className="text-[10px] text-surface-500 mt-0.5">{m.tokenHint}. Stored encrypted; we check it with {platform === "linkedin" ? "LinkedIn" : "Meta"} right now.</p></div>
      <button type="button" onClick={() => setHelp((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"><HelpCircle size={13} />Where do I find these?<ChevronDown size={12} className={help ? "rotate-180" : ""} /></button>
      {help && <ol className="list-decimal list-inside space-y-1 text-[11px] text-surface-700 rounded-lg bg-white border border-surface-100 px-3 py-2">{m.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
      <div className="flex gap-2"><Button type="submit" size="sm" loading={busy}>Connect &amp; check</Button><Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}

export default function SocialAccountsTab({ accounts, onAccountsChange }: { accounts: SocialAccount[]; onAccountsChange: (a: SocialAccount[]) => void }) {
  const [adding, setAdding] = useState<SocialPlatform | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

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
                {adding !== p && <Button size="xs" variant={list.length ? "secondary" : "primary"} icon={<Plus size={12} />} onClick={() => setAdding(p)}>{list.length ? "Add" : "Connect"}</Button>}
              </div>
              <div className="mt-3 space-y-2">
                {list.map((a) => (
                  <AccountRow key={a.id} a={a} onError={setError}
                    onChange={(u) => { onAccountsChange(u ? accounts.map((x) => (x.id === u.id ? u : x)) : accounts.filter((x) => x.id !== a.id)); if (u) setOk(u.last_check_ok ? u.last_check_message : null); }} />
                ))}
                {list.length === 0 && adding !== p && <p className="text-xs text-surface-500">{m.needsImage ? "Posts need a picture." : m.textOnly ? "Text posts only for now." : "Text and picture posts."}</p>}
              </div>
              {adding === p && <ConnectForm platform={p} onCancel={() => setAdding(null)} onDone={(a) => { onAccountsChange([...accounts, a]); setAdding(null); setOk(a.last_check_message ?? "Connected."); }} />}
            </section>
          );
        })}
      </div>

      <p className="text-xs text-surface-500">X (Twitter) and TikTok aren't available yet — they need paid API access or app review.</p>
    </div>
  );
}
