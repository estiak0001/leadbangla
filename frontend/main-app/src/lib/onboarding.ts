import { getAccessToken } from "./auth";

export type Industry =
  | "ecommerce_retail"
  | "saas_technology"
  | "education"
  | "healthcare"
  | "real_estate"
  | "finance_banking"
  | "agency_marketing"
  | "manufacturing"
  | "other";

export type CompanySize = "1-10" | "11-50" | "51-200" | "201-500" | "500+";

export const INDUSTRY_OPTIONS: { value: Industry; label: string }[] = [
  { value: "ecommerce_retail", label: "E-commerce & Retail" },
  { value: "saas_technology", label: "SaaS / Technology" },
  { value: "education", label: "Education" },
  { value: "healthcare", label: "Healthcare" },
  { value: "real_estate", label: "Real Estate" },
  { value: "finance_banking", label: "Finance & Banking" },
  { value: "agency_marketing", label: "Agency / Marketing" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "other", label: "Other" },
];

export const COMPANY_SIZE_OPTIONS: CompanySize[] = ["1-10", "11-50", "51-200", "201-500", "500+"];

export interface Organization {
  id: string;
  name: string;
  language: "bn" | "en";
  phone: string | null;
  website: string | null;
  industry: string | null;
  company_size: string | null;
}

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function checkOnboardingGate(): Promise<boolean> {
  const res = await fetch("/api/v1/onboarding/gate", { headers: authHeaders() });
  return res.ok;
}

export async function fetchMyOrganization(): Promise<Organization | null> {
  const res = await fetch("/api/v1/onboarding/me", { headers: authHeaders() });
  if (!res.ok) {
    throw new Error("Failed to load organization");
  }
  const body = await res.json();
  return body ?? null;
}

// Business-profile fields (org name, phone, industry, etc.) are collected at
// signup now (see lib/auth.ts's SignupInput) — completing onboarding just
// asks the backend to build the Organization from what's already on file,
// once an active subscription is in place.
export async function completeOnboarding(): Promise<Organization> {
  const res = await fetch("/api/v1/onboarding/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? "Failed to complete onboarding");
  }
  return res.json();
}
