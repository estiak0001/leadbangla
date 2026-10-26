import { ReactNode } from "react";
import { Link } from "react-router-dom";

export default function SplitAuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel — brand gradient */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden lg:flex"
        style={{ background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)" }}>
        {/* Decorative blobs */}
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/3 h-48 w-48 rounded-full bg-violet-400/20 blur-2xl pointer-events-none" />

        {/* Logo */}
        <div className="relative px-12 pt-10">
          <Link to="/" aria-label="LeadBangla">
            <img src="/logo-white.png" alt="LeadBangla" className="h-9 w-auto" />
          </Link>
        </div>

        {/* Centre content */}
        <div className="relative px-12 pb-12">
          <h2 className="text-3xl font-semibold leading-tight text-white">
            Marketing, built<br />for Bangladesh.
          </h2>
          <p className="mt-4 max-w-sm text-base text-violet-200 leading-relaxed">
            Email, SMS, WhatsApp, and audience tools in one platform — priced in BDT and built around local payment methods from day one.
          </p>
        </div>

        <p className="relative px-12 pb-6 text-xs text-violet-300">© {new Date().getFullYear()} LeadBangla</p>
      </div>

      {/* Right panel — form */}
      <div className="flex w-full flex-col items-center justify-center bg-white px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <Link to="/" aria-label="LeadBangla" className="mb-8 block lg:hidden">
            <img src="/logo.png" alt="LeadBangla" className="mx-auto h-8 w-auto" />
          </Link>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-surface-500">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  );
}
