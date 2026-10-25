import { ReactNode } from "react";

/** Save / Cancel bar that stays at the bottom of the page content (above the phone tab bar), aligned with the content — not floating over the sidebar. */
export default function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] lg:bottom-0 z-20 -mx-3 sm:-mx-5 lg:-mx-6 -mb-24 mt-6 px-3 sm:px-5 lg:px-6 py-2.5 border-t border-surface-200 bg-white/95 backdrop-blur flex items-center gap-2">
      {children}
    </div>
  );
}
