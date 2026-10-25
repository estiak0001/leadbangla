import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, MessageCircle } from "lucide-react";
import { fetchWaSendingFrom, type WaSendingFrom } from "../../../lib/sms";
import OwnMetaAccount from "./OwnMetaAccount";
import Card from "../../../components/Card";
import VerificationPanel from "../VerificationPanel";
import PlanLock from "../PlanLock";
import { useEntitlement } from "../useEntitlement";

export default function SetupTab() {
  const ent = useEntitlement();
  const [mode, setMode] = useState<"ours" | "own">("ours");
  const [from, setFrom] = useState<WaSendingFrom | null>(null);
  useEffect(() => { if (ent?.whatsapp_enabled) fetchWaSendingFrom().then(setFrom).catch(() => undefined); }, [ent?.whatsapp_enabled]);
  return (
    <div className="space-y-4">
      <Card className="!p-4 flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0"><MessageCircle size={20} /></span>
        <div>
          <h2 className="text-sm font-semibold text-surface-900">WhatsApp business number</h2>
          <p className="mt-1 text-sm text-surface-600">
            To message customers on WhatsApp you need an approved business number. Either send from our number, or connect your own Meta account and keep your number. Our team reviews both before they are used.
          </p>
          <p className="mt-1 text-xs text-surface-500">Use a number that is not already registered on a personal WhatsApp account.</p>
        </div>
      </Card>
      {ent && !ent.whatsapp_enabled ? (
        <PlanLock title="WhatsApp isn't in your plan" message="Upgrade to a plan that includes WhatsApp to set up your business number." planName={ent.plan_name} />
      ) : <>
        {from && (
          <div className={`rounded-[4px] border px-4 py-3 text-sm flex items-start gap-2.5 ${from.source === "none" ? "border-warning-base/30 bg-warning-light text-warning-dark" : "border-surface-200 bg-white text-surface-700"}`}>
            {from.source === "none" ? <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> : <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5 text-success-base" />}
            <div>
              <p>{from.message}</p>
              {from.source !== "none" && from.monthly_limit !== 0 && (
                <p className="text-xs text-surface-500 mt-1">
                  This month: {from.used.toLocaleString()} of {from.monthly_limit < 0 ? "unlimited" : from.monthly_limit.toLocaleString()} WhatsApp messages used
                  {from.source === "own" ? "" : " · wallet credits are charged per message"}.
                </p>
              )}
            </div>
          </div>
        )}
        <div className="inline-flex border border-surface-200 rounded-[3px] overflow-hidden bg-white text-sm" role="tablist">
          {([["ours", "Use our number"], ["own", "Use my own Meta account"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`px-3.5 py-1.5 font-medium ${mode === k ? "bg-brand-500 text-white" : "text-surface-600 hover:bg-surface-50"}`}>{l}</button>
          ))}
        </div>
        {mode === "own" ? <OwnMetaAccount /> : <VerificationPanel
        kind="whatsapp_number"
        valueLabel="WhatsApp business number"
        valuePlaceholder="01XXXXXXXXX"
        valueHelp="The mobile number your customers will see messages come from."
        maxLength={20}
      />}
      </>}
    </div>
  );
}
