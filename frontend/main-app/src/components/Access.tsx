import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Lock } from "lucide-react";
import AppLayout from "./AppLayout";
import Spinner from "./Spinner";
import { firstAllowedRoute, useMe } from "../lib/permissions";

/** Page guard. `redirect` sends people without access to their first allowed page (used for the dashboard). */
export default function Access({ perm, redirect = false, children }: { perm: string; redirect?: boolean; children: ReactNode }) {
  const { can, loading } = useMe();
  // Wait for the profile before rendering, so a page the person can't use never fires its API calls.
  if (loading) return <div className="flex h-screen items-center justify-center"><Spinner size="lg" /></div>;
  if (can(perm)) return <>{children}</>;
  if (redirect) return <Navigate to={firstAllowedRoute(can)} replace />;
  return (
    <AppLayout>
      <div className="max-w-md mx-auto mt-16 text-center bg-white border border-surface-200 rounded-lg p-5">
        <Lock size={28} className="mx-auto text-surface-300 mb-3" />
        <h1 className="text-base font-semibold text-surface-900">You don’t have access to this page</h1>
        <p className="text-sm text-surface-600 mt-1">Ask your company owner or admin to turn it on for you (Team → your name → Access).</p>
      </div>
    </AppLayout>
  );
}
