import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "./auth";

export type PlaceKind = "division" | "district" | "area";
export interface Place {
  id: string; kind: PlaceKind; name: string; name_bn: string | null; parent_id: string | null; parent_name: string | null;
  division: string | null; latitude: number | null; longitude: number | null; contacts: number;
}
export interface PlaceInput { kind: PlaceKind; name: string; name_bn?: string | null; parent_id?: string | null; latitude?: number | null; longitude?: number | null; }
export interface AreaImportResult { created: number; skipped: number; errors: { row: number; reason: string; value: string }[]; }

async function api<T>(path = "", init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(`/api/v1/locations${path}`, {
    ...init,
    headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), Authorization: `Bearer ${getAccessToken()}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const fetchLocations = () => api<{ items: Place[] }>().then((r) => r.items);
export const createLocation = (d: PlaceInput) => api<Place>("", { method: "POST", body: JSON.stringify(d) });
export const updateLocation = (id: string, d: PlaceInput) => api<Place>(`/${id}`, { method: "PUT", body: JSON.stringify(d) });
export const deleteLocation = (id: string) => api<{ contacts_still_using: number }>(`/${id}`, { method: "DELETE" });
export const restoreLocations = () => api<{ added: number }>("/restore-defaults", { method: "POST" });
export const importAreas = (file: File) => { const fd = new FormData(); fd.append("file", file); return api<AreaImportResult>("/import-areas", { method: "POST", body: fd }); };

/** The company's places, for dropdowns. */
export function useLocations() {
  const [items, setItems] = useState<Place[]>([]);
  const reload = useCallback(() => { fetchLocations().then(setItems).catch(() => undefined); }, []);
  useEffect(reload, [reload]);
  return {
    items, reload,
    divisions: items.filter((p) => p.kind === "division"),
    districts: items.filter((p) => p.kind === "district"),
    areas: items.filter((p) => p.kind === "area"),
  };
}
export type Locations = ReturnType<typeof useLocations>;

/** "Gulshan, Dhaka, Dhaka" style line from whichever parts are known. */
export const placeLine = (c: { area?: string | null; district?: string | null; division?: string | null }) =>
  [c.area, c.district, c.division && c.division !== c.district ? c.division : null].filter(Boolean).join(", ");
