import { ReactNode } from "react";

type BadgeVariant = "default" | "primary" | "success" | "warning" | "danger" | "info";
type BadgeSize = "sm" | "md" | "lg";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-surface-100 text-surface-600",
  primary: "bg-brand-100 text-brand-700",
  success: "bg-success-light text-success-dark",
  warning: "bg-warning-light text-warning-dark",
  danger:  "bg-danger-light text-danger-dark",
  info:    "bg-info-light text-info-dark",
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: "text-xs px-1.5 py-0.5 rounded-sm",
  md: "text-xs px-2 py-0.5 rounded",
  lg: "text-sm px-2.5 py-1 rounded",
};

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  className?: string;
}

const dotColors: Record<BadgeVariant, string> = {
  default: "bg-surface-400",
  primary: "bg-brand-500",
  success: "bg-success-base",
  warning: "bg-warning-base",
  danger:  "bg-danger-base",
  info:    "bg-info-base",
};

export default function Badge({
  children,
  variant = "default",
  size = "md",
  dot = false,
  className = "",
}: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}>
      {dot && <span className={`status-dot ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}
