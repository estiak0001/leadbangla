/** Dependency-free stacked daily bars. One colour per series, hover for the exact numbers. */
export interface Series { key: string; label: string; color: string; }

export default function StackBars({ days, rows, series, height = 144 }: { days: string[]; rows: Record<string, number>[]; series: Series[]; height?: number }) {
  const totals = rows.map((r) => series.reduce((n, s) => n + (r[s.key] ?? 0), 0));
  const max = Math.max(...totals, 1);
  const every = Math.ceil(days.length / 7);
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {rows.map((r, i) => {
          const tip = `${days[i]} — ${series.filter((s) => (r[s.key] ?? 0) > 0).map((s) => `${s.label} ${r[s.key]}`).join(", ") || "nothing"}`;
          return (
            <div key={days[i]} title={tip} className="group flex-1 h-full flex flex-col justify-end">
              {totals[i] === 0 ? <div className="w-full bg-surface-200" style={{ height: 2 }} /> : (
                <div className="w-full flex flex-col-reverse transition-opacity group-hover:opacity-75" style={{ height: `${Math.max(6, (totals[i] / max) * 100)}%` }}>
                  {series.map((s) => (r[s.key] ?? 0) > 0 ? <div key={s.key} style={{ flex: r[s.key], backgroundColor: s.color }} /> : null)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-surface-400">{days.map((d, i) => (i % every === 0 ? <span key={d}>{d.slice(5)}</span> : <span key={d} className="hidden" />))}</div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-surface-600"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: s.color }} />{s.label}</span>)}
      </div>
    </div>
  );
}
