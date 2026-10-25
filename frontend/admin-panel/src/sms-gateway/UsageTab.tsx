import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Send, Wallet, XCircle } from "lucide-react";
import Alert from "../components/Alert";
import Card from "../components/Card";
import DayBars from "../components/DayBars";
import Spinner from "../components/Spinner";
import { fetchSmsUsage, type SmsUsage } from "../lib/smsGateway";

const money = (n: number) => `৳${n.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Gateway balance and who is using how much SMS. */
export default function UsageTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<SmsUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => { setData(null); fetchSmsUsage(days).then(setData).catch(() => setError("Failed to load the usage report")); };
  useEffect(load, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <div className="py-16 flex justify-center"><Spinner size="lg" /></div>;

  const t = data.totals;
  const maxSent = Math.max(...data.by_tenant.map((x) => x.sent), 1);
  const lowBalance = data.gateway_balance !== null && data.gateway_balance < 100;
  const tiles = [
    { label: "Gateway balance (Alpha SMS)", value: data.gateway_balance !== null ? data.gateway_balance.toLocaleString("en-BD", { minimumFractionDigits: 2 }) : "—", icon: <Wallet size={18} />, tone: lowBalance ? "text-danger-dark bg-danger-light" : "text-brand-700 bg-brand-50", sub: data.gateway_balance_error ?? (data.gateway_balance === null ? "Save the Alpha SMS key to see it" : lowBalance ? "Running low — top up with Alpha SMS" : "Live from your Alpha SMS account") },
    { label: "SMS sent", value: t.sent.toLocaleString(), icon: <Send size={18} />, tone: "text-sky-700 bg-sky-50", sub: `last ${days} days` },
    { label: "Failed", value: t.failed.toLocaleString(), icon: <XCircle size={18} />, tone: t.failed ? "text-danger-dark bg-danger-light" : "text-surface-500 bg-surface-100", sub: t.success_rate !== null ? `${t.success_rate}% delivered` : "no sends yet" },
    { label: "Paid by customers", value: money(t.customer_spend_bdt), icon: <CheckCircle2 size={18} />, tone: "text-success-dark bg-success-light", sub: "SMS charges, after refunds" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-surface-500">SMS volume across all customers, and your gateway balance.</p>
        <div className="flex gap-1 bg-surface-100 p-0.5 rounded-md">
          {[7, 30, 90].map((d) => <button key={d} onClick={() => setDays(d)} className={`px-3 py-1 rounded text-xs font-medium ${days === d ? "bg-white shadow-sm text-surface-900" : "text-surface-600 hover:text-surface-900"}`}>{d} days</button>)}
        </div>
      </div>

      {lowBalance && <Alert variant="warning"><span className="inline-flex items-center gap-1.5"><AlertTriangle size={14} /> Your Alpha SMS balance is low. When it runs out, customers' SMS will fail (and be refunded to them).</span></Alert>}

      <Card padding={false} className="overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-surface-100">
          {tiles.map((k) => (
            <div key={k.label} className="px-4 py-3 flex items-center gap-3">
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${k.tone}`}>{k.icon}</span>
              <div className="min-w-0"><p className="text-xs text-surface-500 truncate">{k.label}</p><p className="text-lg font-bold text-surface-900 tabular-nums leading-tight">{k.value}</p><p className="text-[11px] text-surface-400 truncate">{k.sub}</p></div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="!p-4">
        <h2 className="text-sm font-semibold text-surface-700 mb-3">SMS sent per day</h2>
        <DayBars days={data.by_day.map((d) => d.date)} values={data.by_day.map((d) => d.sent)} color="bg-sky-500" format={(v) => `${v} SMS`} />
      </Card>

      <Card padding={false} className="overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-100"><h2 className="text-sm font-semibold text-surface-700">Usage by company</h2></div>
        {data.by_tenant.length === 0 ? <p className="py-10 text-center text-sm text-surface-400">No SMS were sent in this period.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-surface-50 border-b border-surface-200"><tr>{["Company", "Sent", "Failed", "Paid"].map((h, i) => <th key={h} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-surface-400 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-surface-100">
              {data.by_tenant.map((r) => (
                <tr key={r.org_id} className="hover:bg-surface-50">
                  <td className="px-4 py-2.5"><p className="font-medium text-surface-900">{r.name}</p><div className="mt-1 h-1 w-40 max-w-full rounded-full bg-surface-100 overflow-hidden"><div className="h-full bg-sky-500 rounded-full" style={{ width: `${(r.sent / maxSent) * 100}%` }} /></div></td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{r.sent.toLocaleString()}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${r.failed ? "text-danger-dark" : "text-surface-400"}`}>{r.failed.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(r.spend_bdt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
