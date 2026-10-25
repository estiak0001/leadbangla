/** A small dependency-free daily bar chart. `series` values are plain numbers per day. */
export default function DayBars({ days, values, color = "bg-brand-500", format }: {
  days: string[]; values: number[]; color?: string; format: (v: number) => string;
}) {
  const max = Math.max(...values, 0.0001);
  const every = Math.ceil(days.length / 6);
  return (
    <div>
      <div className="flex items-end gap-[2px] h-36">
        {values.map((v, i) => (
          <div key={days[i]} className="group relative flex-1 h-full flex items-end" title={`${days[i]}: ${format(v)}`}>
            <div className={`w-full rounded-t ${v > 0 ? color : "bg-surface-200"} transition-opacity group-hover:opacity-70`} style={{ height: `${v > 0 ? Math.max(4, (v / max) * 100) : 2}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-surface-400">
        {days.map((d, i) => (i % every === 0 ? <span key={d}>{d.slice(5)}</span> : <span key={d} className="hidden" />))}
      </div>
    </div>
  );
}
