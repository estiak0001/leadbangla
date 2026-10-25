import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import Button from "../../components/Button";
import Card from "../../components/Card";

/** Shown instead of a feature the customer's plan doesn't include. */
export default function PlanLock({ title, message, planName }: { title: string; message: string; planName?: string | null }) {
  return (
    <Card className="!py-10 text-center max-w-xl mx-auto">
      <span className="mx-auto w-12 h-12 rounded-full bg-warning-light text-warning-dark flex items-center justify-center"><Lock size={22} /></span>
      <h2 className="mt-3 text-base font-semibold text-surface-900">{title}</h2>
      <p className="mt-1.5 text-sm text-surface-600">{message}</p>
      {planName && <p className="mt-1 text-xs text-surface-400">Your plan: {planName}</p>}
      <Link to="/billing?tab=plan" className="inline-block mt-4"><Button size="sm">See plans &amp; upgrade</Button></Link>
    </Card>
  );
}
