import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCheck } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import NotificationItem from "../../components/NotificationItem";
import PageHeader from "../../components/PageHeader";
import Spinner from "../../components/Spinner";
import { fetchNotifications, markRead, type AppNotification } from "../../lib/inbox";

const PAGE = 30;

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback((reset: boolean, offset = 0) => {
    if (reset) setLoading(true);
    fetchNotifications({ unreadOnly, limit: PAGE, offset })
      .then((r) => { setItems((p) => (reset ? r : [...p, ...r])); setMore(r.length === PAGE); setError(""); })
      .catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [unreadOnly]);
  useEffect(() => load(true), [load]);

  const open = (n: AppNotification) => {
    if (!n.read) { markRead([n.id]).catch(() => undefined); setItems((p) => p.map((x) => (x.id === n.id ? { ...x, read: true } : x))); }
    if (n.link) navigate(n.link);
  };

  return (
    <AppLayout>
      <PageHeader title="Notifications" description="Tasks assigned to you, comments, lead updates, team changes and alerts."
        actions={<Button size="sm" variant="secondary" icon={<CheckCheck size={14} />} onClick={() => markRead().then(() => load(true))}>Mark all read</Button>} />
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      <div className="flex gap-1 bg-surface-100 p-1 rounded-md w-fit mb-4">
        {([[false, "All"], [true, "Unread"]] as const).map(([v, l]) => (
          <button key={l} onClick={() => setUnreadOnly(v)} className={`px-3 py-1.5 rounded text-xs font-medium ${unreadOnly === v ? "bg-white shadow-sm text-surface-900" : "text-surface-600"}`}>{l}</button>
        ))}
      </div>
      <div className="bg-white border border-surface-200 rounded-lg overflow-hidden">
        {loading ? <div className="flex justify-center py-12"><Spinner /></div> : items.length === 0 ? (
          <p className="p-10 text-center text-sm text-surface-500">{unreadOnly ? "Nothing unread." : "No notifications yet."}</p>
        ) : <div className="divide-y divide-surface-100">{items.map((n) => <NotificationItem key={n.id} n={n} onClick={() => open(n)} />)}</div>}
      </div>
      {more && <div className="flex justify-center mt-4"><Button size="sm" variant="secondary" onClick={() => load(false, items.length)}>Load more</Button></div>}
    </AppLayout>
  );
}
