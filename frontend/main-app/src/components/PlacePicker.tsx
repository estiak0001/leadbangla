import { Locations } from "../lib/locations";

const sel = "w-full border border-surface-200 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:bg-surface-50 disabled:text-surface-400";

export interface PlaceValue { division: string; district: string; area: string; }

/** Division → District → Area. Choosing a district fills in its division; each list narrows to the parent chosen above. */
export default function PlacePicker({ value, onChange, places, compact = false }: { value: PlaceValue; onChange: (v: PlaceValue) => void; places: Locations; compact?: boolean }) {
  const { divisions, districts, areas } = places;
  const div = divisions.find((d) => d.name.toLowerCase() === value.division.toLowerCase());
  const dist = districts.find((d) => d.name.toLowerCase() === value.district.toLowerCase());
  const districtOptions = div ? districts.filter((d) => d.parent_id === div.id) : districts;
  const areaOptions = dist ? areas.filter((a) => a.parent_id === dist.id) : [];
  const keep = (list: { name: string }[], v: string) => (v && !list.some((x) => x.name.toLowerCase() === v.toLowerCase()) ? <option value={v}>{v}</option> : null);

  return (
    <div className={`grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3"}`}>
      <div>
        <label className="text-xs text-surface-500">Division</label>
        <select className={sel} value={value.division} onChange={(e) => {
          const next = e.target.value;
          const stillOk = dist && divisions.find((d) => d.name === next)?.id === dist.parent_id;
          onChange({ division: next, district: stillOk ? value.district : "", area: stillOk ? value.area : "" });
        }}>
          <option value="">Not set</option>{keep(divisions, value.division)}
          {divisions.map((d) => <option key={d.id} value={d.name}>{d.name}{d.name_bn ? ` · ${d.name_bn}` : ""}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-surface-500">District</label>
        <select className={sel} value={value.district} onChange={(e) => {
          const d = districts.find((x) => x.name === e.target.value);
          onChange({ division: d?.division ?? value.division, district: e.target.value, area: "" });
        }}>
          <option value="">Not set</option>{keep(districtOptions, value.district)}
          {districtOptions.map((d) => <option key={d.id} value={d.name}>{d.name}{d.name_bn ? ` · ${d.name_bn}` : ""}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-surface-500">Area</label>
        <select className={sel} value={value.area} disabled={!value.district} onChange={(e) => onChange({ ...value, area: e.target.value })}>
          <option value="">{value.district ? (areaOptions.length ? "Not set" : "None listed") : "Pick district first"}</option>{keep(areaOptions, value.area)}
          {areaOptions.map((a) => <option key={a.id} value={a.name}>{a.name}{a.name_bn ? ` · ${a.name_bn}` : ""}</option>)}
        </select>
      </div>
      {value.district && dist && areaOptions.length === 0 && !compact && (
        <p className="sm:col-span-3 text-xs text-surface-500 -mt-1">No areas are listed for {dist.name} yet. Add them in Settings → Cities &amp; Districts (one by one or by CSV).</p>
      )}
    </div>
  );
}
