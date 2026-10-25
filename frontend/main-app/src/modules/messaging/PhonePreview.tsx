import { Check, CheckCheck } from "lucide-react";
import type { SmsChannel } from "../../lib/sms";

/** A phone-shaped preview of how the message will look to the customer. */
export default function PhonePreview({ channel, body, sender }: { channel: SmsChannel; body: string; sender: string }) {
  const isWa = channel === "whatsapp";
  const time = "10:42";
  return (
    <div className="mx-auto w-full max-w-[290px]">
      <div className="rounded-[2rem] border-[7px] border-surface-800 bg-surface-800 shadow-xl overflow-hidden">
        {/* header */}
        <div className={`px-4 pt-5 pb-2.5 flex items-center gap-2.5 ${isWa ? "bg-[#075e54] text-white" : "bg-surface-100 text-surface-900 border-b border-surface-200"}`}>
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isWa ? "bg-white/20" : "bg-brand-100 text-brand-700"}`}>
            {(sender || "L").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-semibold truncate">{sender || "LeadBangla"}</p>
            <p className={`text-[10px] ${isWa ? "text-white/70" : "text-surface-500"}`}>{isWa ? "business account" : "Text message"}</p>
          </div>
        </div>
        {/* chat */}
        <div className={`h-[300px] overflow-y-auto px-3 py-3 ${isWa ? "bg-[#e5ddd5]" : "bg-white"}`}>
          {body.trim() ? (
            <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words shadow-sm ${
              isWa ? "bg-white text-surface-900 rounded-tl-sm" : "bg-surface-100 text-surface-900 rounded-tl-sm"
            }`}>
              {body}
              <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-surface-400">
                {time}
                {isWa ? <CheckCheck size={12} className="text-sky-500" /> : <Check size={11} />}
              </span>
            </div>
          ) : (
            <p className="mt-16 text-center text-xs text-surface-400">Your message appears here as you type.</p>
          )}
        </div>
      </div>
    </div>
  );
}
