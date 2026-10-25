import { useState } from "react";

type ToggleSize = "sm" | "md" | "lg";

const trackSizes: Record<ToggleSize, string> = {
  sm: "h-4 w-7",
  md: "h-5 w-9",
  lg: "h-6 w-11",
};

const knobSizes: Record<ToggleSize, { base: string; off: string; on: string }> = {
  sm: { base: "h-3 w-3",   off: "translate-x-0.5", on: "translate-x-3.5" },
  md: { base: "h-3.5 w-3.5", off: "translate-x-0.5", on: "translate-x-[18px]" },
  lg: { base: "h-4 w-4",   off: "translate-x-1",   on: "translate-x-6" },
};

interface ToggleProps {
  value: boolean;
  onChange?: (val: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: ToggleSize;
  className?: string;
}

export default function Toggle({ value, onChange, disabled = false, label, size = "md", className = "" }: ToggleProps) {
  const [busy, setBusy] = useState(false);
  const knob = knobSizes[size];

  async function handleClick() {
    if (disabled || busy || !onChange) return;
    setBusy(true);
    try { await Promise.resolve(onChange(!value)); }
    finally { setBusy(false); }
  }

  return (
    <label className={`inline-flex items-center gap-2 ${disabled || busy ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled || busy}
        onClick={handleClick}
        className={`relative inline-flex flex-shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2
          ${trackSizes[size]}
          ${value ? "bg-brand-500" : "bg-surface-300"}`}
      >
        <span
          className={`inline-block rounded-full bg-white shadow-sm transition-transform duration-200
            ${knob.base}
            ${value ? knob.on : knob.off}`}
        />
      </button>
      {label && <span className="text-sm text-surface-700 select-none">{label}</span>}
    </label>
  );
}
