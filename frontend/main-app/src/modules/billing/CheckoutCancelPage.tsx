import { Link, useSearchParams } from "react-router-dom";
import AuthLayout from "../../components/AuthLayout";
import Button from "../../components/Button";

export default function CheckoutCancelPage() {
  const [params] = useSearchParams();
  const status = params.get("status") ?? "cancelled";

  return (
    <AuthLayout title={`Checkout ${status}`}>
      <p className="text-sm text-surface-600 mb-4">No payment was completed. You can try again.</p>
      <Link to="/pick-plan" className="block">
        <Button className="w-full">Back to plans</Button>
      </Link>
    </AuthLayout>
  );
}
