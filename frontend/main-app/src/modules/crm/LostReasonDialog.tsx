import { useState } from "react";
import Button from "../../components/Button";

const QUICK_REASONS = ["Price too high", "Chose a competitor", "No response", "Not interested", "Out of budget", "Wrong number"];

/** Asked when a lead moves to a "Lost" stage — the reasons feed the CRM report. */
export default function LostReasonDialog({
  name, reasons, onConfirm, onCancel,
}: { name: string; reasons?: string[]; onConfirm: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-4" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-surface-900">Why was {name} lost?</h2>
        <p className="text-sm text-surface-600 mt-1">Pick a reason or type your own. It helps you see what to fix.</p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(reasons ?? QUICK_REASONS).map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${reason === r ? "bg-brand-500 text-white border-brand-500" : "bg-white text-surface-600 border-surface-200 hover:bg-surface-50"}`}>{r}</button>
          ))}
        </div>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus placeholder="Reason (optional)"
          onKeyDown={(e) => { if (e.key === "Enter") onConfirm(reason.trim()); }}
          className="mt-3 w-full border border-surface-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
        <div className="flex justify-end gap-2 mt-5">
          <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={() => onConfirm(reason.trim())}>Mark as lost</Button>
        </div>
      </div>
    </div>
  );
}
