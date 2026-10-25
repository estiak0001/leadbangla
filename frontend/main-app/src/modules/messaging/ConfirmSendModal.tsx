import { Send } from "lucide-react";
import Button from "../../components/Button";
import { CHANNELS } from "../../lib/messaging";
import type { SmsChannel } from "../../lib/sms";

interface Props {
  channel: SmsChannel;
  campaignName: string;
  recipients: number | null;
  /** Estimated credits for this send, and the wallet balance, in BDT. */
  estimate?: number | null;
  balance?: number | null;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmSendModal({ channel, campaignName, recipients, estimate, balance, busy, onConfirm, onClose }: Props) {
  const label = CHANNELS[channel].label;
  const short = estimate != null && balance != null && balance < estimate;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${CHANNELS[channel].tone}`}><Send size={18} /></div>
        <h2 className="font-semibold text-surface-900">Send “{campaignName}”?</h2>
        <p className="mt-2 text-sm text-surface-600">
          This sends a {label} message to {recipients !== null ? <strong>{recipients.toLocaleString()} contacts</strong> : "your segment"}.
          Only contacts who opted in to {label} receive it; the rest are skipped.
          Credits are deducted from your wallet for each message sent.
        </p>
        {estimate != null && (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${short ? "border-danger-base/30 bg-danger-light" : "border-surface-200 bg-surface-50"}`}>
            <div className="flex justify-between"><span className="text-surface-500">Estimated cost</span><b className="text-surface-900">৳{estimate.toFixed(2)}</b></div>
            {balance != null && <div className="flex justify-between"><span className="text-surface-500">Wallet balance</span><b className="text-surface-900">৳{balance.toFixed(2)}</b></div>}
            {short && (
              <p className="mt-1.5 text-xs text-danger-dark">
                Your balance may not cover every message — the rest would fail. <a href="/billing?tab=wallet" className="font-semibold underline">Top up your wallet</a>
              </p>
            )}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" icon={<Send size={14} />} loading={busy} onClick={onConfirm}>Send now</Button>
        </div>
      </div>
    </div>
  );
}
