import { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

type AlertVariant = "error" | "warning" | "success" | "info";

const styles: Record<AlertVariant, { wrap: string; icon: ReactNode }> = {
  error:   { wrap: "bg-danger-light border-danger-base/30 text-danger-dark",   icon: <AlertCircle size={16} className="flex-shrink-0 text-danger-base" /> },
  warning: { wrap: "bg-warning-light border-warning-base/30 text-warning-dark", icon: <TriangleAlert size={16} className="flex-shrink-0 text-warning-base" /> },
  success: { wrap: "bg-success-light border-success-base/30 text-success-dark", icon: <CheckCircle2 size={16} className="flex-shrink-0 text-success-base" /> },
  info:    { wrap: "bg-info-light border-info-base/30 text-info-dark",          icon: <Info size={16} className="flex-shrink-0 text-info-base" /> },
};

interface AlertProps {
  variant?: AlertVariant;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export default function Alert({ variant = "error", children, onDismiss, className = "" }: AlertProps) {
  const s = styles[variant];
  return (
    <div role="alert" className={`flex items-start gap-3 rounded border px-4 py-3 text-sm animate-slide-up ${s.wrap} ${className}`}>
      {s.icon}
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
