import { useMemo, useState } from "react";
import { AlertTriangle, Clock, Send, X, FileText, Image as ImageIcon } from "lucide-react";
import Button from "../../components/Button";
import Alert from "../../components/Alert";
import { schedulePost, updatePost, type SocialAccount, type SocialPost } from "../../lib/social";
import { PLATFORMS, PlatformTile, toLocalInput } from "./socialMeta";

interface Props {
  accounts: SocialAccount[];
  post?: SocialPost;                 // editing an existing draft / scheduled / failed post
  presetDate?: Date;                 // clicked a day in the calendar
  onClose: () => void;
  onSaved: (posts: SocialPost[], message: string) => void;
}

const presets = (): { label: string; date: Date }[] => {
  const now = new Date();
  const inHour = new Date(now.getTime() + 3600_000);
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
  const monday = new Date(now); monday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7)); monday.setHours(9, 0, 0, 0);
  return [{ label: "In 1 hour", date: inHour }, { label: "Tomorrow 9:00", date: tomorrow }, { label: "Next Monday 9:00", date: monday }];
};

export default function SocialComposer({ accounts, post, presetDate, onClose, onSaved }: Props) {
  const editing = !!post;
  const usable = accounts.filter((a) => a.has_token);
  const [picked, setPicked] = useState<string[]>(post ? [post.social_account_id] : usable.length === 1 ? [usable[0].id] : []);
  const [content, setContent] = useState(post?.content ?? "");
  const [media, setMedia] = useState(post?.media_url ?? "");
  const futureAt = post?.scheduled_at && new Date(post.scheduled_at).getTime() > Date.now() ? new Date(post.scheduled_at) : null;   // a time that already passed means "publish now"
  const [mode, setMode] = useState<"now" | "later">(futureAt || presetDate ? "later" : "now");
  const [when, setWhen] = useState(futureAt ? toLocalInput(futureAt) : presetDate ? toLocalInput(presetDate) : "");
  const [busy, setBusy] = useState<"draft" | "go" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imgBad, setImgBad] = useState(false);

  const selected = accounts.filter((a) => picked.includes(a.id));
  const limit = selected.length ? Math.min(...selected.map((a) => PLATFORMS[a.platform].limit)) : 2000;
  const problems = useMemo(() => {
    const out: string[] = [];
    for (const a of selected) {
      const m = PLATFORMS[a.platform];
      if (m.needsImage && !media.trim()) out.push(`${m.label} needs a picture — add an image link.`);
      if (m.textOnly && media.trim()) out.push(`${m.label} is text-only for now — remove the image link or untick it.`);
    }
    if (content.length > limit) out.push(`Too long for ${selected.find((a) => PLATFORMS[a.platform].limit === limit) ? PLATFORMS[selected.find((a) => PLATFORMS[a.platform].limit === limit)!.platform].label : "this network"} (max ${limit.toLocaleString()}).`);
    if (mode === "later" && when && new Date(when).getTime() <= Date.now()) out.push("That time has passed — pick a future time, or choose “Publish now”.");
    return out;
  }, [selected, media, content, limit, mode, when]);

  const canGo = content.trim() && picked.length > 0 && problems.length === 0 && (mode === "now" || !!when);
  const first = selected[0];

  async function submit(asDraft: boolean) {
    setBusy(asDraft ? "draft" : "go"); setError(null);
    const iso = !asDraft && mode === "later" && when ? new Date(when).toISOString() : undefined;
    try {
      if (editing && post) {
        const p = await updatePost(post.id, {
          content, media_url: media.trim(), draft: asDraft ? true : false,
          ...(iso ? { scheduled_at: iso } : { clear_schedule: true }),
        });
        onSaved([p], asDraft ? "Draft saved." : mode === "later" ? "Post rescheduled." : "Publishing now…");
      } else {
        const made: SocialPost[] = [];
        for (const id of picked) {
          made.push(await schedulePost({ social_account_id: id, content, media_url: media.trim() || undefined, scheduled_at: iso, draft: asDraft }));
        }
        onSaved(made, asDraft ? `Saved ${made.length > 1 ? `${made.length} drafts` : "as draft"}.` : mode === "later" ? `Scheduled for ${new Date(when).toLocaleString()}.` : "Publishing now…");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-surface-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex w-full max-w-3xl flex-col bg-white shadow-xl animate-slide-in-right">
        <div className="flex items-center justify-between border-b border-surface-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-surface-900">{editing ? "Edit post" : "New post"}</h2>
            <p className="text-xs text-surface-500">{editing ? "Changes apply before it is published." : "Write once, post to one or more accounts."}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-surface-400 hover:bg-surface-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto grid md:grid-cols-[minmax(0,1fr)_260px] gap-0">
          <div className="p-5 space-y-4 min-w-0">
            {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}

            {!editing && (
              <div>
                <p className="text-xs font-semibold text-surface-600 mb-1.5">Post to</p>
                {usable.length === 0 ? (
                  <p className="text-sm text-warning-dark bg-warning-light rounded-lg px-3 py-2">No account is ready. Connect one in the Accounts tab first.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {accounts.map((a) => {
                      const on = picked.includes(a.id);
                      const off = !a.has_token;
                      return (
                        <button key={a.id} type="button" disabled={off} title={off ? "Needs reconnecting (no token)" : a.account_name}
                          onClick={() => setPicked((p) => (on ? p.filter((x) => x !== a.id) : [...p, a.id]))}
                          className={`inline-flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 text-xs font-medium transition-colors ${off ? "opacity-40 cursor-not-allowed border-surface-200" : on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-surface-200 text-surface-700 hover:bg-surface-50"}`}>
                          <PlatformTile platform={a.platform} size={22} />{a.account_name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={7} placeholder="What do you want to share?"
                className="block w-full rounded-lg border border-surface-200 px-3 py-2.5 text-sm text-surface-800 placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 resize-y" />
              <div className="flex justify-between text-[11px] mt-1">
                <span className="text-surface-400">Hashtags and emoji work. Links are posted as typed.</span>
                <span className={content.length > limit ? "text-danger-base font-semibold" : content.length > limit * 0.9 ? "text-warning-dark" : "text-surface-500"}>{content.length.toLocaleString()} / {limit.toLocaleString()}</span>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-surface-600 mb-1.5"><ImageIcon size={13} /> Picture <span className="font-normal text-surface-400">(public image link, optional)</span></label>
              <input value={media} onChange={(e) => { setMedia(e.target.value); setImgBad(false); }} placeholder="https://…/photo.jpg" type="url"
                className="block w-full rounded-lg border border-surface-200 px-3 py-2 text-sm placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
            </div>

            <div>
              <p className="text-xs font-semibold text-surface-600 mb-1.5">When</p>
              <div className="inline-flex rounded-lg bg-surface-100 p-0.5 text-xs font-medium">
                {([["now", "Publish now"], ["later", "Schedule"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setMode(k)} className={`px-3 py-1.5 rounded-md transition-colors ${mode === k ? "bg-white shadow-sm text-surface-900" : "text-surface-600"}`}>{l}</button>
                ))}
              </div>
              {mode === "later" && (
                <div className="mt-2 space-y-2">
                  <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} min={toLocalInput(new Date())}
                    className="rounded-lg border border-surface-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
                  <div className="flex flex-wrap gap-1.5">
                    {presets().map((p) => <button key={p.label} type="button" onClick={() => setWhen(toLocalInput(p.date))} className="rounded-full border border-surface-200 px-2.5 py-1 text-[11px] text-surface-600 hover:bg-surface-50"><Clock size={10} className="inline mr-1" />{p.label}</button>)}
                  </div>
                  <p className="text-[11px] text-surface-500">Your local time ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Posts go out within a minute of the chosen time.</p>
                </div>
              )}
            </div>

            {problems.length > 0 && (
              <ul className="rounded-lg border border-warning-base/30 bg-warning-light px-3 py-2 text-xs text-warning-dark space-y-1">
                {problems.map((p) => <li key={p} className="flex gap-1.5"><AlertTriangle size={13} className="flex-shrink-0 mt-px" />{p}</li>)}
              </ul>
            )}
          </div>

          {/* live preview */}
          <aside className="border-t md:border-t-0 md:border-l border-surface-100 bg-surface-50/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-surface-500 mb-2">Preview</p>
            <div className="rounded-xl border border-surface-200 bg-white overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 p-3">
                {first ? <PlatformTile platform={first.platform} size={28} /> : <span className="w-7 h-7 rounded-lg bg-surface-200" />}
                <div className="min-w-0"><p className="text-xs font-semibold text-surface-900 truncate">{first?.account_name ?? "Choose an account"}</p><p className="text-[10px] text-surface-400">{mode === "later" && when ? new Date(when).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Just now"}</p></div>
              </div>
              <p className="px-3 pb-3 text-xs text-surface-800 whitespace-pre-wrap break-words">{content || <span className="text-surface-400">Your text appears here…</span>}</p>
              {media.trim() && !imgBad && <img src={media} alt="" onError={() => setImgBad(true)} className="w-full max-h-48 object-cover border-t border-surface-100" />}
              {media.trim() && imgBad && <p className="px-3 pb-3 text-[11px] text-danger-base">Couldn't load that image link.</p>}
            </div>
            {selected.length > 1 && <p className="text-[11px] text-surface-500 mt-2">Posting the same content to {selected.length} accounts.</p>}
          </aside>
        </div>

        <div className="border-t border-surface-200 px-5 py-3 flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" size="sm" icon={<FileText size={14} />} loading={busy === "draft"} disabled={!content.trim() || (!editing && picked.length === 0) || content.length > limit} onClick={() => submit(true)}>Save draft</Button>
          <Button size="sm" icon={<Send size={14} />} loading={busy === "go"} disabled={!canGo} onClick={() => submit(false)}>
            {mode === "later" ? (editing ? "Reschedule" : "Schedule") : "Publish now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
