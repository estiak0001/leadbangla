import { useState } from "react";
import { ExternalLink, LocateFixed, X } from "lucide-react";
import { mapsUrl, parseMapText } from "../lib/geo";

const f = "w-full border border-surface-200 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500";

/** Latitude / longitude with three ways to fill them: type, paste a Google Maps link, or use this device's location. */
export default function GeoField({ lat, lng, onChange, label = "Map location" }: { lat: string; lng: string; onChange: (lat: string, lng: string) => void; label?: string }) {
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const hasPair = lat.trim() !== "" && lng.trim() !== "" && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng));

  const fromPaste = (text: string) => {
    setPaste(text);
    if (!text.trim()) { setMsg(""); return; }
    const p = parseMapText(text);
    if (p) { onChange(String(p.lat), String(p.lng)); setMsg("Coordinates read from the link."); }
    else setMsg("Couldn't read coordinates. Open the place in Google Maps, copy the long address-bar link (not a short link), or paste “lat, lng”.");
  };
  const here = () => {
    if (!("geolocation" in navigator)) { setMsg("This browser can't share its location."); return; }
    setBusy(true); setMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => { onChange(pos.coords.latitude.toFixed(6), pos.coords.longitude.toFixed(6)); setBusy(false); setMsg("Used this device's location."); },
      (err) => { setBusy(false); setMsg(err.code === 1 ? "Location permission was denied in the browser." : "Couldn't get the location."); },
      { enableHighAccuracy: true, timeout: 10000 });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-surface-700">{label}</label>
        <div className="flex items-center gap-3 text-xs">
          <button type="button" onClick={here} disabled={busy} className="inline-flex items-center gap-1 text-brand-600 hover:underline disabled:opacity-50"><LocateFixed size={13} />{busy ? "Locating…" : "Use my location"}</button>
          {hasPair && <a href={mapsUrl(Number(lat), Number(lng))} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-surface-600 hover:text-brand-600"><ExternalLink size={12} />Open map</a>}
          {(lat || lng) && <button type="button" onClick={() => { onChange("", ""); setMsg(""); setPaste(""); }} className="inline-flex items-center gap-1 text-surface-500 hover:text-danger-base"><X size={12} />Clear</button>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={f} inputMode="decimal" placeholder="Latitude e.g. 23.7808" value={lat} onChange={(e) => onChange(e.target.value, lng)} aria-label="Latitude" />
        <input className={f} inputMode="decimal" placeholder="Longitude e.g. 90.4075" value={lng} onChange={(e) => onChange(lat, e.target.value)} aria-label="Longitude" />
      </div>
      <input className={f} placeholder="…or paste a Google Maps link here" value={paste} onChange={(e) => fromPaste(e.target.value)} aria-label="Google Maps link" />
      {msg && <p className="text-xs text-surface-500">{msg}</p>}
    </div>
  );
}
