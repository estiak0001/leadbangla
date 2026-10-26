import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownCircle, ArrowUpCircle, RotateCcw, Wallet } from "lucide-react";
import Alert from "../../components/Alert";
import Card from "../../components/Card";
import DayBars from "../../components/DayBars";
import Spinner from "../../components/Spinner";
import { fetchUsageReport, type UsageReport } from "../../lib/billing";

const money = (n: number) => `৳${n.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const COLORS: Record<string, string> = { sms: "bg-sky-500", whatsapp: "bg-emerald-500", email_overage: "bg-indigo-500", seo_query: "bg-rose-500" };

export default function UsageReportTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    fetchUsageReport(days).then(setData).catch(() => setError("Failed to load the usage report"));
  }, [days]);

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!data) return <div className="py-16 flex justify-center"><Spinner size="lg" /></div>;

  const t = data.totals;
  const totalSpent = Math.max(t.spent_bdt, 0.0001);
  const tiles = [
    { label: "Balance now", value: money(data.balance_bdt), icon: <Wallet size={18} />, tone: "text-brand-700 bg-brand-50" },
    { label: "Added", value: money(t.added_bdt), icon: <ArrowUpCircle size={18} />, tone: "text-success-dark bg-success-light" },
    { label: "Spent", value: money(t.spent_bdt), icon: <ArrowDownCircle size={18} />, tone: "text-warning-dark bg-warning-light" },
    { label: "Refunded", value: money(t.refunded_bdt), icon: <RotateCcw size={18} />, tone: "text-surface-600 bg-surface-100" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-surface-500">Where your wallet balance went — last {days} days.</p>
        <div className="flex gap-1 bg-surface-100 p-0.5 rounded-md">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`px-3 py-1 rounded text-xs font-medium ${days === d ? "bg-white shadow-sm text-surface-900" : "text-surface-600 hover:text-surface-900"}`}>{d} days</button>
          ))}
        </div>
      </div>

      <Card padding={false} className="overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-surface-100">
          {tiles.map((k) => (
            <div key={k.label} className="px-4 py-3 flex items-center gap-3">
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${k.tone}`}>{k.icon}</span>
              <div className="min-w-0"><p className="text-xs text-surface-500">{k.label}</p><p className="text-lg font-bold text-surface-900 tabular-nums leading-tight">{k.value}</p></div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <Card className="lg:col-span-2 !p-4">
          <h2 className="text-sm font-semibold text-surface-700 mb-3">Spending per day</h2>
          <DayBars days={data.by_day.map((d) => d.date)} values={data.by_day.map((d) => d.spent_bdt)} format={money} />
        </Card>

        <Card className="!p-4">
          <h2 className="text-sm font-semibold text-surface-700 mb-3">What you spent on</h2>
          {data.by_service.length === 0 ? <p className="text-sm text-surface-400 py-4 text-center">No spending in this period.</p> : (
            <div className="space-y-3">
              {data.by_service.map((s) => (
                <div key={s.service}>
                  <div className="flex justify-between text-sm"><span className="text-surface-800">{s.label}</span><span className="font-semibold tabular-nums">{money(s.spent_bdt)}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-100 overflow-hidden"><div className={`h-full rounded-full ${COLORS[s.service] ?? "bg-surface-400"}`} style={{ width: `${Math.min(100, (s.spent_bdt / totalSpent) * 100)}%` }} /></div>
                  {s.units > 0 && <p className="mt-0.5 text-[11px] text-surface-400">{s.units.toLocaleString()} {s.service === "email_overage" ? "emails" : s.service === "seo_query" ? "queries" : "messages"}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card padding={false} className="overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-100 flex items-center justify-between"><h2 className="text-sm font-semibold text-surface-700">Costliest campaigns</h2>
          <Link to="/billing?tab=history" className="text-xs font-medium text-brand-600 hover:text-brand-700">All transactions →</Link></div>
        {data.top_campaigns.length === 0 ? <p className="py-5 text-center text-sm text-surface-400">No campaign spending in this period.</p> : (
          <div className="divide-y divide-surface-100">
            {data.top_campaigns.map((c, i) => (
              <div key={`${c.name}-${i}`} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="text-sm font-medium text-surface-900 truncate">{c.name}</p><p className="text-xs text-surface-500">{c.service}</p></div>
                <span className="text-sm font-semibold tabular-nums">{money(c.spent_bdt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
