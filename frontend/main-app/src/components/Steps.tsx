import { Check } from "lucide-react";

export default function Steps({ step, labels }: { step: number; labels: string[] }) {
  return (
    <ol className="mb-8 flex items-center justify-center gap-1.5 sm:gap-2.5">
      {labels.map((label, i) => {
        const n = i + 1;
        const state = n < step ? "done" : n === step ? "current" : "upcoming";
        return (
          <li key={label} className="flex items-center gap-1.5 sm:gap-2.5">
            <span className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  state === "done" ? "bg-brand-600 text-white" : state === "current" ? "bg-brand-600 text-white" : "bg-surface-200 text-surface-500"
                }`}
              >
                {state === "done" ? <Check size={12} /> : n}
              </span>
              <span className={`hidden text-xs font-medium sm:inline ${state === "upcoming" ? "text-surface-400" : "text-surface-700"}`}>{label}</span>
            </span>
            {n < labels.length && <span className={`h-px w-4 sm:w-8 ${state === "done" ? "bg-brand-400" : "bg-surface-200"}`} />}
          </li>
        );
      })}
    </ol>
  );
}
