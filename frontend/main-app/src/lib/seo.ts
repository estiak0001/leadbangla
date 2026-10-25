import { throwForFailedResponse } from "./planLimit";
import { getAccessToken } from "./auth";

export interface SeoIssue {
  type: string;
  severity: "critical" | "warning" | "info";
  message: string;
}

export interface SeoPageResult {
  id: string;
  url: string;
  http_status: number;
  title: string;
  title_length: number;
  meta_description: string;
  meta_description_length: number;
  h1_count: number;
  h1_text: string;
  canonical_url: string;
  has_noindex: boolean;
  img_without_alt: number;
  internal_links_count: number;
  broken_links: string[];
  issues: SeoIssue[];
  crawled_at: string;
}

export interface SeoAudit {
  id: string;
  organization_id: string;
  url: string;
  status: "pending" | "running" | "completed" | "failed";
  pages_crawled: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  pages: SeoPageResult[];
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/seo${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) await throwForFailedResponse(res);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const listAudits = () => apiFetch<SeoAudit[]>("/audits");

export const createAudit = (url: string) =>
  apiFetch<SeoAudit>("/audits", { method: "POST", body: JSON.stringify({ url }) });

export const getAudit = (id: string) => apiFetch<SeoAudit>(`/audits/${id}`);

export const deleteAudit = (id: string) => apiFetch<void>(`/audits/${id}`, { method: "DELETE" });

export function issueCounts(page: SeoPageResult): { critical: number; warning: number; info: number } {
  const counts = { critical: 0, warning: 0, info: 0 };
  for (const i of page.issues) {
    counts[i.severity] = (counts[i.severity] ?? 0) + 1;
  }
  return counts;
}

export function auditIssueSummary(audit: SeoAudit) {
  let critical = 0, warning = 0, info = 0;
  for (const p of audit.pages) {
    const c = issueCounts(p);
    critical += c.critical;
    warning += c.warning;
    info += c.info;
  }
  return { critical, warning, info };
}
