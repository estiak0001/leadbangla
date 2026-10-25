export const INDUSTRY_OPTIONS = [
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
export const COMPANY_SIZE_OPTIONS = ["1-10", "11-50", "51-200", "201-500", "500+"];
export const industryLabel = (v: string | null) => INDUSTRY_OPTIONS.find((o) => o.value === v)?.label ?? v ?? "—";
