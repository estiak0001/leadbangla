import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Pencil, Plus, RotateCcw, Search, Trash2, Upload, X } from "lucide-react";
import Alert from "../../../components/Alert";
import Button from "../../../components/Button";
import Card from "../../../components/Card";
import GeoField from "../../../components/GeoField";
import Spinner from "../../../components/Spinner";
import { mapsUrl } from "../../../lib/geo";
import { useMe } from "../../../lib/permissions";
import {
  createLocation, deleteLocation, fetchLocations, importAreas, restoreLocations, updateLocation,
  type AreaImportResult, type Place, type PlaceKind,
} from "../../../lib/locations";

const LABEL: Record<PlaceKind, { one: string; many: string; parent: string | null }> = {
  division: { one: "Division", many: "Divisions", parent: null },
  district: { one: "District", many: "Districts", parent: "division" },
  area: { one: "Area", many: "Areas", parent: "district" },
};
const f = "w-full border border-surface-200 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500";

function PlaceDialog({ kind, place, all, onClose, onSaved }: { kind: PlaceKind; place: Place | null; all: Place[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const parentKind = LABEL[kind].parent as PlaceKind | null;
  const parents = parentKind ? all.filter((p) => p.kind === parentKind) : [];
  // for an area, pick the division first so the district list stays short
  const initialDivision = place && kind === "area" ? all.find((p) => p.id === place.parent_id)?.division ?? "" : "";
  const [divisionFilter, setDivisionFilter] = useState(initialDivision);
  const [name, setName] = useState(place?.name ?? ""); const [bn, setBn] = useState(place?.name_bn ?? "");
  const [parent, setParent] = useState(place?.parent_id ?? "");
  const [lat, setLat] = useState(place?.latitude != null ? String(place.latitude) : ""); const [lng, setLng] = useState(place?.longitude != null ? String(place.longitude) : "");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const shownParents = kind === "area" && divisionFilter ? parents.filter((p) => p.division === divisionFilter) : parents;

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const d = { kind, name: name.trim(), name_bn: bn.trim() || null, parent_id: parent || null, latitude: lat.trim() === "" ? null : Number(lat), longitude: lng.trim() === "" ? null : Number(lng) };
      if (place) await updateLocation(place.id, d); else await createLocation(d);
      onSaved(place ? `Saved “${d.name}”.${place.name !== d.name && place.contacts ? ` ${place.contacts} contact(s) were updated to the new name.` : ""}` : `Added “${d.name}”.`);
    } catch (err: any) { setError(err.message); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form onSubmit={submit} className="bg-white rounded-[6px] shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col animate-slide-up" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-100">
          <h2 className="font-semibold text-surface-900">{place ? `Edit ${LABEL[kind].one.toLowerCase()}` : `Add a ${LABEL[kind].one.toLowerCase()}`}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded text-surface-400 hover:bg-surface-100" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          {error && <Alert variant="error">{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-surface-500">Name (English)</label><input autoFocus className={f} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder={kind === "area" ? "Uttara" : kind === "district" ? "Gazipur" : "Dhaka"} /></div>
            <div><label className="text-xs text-surface-500">Name (বাংলা)</label><input className={f} value={bn} onChange={(e) => setBn(e.target.value)} maxLength={100} placeholder="উত্তরা" /></div>
          </div>
          {kind === "area" && (
            <div><label className="text-xs text-surface-500">Division</label>
              <select className={f} value={divisionFilter} onChange={(e) => { setDivisionFilter(e.target.value); setParent(""); }}>
                <option value="">All divisions</option>{all.filter((p) => p.kind === "division").map((d) => <option key={d.id}>{d.name}</option>)}
              </select></div>
          )}
          {parentKind && (
            <div><label className="text-xs text-surface-500">{LABEL[parentKind].one} it belongs to</label>
              <select className={f} value={parent} onChange={(e) => setParent(e.target.value)}>
                <option value="">Choose…</option>{shownParents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
          )}
          <GeoField lat={lat} lng={lng} onChange={(a, b) => { setLat(a); setLng(b); }} label="Map point (optional)" />
          {place && place.contacts > 0 && place.name !== name.trim() && <p className="text-xs text-surface-500">{place.contacts} contact(s) in “{place.name}” will be renamed too.</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-surface-100">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" loading={busy} disabled={!name.trim() || (!!parentKind && !parent)}>{place ? "Save" : "Add"}</Button>
        </div>
      </form>
    </div>
  );
}

export default function LocationsTab() {
  const { me } = useMe();
  const canEdit = me ? me.my_role === "owner" || me.my_role === "admin" : false;
  const [all, setAll] = useState<Place[] | null>(null);
  const [kind, setKind] = useState<PlaceKind>("district");
  const [q, setQ] = useState(""); const [parentFilter, setParentFilter] = useState("");
  const [dialog, setDialog] = useState<{ place: Place | null } | null>(null);
  const [confirm, setConfirm] = useState<Place | null>(null);
  const [notice, setNotice] = useState(""); const [error, setError] = useState("");
  const [imp, setImp] = useState<AreaImportResult | null>(null); const [importing, setImporting] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(() => { fetchLocations().then(setAll).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  useEffect(() => setParentFilter(""), [kind]);

  const counts = useMemo(() => ({ division: 0, district: 0, area: 0, ...Object.fromEntries((["division", "district", "area"] as const).map((k) => [k, (all ?? []).filter((p) => p.kind === k).length])) }) as Record<PlaceKind, number>, [all]);
  const parentOptions = useMemo(() => (all ?? []).filter((p) => p.kind === LABEL[kind].parent), [all, kind]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (all ?? []).filter((p) => p.kind === kind && (!parentFilter || p.parent_id === parentFilter) && (!t || p.name.toLowerCase().includes(t) || (p.name_bn ?? "").includes(q.trim())));
  }, [all, kind, q, parentFilter]);

  const remove = async (p: Place) => {
    try { const r = await deleteLocation(p.id); setNotice(`Deleted “${p.name}”.${r.contacts_still_using ? ` ${r.contacts_still_using} contact(s) still have it written on them; that text is unchanged.` : ""}`); setConfirm(null); load(); }
    catch (e: any) { setError(e.message); setConfirm(null); }
  };
  const restore = async () => { try { const r = await restoreLocations(); setNotice(r.added ? `Added back ${r.added} missing division / district / area record(s).` : "Nothing is missing — all 8 divisions, 64 districts and the default areas are in your list."); load(); } catch (e: any) { setError(e.message); } };
  const doImport = async (fl?: File) => {
    if (!fl) return;
    setImporting(true); setImp(null); setError("");
    try { setImp(await importAreas(fl)); load(); } catch (e: any) { setError(e.message); } finally { setImporting(false); if (file.current) file.current.value = ""; }
  };

  if (!all) return <div className="py-16 flex justify-center"><Spinner size="lg" /></div>;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="font-semibold text-surface-900 flex items-center gap-2"><MapPin size={16} className="text-brand-500" />Division · District · Area</h3>
          <p className="text-xs text-surface-500 mt-0.5 max-w-xl">Your master list behind the Division, District and Area choices on contacts and CSV imports. It starts with Bangladesh’s 8 divisions, 64 districts and the main areas of Dhaka, Chattogram, Sylhet, Khulna and Rajshahi. Add, rename, move or delete anything. Map points are approximate centres.</p>
        </div>
        {canEdit && (
          <div className="flex gap-2 flex-wrap">
            <Button size="xs" variant="secondary" icon={<RotateCcw size={13} />} onClick={restore}>Restore defaults</Button>
            {kind === "area" && <>
              <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => doImport(e.target.files?.[0])} />
              <Button size="xs" variant="secondary" icon={<Upload size={13} />} loading={importing} onClick={() => file.current?.click()}>Import areas (CSV)</Button>
            </>}
            <Button size="xs" icon={<Plus size={13} />} onClick={() => setDialog({ place: null })}>Add {LABEL[kind].one.toLowerCase()}</Button>
          </div>
        )}
      </div>
      {error && <Alert variant="error" onDismiss={() => setError("")} className="mb-3">{error}</Alert>}
      {notice && <Alert variant="success" onDismiss={() => setNotice("")} className="mb-3">{notice}</Alert>}
      {imp && (
        <Alert variant={imp.errors.length ? "warning" : "success"} onDismiss={() => setImp(null)} className="mb-3">
          <p className="text-sm">Areas imported: {imp.created} added, {imp.skipped} skipped (already there or invalid).</p>
          {imp.errors.length > 0 && <ul className="text-xs mt-1 list-disc pl-4">{imp.errors.slice(0, 8).map((e, i) => <li key={i}>Row {e.row}: {e.reason}{e.value ? ` (${e.value})` : ""}</li>)}</ul>}
        </Alert>
      )}
      {kind === "area" && canEdit && <p className="text-xs text-surface-500 mb-3">CSV columns: <span className="font-mono">district, area, area_bn, latitude, longitude</span> — only district and area are needed. Use this to load every upazila / thana for your districts.</p>}
      {!canEdit && <Alert variant="info" className="mb-3">Only the owner or an admin can change this list.</Alert>}

      <div className="flex gap-1 bg-surface-100 p-1 rounded-md w-fit mb-3" role="tablist">
        {(["division", "district", "area"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
            className={`px-3.5 py-1.5 rounded text-xs font-medium ${kind === k ? "bg-white shadow-sm text-surface-900" : "text-surface-600 hover:text-surface-900"}`}>{LABEL[k].many} <span className="text-surface-400">{counts[k]}</span></button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap mb-3">
        <div className="relative flex-1 min-w-44 max-w-xs"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search English or বাংলা…" className={`${f} pl-8`} /></div>
        {LABEL[kind].parent && (
          <select value={parentFilter} onChange={(e) => setParentFilter(e.target.value)} className="border border-surface-200 rounded-md px-2.5 py-1.5 text-sm bg-white max-w-[14rem]">
            <option value="">All {LABEL[LABEL[kind].parent as PlaceKind].many.toLowerCase()}</option>{parentOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <span className="self-center text-xs text-surface-500">{shown.length} shown</span>
      </div>

      <div className="border border-surface-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm m-cards">
          <thead><tr className="text-left text-xs text-surface-500 bg-surface-50 border-b border-surface-200">
            <th className="px-3 py-2 font-medium">{LABEL[kind].one}</th><th className="px-3 py-2 font-medium">বাংলা</th>
            {kind !== "division" && <th className="px-3 py-2 font-medium">{kind === "district" ? "Division" : "District"}</th>}
            {kind === "area" && <th className="px-3 py-2 font-medium">Division</th>}
            <th className="px-3 py-2 font-medium">Map</th><th className="px-3 py-2 font-medium">Contacts</th>{canEdit && <th className="px-3 py-2" />}
          </tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className="border-b border-surface-100 last:border-0">
                <td data-kind="primary" className="px-3 py-2 font-medium text-surface-900">{p.name}</td>
                <td data-label="বাংলা" className="px-3 py-2 text-surface-600">{p.name_bn ?? "—"}</td>
                {kind !== "division" && <td data-label={kind === "district" ? "Division" : "District"} className="px-3 py-2 text-surface-600">{p.parent_name ?? "—"}</td>}
                {kind === "area" && <td data-label="Division" className="px-3 py-2 text-surface-600">{p.division ?? "—"}</td>}
                <td data-label="Map" className="px-3 py-2 text-surface-600">{p.latitude != null && p.longitude != null ? <a href={mapsUrl(p.latitude, p.longitude)} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline whitespace-nowrap">Open map</a> : "—"}</td>
                <td data-label="Contacts" className="px-3 py-2 text-surface-600">{p.contacts}</td>
                {canEdit && (
                  <td data-kind="actions" className="px-3 py-2 text-right whitespace-nowrap">
                    {confirm?.id === p.id ? (
                      <span className="inline-flex items-center gap-2 text-xs"><span className="text-surface-600">Delete?</span>
                        <button onClick={() => remove(p)} className="font-medium text-danger-base">Yes</button><button onClick={() => setConfirm(null)} className="text-surface-600">No</button></span>
                    ) : (
                      <>
                        <button onClick={() => setDialog({ place: p })} aria-label={`Edit ${p.name}`} className="p-1.5 text-surface-400 hover:text-brand-600"><Pencil size={14} /></button>
                        <button onClick={() => setConfirm(p)} aria-label={`Delete ${p.name}`} className="p-1.5 text-surface-400 hover:text-danger-base"><Trash2 size={14} /></button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={7} data-kind="span" className="px-3 py-8 text-center text-surface-500">{kind === "area" && !q && !parentFilter ? "No areas yet — add one, or import a CSV." : "Nothing matches."}</td></tr>}
          </tbody>
        </table>
      </div>
      {dialog && <PlaceDialog kind={kind} place={dialog.place} all={all} onClose={() => setDialog(null)} onSaved={(m) => { setDialog(null); setNotice(m); load(); }} />}
    </Card>
  );
}
