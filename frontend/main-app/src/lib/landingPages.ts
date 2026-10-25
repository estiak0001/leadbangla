import { getAccessToken } from "./auth";
import { throwForFailedResponse } from "./planLimit";

export type BlockType = "hero" | "text" | "form";

export interface HeroBlock {
  type: "hero";
  heading: string;
  subheading: string;
}

export interface TextBlock {
  type: "text";
  content: string;
}

export interface FormField {
  id: string;
  name: string;
  label: string;
  field_type: "text" | "email" | "tel" | "textarea";
  required: boolean;
}

export interface FormBlock {
  type: "form";
  fields: FormField[];
  submit_label: string;
  success_message: string;
  auto_tags: string[];
}

export type Block = HeroBlock | TextBlock | FormBlock;

export interface LandingPage {
  id: string;
  slug: string;
  title: string;
  blocks: Block[];
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  submission_count: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    return throwForFailedResponse(res);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function publicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/public${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const fetchLandingPages = () => apiFetch<LandingPage[]>("/landing-pages");

export const createLandingPage = (title: string, blocks: Block[]) =>
  apiFetch<LandingPage>("/landing-pages", {
    method: "POST",
    body: JSON.stringify({ title, blocks }),
  });

export const getLandingPage = (id: string) => apiFetch<LandingPage>(`/landing-pages/${id}`);

export const updateLandingPage = (
  id: string,
  data: { title?: string; blocks?: Block[]; is_published?: boolean }
) =>
  apiFetch<LandingPage>(`/landing-pages/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const deleteLandingPage = (id: string) =>
  apiFetch<void>(`/landing-pages/${id}`, { method: "DELETE" });

// Public endpoints (no auth token needed)

export interface PublicPage {
  title: string;
  slug: string;
  blocks: Block[];
}

export const getPublicPage = (slug: string) =>
  publicFetch<PublicPage>(`/landing-pages/${slug}`);

export const submitPublicForm = (slug: string, fields: Record<string, string>) =>
  publicFetch<{ success: boolean; message: string }>(`/landing-pages/${slug}/submit`, {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
