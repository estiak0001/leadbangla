import { getAccessToken } from "./auth";

export interface OrganizationProfile {
  id: string;
  name: string;
  display_name: string | null;
  language: "bn" | "en";
  phone: string | null;
  website: string | null;
  industry: string | null;
  company_size: string | null;
  contact_email: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  trade_license_no: string | null;
  tin: string | null;
  created_at: string;
  owner_email: string | null;
  my_email: string;
  my_role: "owner" | "admin" | "member" | "sales";
  my_permissions: string[];
  plan_name: string | null;
  member_count: number;
  can_edit: boolean;
}

export type OrganizationProfileUpdate = Partial<
  Pick<OrganizationProfile,
    "name" | "display_name" | "language" | "phone" | "website" | "industry" | "company_size" |
    "contact_email" | "address" | "city" | "country" | "trade_license_no" | "tin">
>;

function headers(): HeadersInit {
  const token = getAccessToken();
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function handle(res: Response): Promise<OrganizationProfile> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const d = body.detail;
    if (Array.isArray(d)) throw new Error(d.map((x: { msg?: string }) => (x.msg ?? "").replace(/^Value error, /, "")).join(" "));
    throw new Error(d ?? "Request failed");
  }
  return res.json();
}

export const fetchOrganizationProfile = async () =>
  handle(await fetch("/api/v1/organization/profile", { headers: headers() }));

export const updateOrganizationProfile = async (data: OrganizationProfileUpdate) =>
  handle(await fetch("/api/v1/organization/profile", { method: "PUT", headers: headers(), body: JSON.stringify(data) }));
