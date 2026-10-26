import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PauseCircle } from "lucide-react";
import AppLayout from "./AppLayout";
import Spinner from "./Spinner";
import { useFeatures } from "../lib/features";

/** Shows its page only while the platform has this service switched on. */
export default function FeatureOnly({ feature, children }: { feature: string; children: ReactNode }) {
  const { on, ready } = useFeatures();
  if (!ready) return <div className="flex h-screen items-center justify-center"><Spinner size="lg" /></div>;
  if (on(feature)) return <>{children}</>;
  return (
    <AppLayout>
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-surface-200 bg-white p-8 text-center">
        <PauseCircle size={28} className="mx-auto mb-3 text-surface-300" />
        <h1 className="text-base font-semibold text-surface-900">This service isn't available right now</h1>
        <p className="mt-1 text-sm text-surface-600">It's switched off for the moment. Everything else keeps working as usual.</p>
        <Link to="/dashboard" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">Back to dashboard</Link>
      </div>
    </AppLayout>
  );
}
