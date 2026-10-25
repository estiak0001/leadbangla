import { useEffect, useState } from "react";
import { MessageSquare, ShieldCheck } from "lucide-react";
import Badge from "../../../components/Badge";
import Card from "../../../components/Card";
import { fetchSmsSettings, type OrgSmsSettings } from "../../../lib/sms";
import VerificationPanel from "../../messaging/VerificationPanel";
import PlanLock from "../../messaging/PlanLock";
import { useEntitlement } from "../../messaging/useEntitlement";

export default function SenderIdTab() {
  const [settings, setSettings] = useState<OrgSmsSettings | null>(null);
  const ent = useEntitlement();
  const load = () => fetchSmsSettings().then(setSettings).catch(() => undefined);
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <Card className={`!p-4 ${settings && !settings.approved ? "border-sky-300 ring-2 ring-sky-100" : ""}`}>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold text-surface-900 flex items-center gap-2"><MessageSquare size={16} className="text-sky-600" /> Shared sender <span className="text-xs font-normal text-surface-500">(default)</span></h2>
            {settings && !settings.approved && <Badge variant="success" size="sm" dot>In use</Badge>}
          </div>
          <p className="mt-1.5 text-sm text-surface-600">Ready now. Your SMS go out from our approved shared sender name — no documents, no setup fee. A good choice to start with.</p>
        </Card>
        <Card className={`!p-4 ${settings?.approved ? "border-emerald-300 ring-2 ring-emerald-100" : ""}`}>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold text-surface-900 flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-600" /> Your own brand name <span className="text-xs font-normal text-surface-500">(masking)</span></h2>
            {settings?.approved && <Badge variant="success" size="sm" dot>In use</Badge>}
          </div>
          <p className="mt-1.5 text-sm text-surface-600">
            {settings?.approved
              ? <>Customers see <span className="font-mono font-semibold">{settings.sms_sender_id}</span> as the sender.</>
              : "Customers see your business name instead of a number. Needs documents and approval — usually a few working days."}
          </p>
          {!settings?.approved && settings && settings.setup_fee_bdt > 0 && <p className="mt-1 text-xs text-surface-500">One-time setup fee ৳{settings.setup_fee_bdt.toFixed(2)}.</p>}
        </Card>
      </div>

      {ent && !ent.masking_allowed ? (
        <PlanLock title="A masking Sender ID isn't in your plan" message="Upgrade to a plan that includes a masking Sender ID so customers see your brand name instead of a number." planName={ent.plan_name} />
      ) : <VerificationPanel
        kind="sms_sender_id"
        valueLabel="Sender ID"
        valuePlaceholder={settings?.suggested_sender_id ?? "YourBrand"}
        valueHelp="Letters and numbers only, up to 11–20 characters — usually your brand name."
        formNote={settings && settings.setup_fee_bdt > 0 ? `A one-time setup fee of ৳${settings.setup_fee_bdt.toFixed(2)} is taken from your wallet when you submit.` : undefined}
        onChange={load}
      />}
    </div>
  );
}
