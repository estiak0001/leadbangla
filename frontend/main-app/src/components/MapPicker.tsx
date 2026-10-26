/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { ExternalLink, LocateFixed, MapPin, Navigation, Search, X } from "lucide-react";
import { directionsUrl, loadLeaflet, searchPlaces, type GeoHit } from "../lib/leaflet";
import { mapsUrl, parseMapText } from "../lib/geo";

const PIN = `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg"><path d="M15 0C6.7 0 0 6.6 0 14.8 0 26 15 40 15 40s15-14 15-25.2C30 6.6 23.3 0 15 0z" fill="#6366f1"/><circle cx="15" cy="14.5" r="5.5" fill="#fff"/></svg>`;

export interface MapHint { lat: number; lng: number; zoom: number; }

/** A map with one pin. Editable: click the map or drag the pin, search a place, paste a Google Maps link or use this device's
 *  location. Read-only: just shows the pin with "Open in Google Maps" and "Directions". */
export default function MapPicker({ lat, lng, onChange, hint, readOnly = false, height = 340 }: {
  lat: number | null; lng: number | null; onChange?: (lat: number, lng: number) => void; hint?: MapHint | null; readOnly?: boolean; height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const marker = useRef<any>(null);
  const LRef = useRef<any>(null);
  const own = useRef(false);               // a change that came from the map itself (don't re-centre on it)
  const cb = useRef(onChange); cb.current = onChange;
  const [error, setError] = useState("");
  const [q, setQ] = useState(""); const [hits, setHits] = useState<GeoHit[] | null>(null); const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState(""); const [msg, setMsg] = useState("");
  const has = lat != null && lng != null;

  const setPin = (L: any, la: number, lo: number) => {
    if (!marker.current) {
      marker.current = L.marker([la, lo], { draggable: !readOnly, icon: L.divIcon({ html: PIN, className: "", iconSize: [30, 40], iconAnchor: [15, 40] }) }).addTo(map.current);
      if (!readOnly) marker.current.on("dragend", () => { const p = marker.current.getLatLng(); own.current = true; cb.current?.(+p.lat.toFixed(6), +p.lng.toFixed(6)); });
    } else marker.current.setLatLng([la, lo]);
  };

  // create the map once
  useEffect(() => {
    let dead = false;
    loadLeaflet().then((L) => {
      if (dead || !el.current || map.current) return;
      LRef.current = L;
      const start = has ? [lat!, lng!] : hint ? [hint.lat, hint.lng] : [23.8103, 90.4125];
      map.current = L.map(el.current, { zoomControl: true, scrollWheelZoom: !readOnly ? true : false }).setView(start, has ? 17 : hint?.zoom ?? 7);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map.current);
      if (has) setPin(L, lat!, lng!);
      if (!readOnly) map.current.on("click", (e: any) => { own.current = true; setPin(L, e.latlng.lat, e.latlng.lng); cb.current?.(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)); });
      setTimeout(() => map.current?.invalidateSize(), 150);
    }).catch((e) => setError(e.message));
    return () => { dead = true; map.current?.remove(); map.current = null; marker.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // follow the coordinates
  useEffect(() => {
    const L = LRef.current;
    if (!L || !map.current) return;
    if (has) {
      setPin(L, lat!, lng!);
      if (!own.current) map.current.setView([lat!, lng!], Math.max(map.current.getZoom(), 16));
    } else if (marker.current) { marker.current.remove(); marker.current = null; }
    own.current = false;
  }, [lat, lng]);  // eslint-disable-line react-hooks/exhaustive-deps

  // with no pin yet, show the chosen district / area
  useEffect(() => { if (!has && hint && map.current) map.current.setView([hint.lat, hint.lng], hint.zoom); }, [hint?.lat, hint?.lng, hint?.zoom]);  // eslint-disable-line react-hooks/exhaustive-deps

  const set = (la: number, lo: number) => cb.current?.(+la.toFixed(6), +lo.toFixed(6));
  const search = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setMsg("");
    try { const r = await searchPlaces(q.trim()); setHits(r); if (!r.length) setMsg("Nothing found. Try the area and city, e.g. “Gulshan 2 Dhaka”."); }
    catch (err: any) { setMsg(err.message); } finally { setBusy(false); }
  };
  const here = () => {
    if (!("geolocation" in navigator)) { setMsg("This browser can't share its location."); return; }
    setMsg("Locating…");
    navigator.geolocation.getCurrentPosition((p) => { set(p.coords.latitude, p.coords.longitude); setMsg("Pinned this device's location."); },
      (err) => setMsg(err.code === 1 ? "Location permission was denied in the browser." : "Couldn't get the location."), { enableHighAccuracy: true, timeout: 10000 });
  };
  const fromPaste = (t: string) => {
    setPaste(t);
    if (!t.trim()) return;
    const p = parseMapText(t);
    if (p) { set(p.lat, p.lng); setMsg("Pinned from the link."); } else setMsg("Couldn't read coordinates. Paste the full Google Maps link from the address bar, or “lat, lng”.");
  };

  return (
    <div className="space-y-2.5">
      {!readOnly && (
        <>
          <div className="flex gap-2">
            <div className="relative flex-1"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(e); } }} placeholder="Search a place or address…" className="w-full border border-surface-200 rounded-md pl-8 pr-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" /></div>
            <button type="button" onClick={search} disabled={busy || !q.trim()} className="px-3 py-2 rounded-md bg-brand-500 text-white text-sm font-medium disabled:opacity-50">{busy ? "…" : "Search"}</button>
          </div>
          {hits && hits.length > 0 && (
            <ul className="border border-surface-200 rounded-md divide-y divide-surface-100 bg-white max-h-44 overflow-y-auto">
              {hits.map((h, i) => (
                <li key={i}><button type="button" onClick={() => { set(h.lat, h.lng); setHits(null); setMsg("Pinned. Drag the pin to fine-tune."); }} className="w-full text-left px-3 py-2 text-xs text-surface-700 hover:bg-brand-50 flex gap-2"><MapPin size={13} className="text-brand-500 flex-shrink-0 mt-0.5" /><span>{h.label}</span></button></li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="relative rounded-lg overflow-hidden border border-surface-200 bg-surface-100" style={{ height }}>
        {error ? <div className="h-full flex items-center justify-center text-sm text-surface-500 px-4 text-center">{error}</div> : <div ref={el} className="h-full w-full z-0" />}
        {!has && readOnly && !error && <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-surface-600 pointer-events-none">No location saved</div>}
        {!has && !readOnly && !error && <div className="absolute left-2 top-2 bg-white/95 border border-surface-200 rounded px-2 py-1 text-xs text-surface-600 pointer-events-none z-[500]">Click the map to drop a pin</div>}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        {has ? (
          <>
            <span className="font-mono text-surface-600">{lat!.toFixed(6)}, {lng!.toFixed(6)}</span>
            <a href={mapsUrl(lat!, lng!)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline"><ExternalLink size={12} />Open in Google Maps</a>
            <a href={directionsUrl(lat!, lng!)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline"><Navigation size={12} />Directions</a>
          </>
        ) : !readOnly && <span className="text-surface-500">No pin yet</span>}
        {!readOnly && <>
          <button type="button" onClick={here} className="inline-flex items-center gap-1 text-brand-600 hover:underline"><LocateFixed size={12} />Use my location</button>
          {has && <button type="button" onClick={() => { own.current = true; cb.current?.(NaN, NaN); setMsg(""); }} className="inline-flex items-center gap-1 text-surface-500 hover:text-danger-base"><X size={12} />Remove pin</button>}
        </>}
      </div>
      {!readOnly && (
        <>
          <input value={paste} onChange={(e) => fromPaste(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} placeholder="…or paste a Google Maps link or “23.78, 90.41”" className="w-full border border-surface-200 rounded-md px-2.5 py-1.5 text-sm" aria-label="Google Maps link" />
          {msg && <p className="text-xs text-surface-500">{msg}</p>}
        </>
      )}
    </div>
  );
}
