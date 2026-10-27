import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { COMPANY_LOGO_URL } from "../lib/branding";
import Card from "./Card";

export default function AuthLayout({
  title,
  children,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 px-4 py-12">
      <div className={wide ? "w-full max-w-2xl" : "w-full max-w-sm"}>
        <Link to="/" aria-label="LeadBangla" className="mb-6 block">
          <img src={COMPANY_LOGO_URL} alt="LeadBangla" className="mx-auto h-9 w-auto" />
        </Link>
        <Card>
          <h1 className="mb-4 text-lg font-semibold text-surface-900">{title}</h1>
          {children}
        </Card>
      </div>
    </div>
  );
}
