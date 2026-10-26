import { ButtonHTMLAttributes, ReactNode } from "react";
import Spinner from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "xs" | "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:   "bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white shadow-sm",
  secondary: "bg-white hover:bg-surface-50 active:bg-surface-100 text-surface-700 border border-surface-200 shadow-sm",
  ghost:     "bg-transparent hover:bg-surface-100 active:bg-surface-200 text-surface-600",
  danger:    "bg-danger-base hover:bg-danger-dark text-white shadow-sm",
  success:   "bg-success-base hover:bg-success-dark text-white shadow-sm",
};

const sizeClasses: Record<Size, string> = {
  xs: "px-2 py-1 text-xs rounded-sm gap-1",
  sm: "px-2.5 py-1.5 text-sm rounded gap-1.5",
  md: "px-3.5 py-2 text-sm rounded gap-2",
  lg: "px-4 py-2.5 text-base rounded-md gap-2",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium tracking-tight transition-all duration-150
        disabled:cursor-not-allowed disabled:opacity-50
        ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <Spinner size="sm" className="border-current border-t-transparent" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
