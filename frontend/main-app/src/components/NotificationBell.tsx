import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { fetchNotifications, fetchUnreadCount, markRead, type AppNotification } from "../lib/inbox";
import NotificationItem from "./NotificationItem";

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const refreshCount = useCallback(() => { fetchUnreadCount().then(setCount).catch(() => undefined); }, []);
  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 30000);
    const onFocus = () => refreshCount();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    fetchNotifications({ limit: 15 }).then(setItems).catch(() => setItems([]));
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const openItem = (n: AppNotification) => {
    setOpen(false);
    if (!n.read) { markRead([n.id]).then(refreshCount).catch(() => undefined); setItems((p) => p?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null); }
    if (n.link) navigate(n.link);
  };
  const markAll = async () => { await markRead().catch(() => undefined); setItems((p) => p?.map((x) => ({ ...x, read: true })) ?? null); setCount(0); };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative p-2 rounded-full text-white/80 hover:bg-white/10 transition-colors" aria-label={count ? `Notifications, ${count} unread` : "Notifications"} aria-expanded={open}>
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-shell">{count > 99 ? "99+" : count}</span>
        )}
      </button>
      {open && (
        <div className="fixed sm:absolute inset-x-2 sm:inset-x-auto top-16 sm:top-full sm:right-0 sm:mt-1.5 sm:w-[380px] rounded-lg border border-surface-200 bg-white shadow-xl z-50 animate-slide-up overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-surface-100">
            <p className="text-sm font-semibold text-surface-900">Notifications{count > 0 && <span className="ml-1.5 text-xs font-medium text-brand-600">{count} new</span>}</p>
            {count > 0 && <button onClick={markAll} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"><CheckCheck size={13} />Mark all read</button>}
          </div>
          <div className="max-h-[70vh] sm:max-h-[420px] overflow-y-auto divide-y divide-surface-100">
            {items === null ? <p className="p-6 text-center text-sm text-surface-400">Loading…</p>
              : items.length === 0 ? (
                <div className="p-8 text-center"><Bell size={24} className="mx-auto text-surface-300 mb-2" /><p className="text-sm font-medium text-surface-700">You’re all caught up</p><p className="text-xs text-surface-500 mt-1">Assigned tasks, comments and alerts appear here.</p></div>
              ) : items.map((n) => <NotificationItem key={n.id} n={n} onClick={() => openItem(n)} />)}
          </div>
          <div className="flex justify-between px-3.5 py-2 border-t border-surface-100 text-xs">
            <Link to="/notifications" onClick={() => setOpen(false)} className="text-brand-600 hover:underline font-medium">See all</Link>
            <Link to="/settings?tab=general" onClick={() => setOpen(false)} className="text-surface-500 hover:text-surface-800">Notification settings</Link>
          </div>
        </div>
      )}
    </div>
  );
}
