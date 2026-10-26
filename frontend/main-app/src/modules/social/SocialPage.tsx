import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, FileText, Heart, LayoutList, MessageCircle, Pencil, Plus,
  RefreshCw, Repeat2, RotateCcw, Send, Share2, Trash2,
} from "lucide-react";
import AppLayout from "../../components/AppLayout";
import PlanUsageStrip from "../../components/PlanUsageStrip";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Spinner from "../../components/Spinner";
import {
  deletePost, fetchSocialAccounts, fetchSocialPosts, publishNow, refreshStats,
  type SocialAccount, type SocialPost, type SocialPostStatus,
} from "../../lib/social";
import SocialAccountsTab from "./SocialAccountsTab";
import SocialComposer from "./SocialComposer";
import { PLATFORMS, PlatformTile, StatusPill, fmtWhen } from "./socialMeta";

type Filter = "all" | SocialPostStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" }, { key: "scheduled", label: "Scheduled" }, { key: "published", label: "Published" },
  { key: "draft", label: "Drafts" }, { key: "failed", label: "Failed" },
];
const when = (p: SocialPost) => p.scheduled_at ?? p.published_at ?? p.created_at;

function Tile({ label, value, sub, tone = "default" }: { label: string; value: string | number; sub?: string; tone?: "default" | "danger" }) {
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 bg-white ${tone === "danger" && Number(value) > 0 ? "border-danger-base/40" : "border-surface-200"}`}>
      <p className="text-[11px] text-surface-500">{label}</p>
      <p className={`text-xl font-bold leading-tight ${tone === "danger" && Number(value) > 0 ? "text-danger-base" : "text-surface-900"}`}>{value}</p>
      {sub && <p className="text-[10px] text-surface-400 truncate">{sub}</p>}
    </div>
  );
}

/* ── month calendar ───────────────────────────────────────────────────────── */
function Calendar({ posts, onDay, onPost }: { posts: SocialPost[]; onDay: (d: Date) => void; onPost: (p: SocialPost) => void }) {
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const first = new Date(month);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));        // week starts Monday
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const byDay = useMemo(() => {
    const m = new Map<string, SocialPost[]>();
    for (const p of posts) { const k = new Date(when(p)).toDateString(); m.set(k, [...(m.get(k) ?? []), p]); }
    return m;
  }, [posts]);
  const today = new Date().toDateString();
  return (
    <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-100">
        <p className="text-sm font-semibold text-surface-900">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
        <div className="flex items-center gap-1">
          <button aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="p-1.5 rounded-md hover:bg-surface-100"><ChevronLeft size={16} /></button>
          <button onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="px-2 py-1 text-xs rounded-md hover:bg-surface-100 text-surface-600">Today</button>
          <button aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="p-1.5 rounded-md hover:bg-surface-100"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-[10px] font-semibold uppercase tracking-wide text-surface-400 border-b border-surface-100">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const inMonth = d.getMonth() === month.getMonth();
          const list = (byDay.get(d.toDateString()) ?? []).sort((a, b) => +new Date(when(a)) - +new Date(when(b)));
          const isFuture = d.getTime() + 86400_000 > Date.now();
          return (
            <div key={d.toISOString()} onClick={() => isFuture && onDay(d)}
              className={`min-h-[84px] border-b border-r border-surface-100 p-1 ${inMonth ? "bg-white" : "bg-surface-50/70"} ${isFuture ? "cursor-pointer hover:bg-brand-50/30" : ""}`}>
              <p className={`text-[11px] w-5 h-5 flex items-center justify-center rounded-full ${d.toDateString() === today ? "bg-brand-500 text-white font-bold" : inMonth ? "text-surface-600" : "text-surface-300"}`}>{d.getDate()}</p>
              <div className="mt-0.5 space-y-0.5">
                {list.slice(0, 3).map((p) => (
                  <button key={p.id} onClick={(e) => { e.stopPropagation(); onPost(p); }} title={p.content}
                    className={`w-full flex items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] truncate ${PLATFORMS[p.platform].soft}`}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.status === "failed" ? "bg-danger-base" : p.status === "published" ? "bg-success-base" : p.status === "draft" ? "bg-surface-400" : "bg-warning-base"}`} />
                    <span className="truncate">{new Date(when(p)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} {p.content}</span>
                  </button>
                ))}
                {list.length > 3 && <p className="text-[10px] text-surface-500 px-1">+{list.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── one compact post row ─────────────────────────────────────────────────── */
function PostRow({ p, account, busy, onEdit, onPublish, onRefresh, onDelete }: {
  p: SocialPost; account?: SocialAccount; busy: boolean;
  onEdit: () => void; onPublish: () => void; onRefresh: () => void; onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const editable = p.status === "draft" || p.status === "scheduled" || p.status === "failed";
  return (
    <div className={`rounded-xl border bg-white px-3 py-2.5 transition-shadow hover:shadow-sm ${p.status === "failed" ? "border-danger-base/40" : "border-surface-200"}`}>
      <div className="flex items-start gap-3">
        <PlatformTile platform={p.platform} size={30} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-surface-900 line-clamp-2 break-words">{p.content}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-surface-500">
            <StatusPill status={p.status} />
            <span className="truncate max-w-[180px]">{account?.account_name ?? PLATFORMS[p.platform].label}</span>
            <span>{p.status === "published" ? `Posted ${fmtWhen(p.published_at)}` : p.status === "scheduled" ? (p.scheduled_at ? `Goes out ${fmtWhen(p.scheduled_at)}` : "Going out now") : p.status === "draft" ? `Saved ${fmtWhen(p.created_at)}` : ""}</span>
            {p.media_url && <span className="rounded bg-surface-100 px-1.5 py-px">picture</span>}
            {p.status === "published" && (
              <span className="inline-flex items-center gap-2.5 text-surface-600">
                <span className="inline-flex items-center gap-0.5"><Heart size={11} />{p.likes_count}</span>
                <span className="inline-flex items-center gap-0.5"><MessageCircle size={11} />{p.comments_count}</span>
                <span className="inline-flex items-center gap-0.5"><Repeat2 size={11} />{p.shares_count}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {p.status === "failed" && <Button size="xs" variant="secondary" icon={<RotateCcw size={12} />} loading={busy} onClick={onPublish}>Retry</Button>}
          {(p.status === "draft" || p.status === "scheduled") && <Button size="xs" variant="secondary" icon={<Send size={12} />} loading={busy} onClick={onPublish}>{p.status === "draft" ? "Publish" : "Now"}</Button>}
          {p.status === "published" && <button onClick={onRefresh} disabled={busy} title="Refresh numbers" aria-label="Refresh numbers" className="p-1.5 rounded-md text-surface-500 hover:text-brand-600 hover:bg-brand-50 disabled:opacity-40"><RefreshCw size={14} className={busy ? "animate-spin" : ""} /></button>}
          {editable && <button onClick={onEdit} title="Edit" aria-label="Edit" className="p-1.5 rounded-md text-surface-500 hover:text-brand-600 hover:bg-brand-50"><Pencil size={14} /></button>}
          {p.status !== "publishing" && <button onClick={() => setConfirm(true)} title="Delete" aria-label="Delete" className="p-1.5 rounded-md text-surface-500 hover:text-danger-base hover:bg-danger-light"><Trash2 size={14} /></button>}
        </div>
      </div>
      {p.status === "failed" && p.error_message && (
        <p className="mt-2 flex gap-1.5 rounded-lg bg-danger-light px-2.5 py-1.5 text-[11px] text-danger-dark"><AlertTriangle size={13} className="flex-shrink-0 mt-px" />{p.error_message}</p>
      )}
      {confirm && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-surface-50 px-2.5 py-2 text-xs">
          <span className="flex-1 min-w-40 text-surface-700">{p.status === "published" ? "Remove from this list? The post stays on the network." : "Delete this post?"}</span>
          <Button size="xs" variant="danger" onClick={() => { setConfirm(false); onDelete(); }}>Delete</Button>
          <Button size="xs" variant="ghost" onClick={() => setConfirm(false)}>Keep</Button>
        </div>
      )}
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────────────────── */
export default function SocialPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "accounts" ? "accounts" : "posts";
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [platform, setPlatform] = useState<"all" | SocialAccount["platform"]>("all");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [composer, setComposer] = useState<null | { post?: SocialPost; date?: Date }>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => Promise.all([fetchSocialAccounts(), fetchSocialPosts()])
    .then(([a, p]) => { setAccounts(a); setPosts(p); })
    .catch(() => setError("Failed to load. Check your connection and refresh.")).finally(() => setLoading(false)), []);
  useEffect(() => { reload(); }, [reload]);

  // While something is going out (or due within the next minute) keep the list fresh.
  const live = posts.some((p) => p.status === "publishing" || (p.status === "scheduled" && (!p.scheduled_at || +new Date(p.scheduled_at) < Date.now() + 90_000)));
  useEffect(() => { if (!live) return; const t = setInterval(() => { fetchSocialPosts().then(setPosts).catch(() => undefined); }, 4000); return () => clearInterval(t); }, [live]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: posts.length };
    for (const p of posts) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [posts]);
  const engagement = posts.reduce((n, p) => n + p.likes_count + p.comments_count + p.shares_count, 0);
  const nextUp = posts.filter((p) => p.status === "scheduled" && p.scheduled_at).sort((a, b) => +new Date(a.scheduled_at!) - +new Date(b.scheduled_at!))[0];
  const shown = posts.filter((p) => (filter === "all" || p.status === filter) && (platform === "all" || p.platform === platform))
    .sort((a, b) => +new Date(when(b)) - +new Date(when(a)));
  const accountOf = (p: SocialPost) => accounts.find((a) => a.id === p.social_account_id);
  const troubled = accounts.filter((a) => !a.has_token || a.last_check_ok === false);

  async function act(id: string, fn: () => Promise<SocialPost>) {
    setBusyId(id); setError(null);
    try { const u = await fn(); setPosts((prev) => prev.map((p) => (p.id === id ? u : p))); }
    catch (e) { setError(e instanceof Error ? e.message : "That didn't work"); }
    finally { setBusyId(null); }
  }
  async function remove(id: string) {
    setBusyId(id);
    try { await deletePost(id); setPosts((prev) => prev.filter((p) => p.id !== id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to delete"); }
    finally { setBusyId(null); }
  }
  const setTab = (t: "posts" | "accounts") => setParams(t === "posts" ? {} : { tab: t });

  return (
    <AppLayout>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-surface-900 tracking-tight">Social Media</h1>
          <p className="text-sm text-surface-600">Plan, schedule and publish to your pages.</p>
        </div>
        <Button size="sm" icon={<Plus size={15} />} onClick={() => accounts.some((a) => a.has_token) ? setComposer({}) : setTab("accounts")}>
          {accounts.some((a) => a.has_token) ? "New post" : "Connect an account"}
        </Button>
      </div>
      <PlanUsageStrip items={["social"]} />

      <div className="flex gap-1 border-b border-surface-200 mb-4">
        {([["posts", "Posts", posts.length], ["accounts", "Accounts", accounts.length]] as const).map(([k, l, n]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === k ? "border-brand-500 text-brand-700" : "border-transparent text-surface-500 hover:text-surface-800"}`}>
            {l}<span className="rounded-full bg-surface-100 px-1.5 py-0.5 text-[11px] text-surface-600">{n}</span>
            {k === "accounts" && troubled.length > 0 && <span className="w-2 h-2 rounded-full bg-danger-base" title="An account needs attention" />}
          </button>
        ))}
      </div>

      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-3">{error}</Alert>}
      {notice && <Alert variant="success" onDismiss={() => setNotice(null)} className="mb-3">{notice}</Alert>}

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : tab === "accounts" ? (
        <SocialAccountsTab accounts={accounts} onAccountsChange={setAccounts} />
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-surface-200 bg-white py-14 px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-4"><Share2 size={26} /></div>
          <h2 className="text-lg font-semibold text-surface-900">Connect your first page</h2>
          <p className="text-sm text-surface-600 mt-1 mb-5 max-w-md mx-auto">Link Facebook, Instagram or LinkedIn, then write once and schedule posts from one place.</p>
          <Button size="sm" onClick={() => setTab("accounts")}>Connect an account</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {troubled.length > 0 && (
            <button onClick={() => setTab("accounts")} className="w-full text-left rounded-xl border border-warning-base/30 bg-warning-light px-3.5 py-2.5 text-sm text-warning-dark flex items-center gap-2">
              <AlertTriangle size={15} className="flex-shrink-0" />
              <span className="flex-1"><b>{troubled.length} account{troubled.length > 1 ? "s" : ""} need{troubled.length === 1 ? "s" : ""} attention</b> — posts to {troubled.length > 1 ? "them" : "it"} will fail until reconnected.</span>
              <span className="underline text-xs">Fix in Accounts</span>
            </button>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <Tile label="Scheduled" value={counts.scheduled ?? 0} sub={nextUp ? `Next: ${fmtWhen(nextUp.scheduled_at)}` : "Nothing queued"} />
            <Tile label="Published" value={counts.published ?? 0} />
            <Tile label="Drafts" value={counts.draft ?? 0} />
            <Tile label="Failed" value={counts.failed ?? 0} tone="danger" sub={counts.failed ? "Open to see why" : undefined} />
            <Tile label="Engagement" value={engagement.toLocaleString()} sub="likes + comments + shares" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 overflow-x-auto bg-surface-100 p-1 rounded-lg">
              {FILTERS.map((f) => (
                <button key={f.key} onClick={() => setFilter(f.key)} className={`whitespace-nowrap px-2.5 py-1 rounded-md text-xs font-medium ${filter === f.key ? "bg-white shadow-sm text-surface-900" : "text-surface-600 hover:text-surface-900"}`}>
                  {f.label} <span className="text-surface-400">{counts[f.key] ?? 0}</span>
                </button>
              ))}
            </div>
            <select value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)} className="rounded-lg border border-surface-200 bg-white px-2.5 py-1.5 text-xs text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
              <option value="all">All networks</option>
              {Object.entries(PLATFORMS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
            <div className="ml-auto inline-flex rounded-lg bg-surface-100 p-0.5">
              {([["list", LayoutList, "List"], ["calendar", CalendarDays, "Calendar"]] as const).map(([k, Icon, l]) => (
                <button key={k} onClick={() => setView(k)} title={l} aria-label={l} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium ${view === k ? "bg-white shadow-sm text-surface-900" : "text-surface-600"}`}><Icon size={14} /><span className="hidden sm:inline">{l}</span></button>
              ))}
            </div>
          </div>

          {view === "calendar" ? (
            <Calendar posts={shown} onDay={(d) => { const x = new Date(d); x.setHours(9, 0, 0, 0); setComposer({ date: x.getTime() > Date.now() ? x : new Date(Date.now() + 3600_000) }); }}
              onPost={(p) => (p.status === "published" || p.status === "publishing" ? setView("list") : setComposer({ post: p }))} />
          ) : shown.length === 0 ? (
            <div className="rounded-xl border border-surface-200 bg-white py-12 text-center">
              <FileText size={28} className="mx-auto text-surface-300 mb-2" />
              <p className="text-sm font-medium text-surface-700">{posts.length === 0 ? "No posts yet" : "No posts match these filters"}</p>
              <p className="text-xs text-surface-500 mt-1">{posts.length === 0 ? "Write your first post and schedule it." : "Try a different status or network."}</p>
              {posts.length === 0 && <Button size="sm" className="mt-3" icon={<Plus size={14} />} onClick={() => setComposer({})}>New post</Button>}
            </div>
          ) : (
            <div className="space-y-2">
              {shown.map((p) => (
                <PostRow key={p.id} p={p} account={accountOf(p)} busy={busyId === p.id}
                  onEdit={() => setComposer({ post: p })}
                  onPublish={() => act(p.id, () => publishNow(p.id))}
                  onRefresh={() => act(p.id, () => refreshStats(p.id))}
                  onDelete={() => remove(p.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {composer && (
        <SocialComposer accounts={accounts} post={composer.post} presetDate={composer.date} onClose={() => setComposer(null)}
          onSaved={(saved, msg) => {
            setPosts((prev) => [...saved, ...prev.filter((p) => !saved.some((s) => s.id === p.id))]);
            setComposer(null); setNotice(msg); setTab("posts"); setTimeout(() => { reload(); }, 2500);
          }} />
      )}
    </AppLayout>
  );
}
