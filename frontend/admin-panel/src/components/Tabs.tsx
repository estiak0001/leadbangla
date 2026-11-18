export default function Tabs<T extends string>({ tabs, active, onChange }: {
  tabs: { key: T; label: string }[]; active: T; onChange: (key: T) => void;
}) {
  return (
    <div className="mb-5 flex gap-1 border-b border-surface-200 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            active === t.key ? "border-brand-500 text-brand-600" : "border-transparent text-surface-500 hover:text-surface-800"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
