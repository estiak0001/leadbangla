import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import Alert from "../../../components/Alert";
import Card from "../../../components/Card";
import EmptyState from "../../../components/EmptyState";
import Spinner from "../../../components/Spinner";
import { fetchSmsInbound, type SmsInboundItem } from "../../../lib/sms";

function formatDate(ts: string): string {
  return new Date(ts).toLocaleString("en-BD", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ReceiveTab() {
  const [messages, setMessages] = useState<SmsInboundItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSmsInbound().then(setMessages).catch(() => setError("Failed to load received messages"));
  }, []);

  return (
    <div className="space-y-4">
      <Alert variant="info">
        Replies from customers texting back your Sender ID land here. Requires SSL Wireless's
        inbound webhook to be pointed at this platform — confirm with them once you're live.
      </Alert>

      {error && <Alert variant="error">{error}</Alert>}

      {!messages ? (
        <div className="py-16 flex justify-center"><Spinner size="lg" /></div>
      ) : messages.length === 0 ? (
        <Card>
          <EmptyState icon={<Inbox size={40} />} title="No replies yet" description="Inbound SMS replies from your contacts will show up here." />
        </Card>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <Card key={m.id} className="py-3 px-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <span className="font-mono text-sm text-surface-800">
                  {m.contact_name ? `${m.contact_name} (${m.from_phone})` : m.from_phone}
                </span>
                <span className="text-xs text-surface-400">{formatDate(m.received_at)}</span>
              </div>
              <p className="text-sm text-surface-700">{m.body}</p>
              {m.to_sender_id && <p className="text-xs text-surface-400 mt-1">To: {m.to_sender_id}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
