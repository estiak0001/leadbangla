import { CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import Card from "../components/Card";

const STEPS = [
  ["Customer applies", "On their SMS → Sender ID tab they enter the name they want and upload their documents."],
  ["You review", "Open the request under Requests. Check the documents are clear and match the business."],
  ["Send to the provider", "Download the documents as a ZIP and send them to your SMS provider (Alpha SMS or SSL Wireless, whichever you use) to register the Sender ID with them. Click “Mark as submitted” and note their ticket number."],
  ["Provider confirms", "This usually takes a few working days. The customer sees “With the operator” meanwhile."],
  ["Approve", "When the provider confirms, click Approve. The Sender ID is active for that customer straight away."],
];

export default function MaskingGuideTab() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      <Card className="lg:col-span-2 !p-4">
        <h2 className="text-sm font-semibold text-surface-800 flex items-center gap-2 mb-4"><ShieldCheck size={16} className="text-brand-600" /> How a masking Sender ID is processed</h2>
        <ol className="space-y-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="flex gap-3.5">
              <span className="w-7 h-7 rounded-full bg-brand-50 text-brand-700 text-sm font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
              <div><p className="text-sm font-semibold text-surface-900">{title}</p><p className="text-sm text-surface-600">{body}</p></div>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs text-surface-500 rounded-md bg-surface-50 px-3 py-2">Customers who don't want a masking ID don't need to do anything — they send from the shared sender straight away.</p>
      </Card>

      <div className="space-y-4">
        <Card className="!p-4">
          <h2 className="text-sm font-semibold text-surface-800 flex items-center gap-2 mb-2"><FileText size={15} className="text-brand-600" /> What customers must provide</h2>
          <ul className="text-sm text-surface-700 space-y-2">
            {[["National ID (NID)", "owner or authorised person, front and back"], ["Trade license", "valid and current"], ["…or institutional authorization letter", "schools, colleges, universities — signed by the head, with seal"], ["Official application form", "on letterhead, with seal and signature"]].map(([a, b]) => (
              <li key={a} className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 text-success-base flex-shrink-0" /><span><b className="font-medium">{a}</b><span className="block text-xs text-surface-500">{b}</span></span></li>
            ))}
          </ul>
        </Card>
        <Card className="!p-4 bg-surface-50">
          <h2 className="text-sm font-semibold text-surface-800 mb-2">Good to know</h2>
          <ul className="text-xs text-surface-600 space-y-1.5 list-disc pl-4">
            <li>A customer's plan must allow masking before they can request one (Plans &amp; Rates).</li>
            <li>The setup fee is a credit rate you control under Plans &amp; Rates → Credit Rates.</li>
            <li>You can also assign an ID directly under Sender IDs, without a request.</li>
            <li>Removing an ID sends that customer back to the shared sender.</li>
            <li>A Sender ID is registered with one provider. If you switch on both Alpha SMS and SSL Wireless, messages go through Alpha first and fall back to SSL Wireless (using its default sender) if Alpha fails.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
