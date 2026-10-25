import { useState } from "react";
import { Pencil } from "lucide-react";
import { useLocations } from "../../lib/locations";
import PlacePicker from "../../components/PlacePicker";
import GeoField from "../../components/GeoField";
import { mapsUrl } from "../../lib/geo";
import Button from "../../components/Button";
import Alert from "../../components/Alert";
import {
  setOwner, taka, updateProfile, SOURCES, SOURCE_LABELS, useSources,
  type CrmContact, type CustomField, type TeamMember,
} from "../../lib/crm";

const field = "w-full border border-surface-200 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;   // empty fields stay out of the way; "Edit" shows them all
  return (
    <div className="flex justify-between gap-3 text-[13px] py-0.5">
      <span className="text-surface-500 flex-shrink-0">{label}</span>
      <span className="text-surface-900 text-right break-words min-w-0">{children}</span>
    </div>
  );
}

export default function SalesDetailsCard({ contact, team, fields, canAssign, onUpdated }: {
  contact: CrmContact; team: TeamMember[]; fields: CustomField[]; canAssign: boolean; onUpdated: (c: CrmContact) => void;
}) {
  const places = useLocations();
  useSources();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({
    company: "", division: "", district: "", area: "", address: "", source: "", whatsapp_number: "", facebook_url: "", customer_type: "",
    deal_value: "", expected_close_date: "", latitude: "", longitude: "",
  });
  const [custom, setCustom] = useState<Record<string, string>>({});

  const start = () => {
    setF({
      company: contact.company ?? "", division: contact.division ?? "", district: contact.district ?? contact.city ?? "", area: contact.area ?? "", address: contact.address ?? "", source: contact.source ?? "",
      whatsapp_number: contact.whatsapp_number ?? "", facebook_url: contact.facebook_url ?? "", customer_type: contact.customer_type ?? "",
      deal_value: contact.deal_value != null ? String(contact.deal_value / 100) : "", expected_close_date: contact.expected_close_date ?? "",
      latitude: contact.latitude != null ? String(contact.latitude) : "", longitude: contact.longitude != null ? String(contact.longitude) : "",
    });
    setCustom(Object.fromEntries(fields.map((d) => [d.key, String(contact.custom_fields?.[d.key] ?? "")])));
    setError(""); setEditing(true);
  };

  const save = async () => {
    setSaving(true); setError("");
    try {
      const updated = await updateProfile(contact.id, {
        company: f.company || null, division: f.division || null, district: f.district || null, area: f.area || null, address: f.address || null, source: f.source || null,
        whatsapp_number: f.whatsapp_number || null, facebook_url: f.facebook_url || null, customer_type: f.customer_type || null,
        deal_value: f.deal_value.trim() === "" ? null : Number(f.deal_value),
        expected_close_date: f.expected_close_date || null,
        latitude: f.latitude.trim() === "" ? null : Number(f.latitude), longitude: f.longitude.trim() === "" ? null : Number(f.longitude),
        custom_fields: Object.fromEntries(Object.entries(custom).map(([k, v]) => [k, v === "" ? null : v])),
      });
      onUpdated(updated); setEditing(false);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const changeOwner = async (id: string) => {
    setError("");
    try { onUpdated(await setOwner(contact.id, id || null)); } catch (e: any) { setError(e.message); }
  };

  const owner = team.find((t) => t.user_id === contact.owner_user_id);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-surface-500">Sales details</p>
        {!editing && <button onClick={start} className="text-xs text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1"><Pencil size={12} />Edit</button>}
      </div>
      {error && <Alert variant="error" className="mb-2">{error}</Alert>}

      <div className="mb-2">
        <label className="text-xs text-surface-500">Owner</label>
        {canAssign ? (
          <select value={contact.owner_user_id ?? ""} onChange={(e) => changeOwner(e.target.value)} className={field}>
            <option value="">No owner</option>
            {team.map((t) => <option key={t.user_id} value={t.user_id}>{t.email}</option>)}
          </select>
        ) : <p className="text-sm text-surface-900">{owner?.email ?? "No owner"}</p>}
      </div>

      {editing ? (
        <div className="space-y-2.5">
          <div><label className="text-xs text-surface-500">Shop / company</label><input className={field} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></div>
          <PlacePicker compact places={places} value={{ division: f.division, district: f.district, area: f.area }} onChange={(v) => setF({ ...f, ...v })} />
          <div><label className="text-xs text-surface-500">Customer type</label>
            <select className={field} value={f.customer_type} onChange={(e) => setF({ ...f, customer_type: e.target.value })}><option value="">Not set</option><option value="retail">Retail</option><option value="wholesale">Wholesale</option></select></div>
          <div><label className="text-xs text-surface-500">Address / delivery notes</label><textarea className={field} rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
          <div><label className="text-xs text-surface-500">Source</label>
            <select className={field} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="">Not set</option>{SOURCES.map((k) => <option key={k} value={k}>{SOURCE_LABELS[k]}</option>)}</select></div>
          <GeoField lat={f.latitude} lng={f.longitude} onChange={(a, b) => setF({ ...f, latitude: a, longitude: b })} label="Shop / delivery location" />
          <div><label className="text-xs text-surface-500">WhatsApp number (if different)</label><input className={field} value={f.whatsapp_number} onChange={(e) => setF({ ...f, whatsapp_number: e.target.value })} placeholder="01XXXXXXXXX" /></div>
          <div><label className="text-xs text-surface-500">Facebook profile / page link</label><input className={field} value={f.facebook_url} onChange={(e) => setF({ ...f, facebook_url: e.target.value })} placeholder="https://facebook.com/…" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-surface-500">Deal value (৳)</label><input className={field} type="number" min="0" step="any" value={f.deal_value} onChange={(e) => setF({ ...f, deal_value: e.target.value })} /></div>
            <div><label className="text-xs text-surface-500">Expected close</label><input className={field} type="date" value={f.expected_close_date} onChange={(e) => setF({ ...f, expected_close_date: e.target.value })} /></div>
          </div>
          {fields.map((d) => (
            <div key={d.id}><label className="text-xs text-surface-500">{d.label}</label>
              {d.field_type === "select" ? (
                <select className={field} value={custom[d.key] ?? ""} onChange={(e) => setCustom({ ...custom, [d.key]: e.target.value })}><option value="">Not set</option>{d.options.map((o) => <option key={o}>{o}</option>)}</select>
              ) : <input className={field} type={d.field_type === "number" ? "number" : d.field_type === "date" ? "date" : "text"} value={custom[d.key] ?? ""} onChange={(e) => setCustom({ ...custom, [d.key]: e.target.value })} />}
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="xs" loading={saving} onClick={save}>Save</Button>
          </div>
        </div>
      ) : (
        <div>
          <Row label="Shop / company">{contact.company}</Row>
          <Row label="Division">{contact.division}</Row>
          <Row label="District">{contact.district ?? contact.city}</Row>
          <Row label="Area">{contact.area}</Row>
          <Row label="Type">{contact.customer_type && <span className="capitalize">{contact.customer_type}</span>}</Row>
          <Row label="Source">{contact.source && (SOURCE_LABELS[contact.source] ?? contact.source)}</Row>
          <Row label="Address">{contact.address}</Row>
          <Row label="Location">{contact.latitude != null && contact.longitude != null && <a href={mapsUrl(contact.latitude, contact.longitude)} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">Open in Maps</a>}</Row>
          <Row label="Facebook">{contact.facebook_url && <a href={contact.facebook_url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">Open link</a>}</Row>
          <Row label="Deal value">{contact.deal_value != null && taka(contact.deal_value)}</Row>
          <Row label="Expected close">{contact.expected_close_date && new Date(contact.expected_close_date).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" })}</Row>
          {contact.lost_reason && <Row label="Lost because">{contact.lost_reason}</Row>}
          {fields.map((d) => <Row key={d.id} label={d.label}>{contact.custom_fields?.[d.key] != null && String(contact.custom_fields[d.key])}</Row>)}
        </div>
      )}
    </div>
  );
}
