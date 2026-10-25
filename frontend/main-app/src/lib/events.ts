import { getAccessToken } from "./auth";

export interface MarketingEvent {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  event_date: string;
  location: string | null;
  capacity: number | null;
  workflow_id: string | null;
  created_at: string;
  registration_count: number;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  contact_id: string;
  registered_at: string;
  attended: boolean;
  attended_at: string | null;
  contact_name: string | null;
  contact_email: string | null;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/events${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const listEvents = () => apiFetch<MarketingEvent[]>("");
export const createEvent = (data: {
  title: string;
  description?: string;
  event_date: string;
  location?: string;
  capacity?: number | null;
  workflow_id?: string | null;
}) => apiFetch<MarketingEvent>("", { method: "POST", body: JSON.stringify(data) });
export const deleteEvent = (id: string) =>
  apiFetch<void>(`/${id}`, { method: "DELETE" });

export const listRegistrations = (eventId: string) =>
  apiFetch<EventRegistration[]>(`/${eventId}/registrations`);
export const registerContact = (eventId: string, contactId: string) =>
  apiFetch<EventRegistration>(`/${eventId}/registrations`, {
    method: "POST",
    body: JSON.stringify({ contact_id: contactId }),
  });
export const markAttended = (eventId: string, registrationId: string) =>
  apiFetch<EventRegistration>(
    `/${eventId}/registrations/${registrationId}/attend`,
    { method: "PATCH", body: "{}" }
  );
