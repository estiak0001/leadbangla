/* eslint-disable @typescript-eslint/no-explicit-any */
// Leaflet (OpenStreetMap) is loaded from a CDN the first time a map is shown — no API key, nothing to install.
let loading: Promise<any> | null = null;

export function loadLeaflet(): Promise<any> {
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.onload = () => resolve(w.L);
    js.onerror = () => { loading = null; reject(new Error("The map could not be loaded. Check your internet connection.")); };
    document.body.appendChild(js);
  });
  return loading;
}

export interface GeoHit { label: string; lat: number; lng: number; }

/** Place search through OpenStreetMap's Nominatim, biased to Bangladesh. Called only when the user presses Search. */
export async function searchPlaces(query: string): Promise<GeoHit[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=bd&accept-language=en&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Place search is unavailable right now.");
  const rows = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return rows.map((r) => ({ label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }));
}

export const directionsUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
