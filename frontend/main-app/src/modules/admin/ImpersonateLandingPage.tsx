import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Spinner from "../../components/Spinner";
import { storeImpersonationAccessToken } from "../../lib/auth";

export default function ImpersonateLandingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get("access_token");
    if (!token) { navigate("/login"); return; }
    storeImpersonationAccessToken(token);
    navigate("/dashboard");
  }, [params, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-surface-500">Starting impersonation session…</p>
      </div>
    </div>
  );
}
