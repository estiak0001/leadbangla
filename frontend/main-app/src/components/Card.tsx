import { ReactNode } from "react";

type CardVariant = "default" | "elevated" | "flat" | "bordered";

const variantClasses: Record<CardVariant, string> = {
  default:  "bg-white border border-surface-200 shadow-sm",
  elevated: "bg-white shadow-md",
  flat:     "bg-surface-100",
  bordered: "bg-white border-2 border-brand-200",
};

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: CardVariant;
  hoverable?: boolean;
  padding?: boolean;
  onClick?: () => void;
}

export default function Card({
  children,
  className = "",
  variant = "default",
  hoverable = false,
  padding = true,
  onClick,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-md ${variantClasses[variant]}
        ${padding ? "p-6" : ""}
        ${hoverable ? "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover hover:border-brand-200" : ""}
        ${className}`}
    >
      {children}
    </div>
  );
}
