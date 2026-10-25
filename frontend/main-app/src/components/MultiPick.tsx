import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { optLabel, optValue } from "../lib/segments";
import type { FieldOption } from "../lib/segments";

/** Pick several values from a list (search + tick). Shows a one-line summary when closed. */
export default function MultiPick({ options, value, onChange, placeholder = "Choose…" }: {
  options: (string | FieldOption)[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const shown = useMemo(() => options.filter((o) => optLabel(o).toLowerCase().includes(q.trim().toLowerCase())), [options, q]);
  const label = (v: string) => { const o = options.find((x) => optValue(x) === v); return o ? optLabel(o) : v; };
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 border border-surface-200 rounded-sm px-2.5 py-2 text-sm bg-white text-left hover:border-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
        <span className={`truncate ${value.length ? "text-surface-900" : "text-surface-400"}`}>{value.length ? value.map(label).join(", ") : placeholder}</span>
        <span className="flex items-center gap-1.5 flex-shrink-0">{value.length > 0 && <span className="text-[11px] bg-brand-50 text-brand-700 rounded-full px-1.5">{value.length}</span>}<ChevronDown size={14} className="text-surface-400" /></span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[14rem] bg-white border border-surface-200 rounded-sm shadow-xl overflow-hidden">
          {options.length > 8 && (
            <div className="relative border-b border-surface-100"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full pl-8 pr-2 py-2 text-sm focus:outline-none" /></div>
          )}
          <ul className="max-h-56 overflow-y-auto py-1">
            {shown.map((o) => {
              const v = optValue(o); const on = value.includes(v);
              return <li key={v}><label className="flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-surface-50"><input type="checkbox" className="h-4 w-4" checked={on} onChange={() => toggle(v)} />{optLabel(o)}</label></li>;
            })}
            {shown.length === 0 && <li className="px-3 py-3 text-sm text-surface-500">Nothing matches.</li>}
          </ul>
          {value.length > 0 && <button type="button" onClick={() => onChange([])} className="w-full text-left px-3 py-2 text-xs text-brand-600 border-t border-surface-100 hover:bg-surface-50">Clear selection</button>}
        </div>
      )}
    </div>
  );
}
