import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, HelpCircle, Replace, Trash2 } from "lucide-react";
import Button from "./Button";

type Tone = "default" | "danger" | "warning";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  /** Icon hint: "delete" | "replace" | default question mark. */
  icon?: "delete" | "replace";
}

type Ask = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<Ask | null>(null);

const TONES: Record<Tone, { ring: string; btn: "primary" | "danger" }> = {
  default: { ring: "bg-brand-50 text-brand-600", btn: "primary" },
  warning: { ring: "bg-warning-light text-warning-dark", btn: "primary" },
  danger: { ring: "bg-danger-light text-danger-base", btn: "danger" },
};

let globalAsk: Ask | null = null;

/** Drop-in for window.confirm(text) anywhere (no hook needed). The first
 *  paragraph becomes the title, the rest the explanation. */
export async function confirmText(text: string, confirmLabel?: string): Promise<boolean> {
  if (!globalAsk) return window.confirm(text);
  const [title, ...rest] = text.split("\n\n");
  const danger = /delete|remove|disconnect|trash|permanent/i.test(text);
  return globalAsk({
    title,
    message: rest.length ? <span className="whitespace-pre-line">{rest.join("\n\n")}</span> : undefined,
    tone: danger ? "danger" : "default",
    icon: danger ? "delete" : undefined,
    confirmLabel: confirmLabel ?? (danger ? "Delete" : "Confirm"),
  });
}

/** Replaces the browser's native confirm() with a styled modal.
 *  const confirm = useConfirm(); if (!(await confirm({ title: "…" }))) return; */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((o) => new Promise<boolean>((resolve) => { resolver.current = resolve; setOpts(o); }), []);
  globalAsk = ask;
  const close = (v: boolean) => { resolver.current?.(v); resolver.current = null; setOpts(null); };

  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opts]);

  const tone = TONES[opts?.tone ?? "default"];
  const Icon = opts?.icon === "delete" ? Trash2 : opts?.icon === "replace" ? Replace : opts?.tone === "danger" || opts?.tone === "warning" ? AlertTriangle : HelpCircle;

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {opts && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4 animate-fade-in" onClick={() => close(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3.5">
              <span className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${tone.ring}`}><Icon size={18} /></span>
              <div className="min-w-0">
                <h2 id="confirm-title" className="font-semibold text-surface-900 leading-snug">{opts.title}</h2>
                {opts.message && <div className="mt-1.5 text-sm text-surface-600 leading-relaxed">{opts.message}</div>}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => close(false)}>{opts.cancelLabel ?? "Cancel"}</Button>
              <Button size="sm" variant={tone.btn} autoFocus onClick={() => close(true)}>{opts.confirmLabel ?? "Confirm"}</Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ask {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}
