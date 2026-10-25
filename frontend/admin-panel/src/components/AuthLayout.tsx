import { ReactNode } from "react";

// Deliberately dark/technical, distinct from the main app's bright,
// consumer-facing split-screen login — this is the internal tool's "front
// door," not a marketing surface.
export default function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/logo-white.png" alt="LeadBangla" className="mx-auto h-9 w-auto" />
          <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-emerald-400">
            Internal Admin
          </p>
        </div>
        <div className="rounded-md border border-slate-700 bg-slate-800 p-6 shadow-xl shadow-black/30">
          <h1 className="mb-4 text-lg font-semibold text-white">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
