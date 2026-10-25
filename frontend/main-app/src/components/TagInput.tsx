import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

interface TagInputProps {
  label?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  helperText?: string;
  /** Fired when a tag is added that doesn't match any suggestion — lets the
   * caller persist it (e.g. as a reusable preset) instead of a one-off value. */
  onCreateNew?: (tag: string) => void;
}

export default function TagInput({
  label, value, onChange, suggestions = [], placeholder = "Type to search or create a tag", helperText, onCreateNew,
}: TagInputProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const available = suggestions.filter(
    (s) => !value.includes(s) && (!normalizedQuery || s.toLowerCase().includes(normalizedQuery))
  );
  const exactMatch = suggestions.some((s) => s.toLowerCase() === normalizedQuery);

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || value.includes(trimmed)) return;
    const isNew = !suggestions.some((s) => s.toLowerCase() === trimmed.toLowerCase());
    onChange([...value, trimmed]);
    setQuery("");
    if (isNew) onCreateNew?.(trimmed);
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (query.trim()) addTag(query);
    } else if (e.key === "Backspace" && !query && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  }

  return (
    <div className="space-y-1.5" ref={rootRef}>
      {label && <label className="block text-sm font-medium text-surface-700">{label}</label>}
      <div className="relative">
        <div
          className="flex flex-wrap items-center gap-1.5 rounded border border-surface-200 bg-white px-2 py-1.5
            focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 transition-colors"
          onClick={() => setOpen(true)}
        >
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium px-2 py-0.5"
            >
              {tag}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                className="hover:text-brand-900"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            className="flex-1 min-w-[100px] text-sm text-surface-800 placeholder:text-surface-400 focus:outline-none py-0.5"
            value={query}
            placeholder={value.length === 0 ? placeholder : ""}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {open && (available.length > 0 || (normalizedQuery && !exactMatch)) && (
          <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-surface-200 bg-white shadow-lg">
            {available.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className="block w-full text-left px-3 py-1.5 text-sm text-surface-700 hover:bg-surface-50"
              >
                {tag}
              </button>
            ))}
            {normalizedQuery && !exactMatch && (
              <button
                type="button"
                onClick={() => addTag(query)}
                className="flex w-full items-center gap-1.5 text-left px-3 py-1.5 text-sm text-brand-600 hover:bg-brand-50 border-t border-surface-100"
              >
                <Plus size={13} /> Create tag "{query.trim()}"
              </button>
            )}
          </div>
        )}
      </div>
      {helperText && <p className="text-xs text-surface-400">{helperText}</p>}
    </div>
  );
}
