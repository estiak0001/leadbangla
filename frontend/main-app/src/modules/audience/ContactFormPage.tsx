import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, ChevronDown, ChevronRight, Contact as ContactIcon, LocateFixed, MapPin, MessageSquareText, Plus, Briefcase, Save } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Input from "../../components/Input";
import MapPicker, { type MapHint } from "../../components/MapPicker";
import PlacePicker from "../../components/PlacePicker";
import Select from "../../components/Select";
import Spinner from "../../components/Spinner";
import StickyActionBar from "../../components/StickyActionBar";
import TagInput from "../../components/TagInput";
import UpgradeLimitModal from "../../components/UpgradeLimitModal";
import {
  createContact, createTagPreset, DuplicateContactError, fetchTagPresets, updateContact, type TagPreset,
} from "../../lib/audience";
import {
  fetchCrmContact, fetchCustomFields, fetchTeam, setOwner, SOURCE_LABELS, SOURCES, updateProfile, useSources,
  type CustomField, type TeamMember,
} from "../../lib/crm";
import { useLocations } from "../../lib/locations";
import { useMe } from "../../lib/permissions";
import { PlanLimitError } from "../../lib/planLimit";
import { updateOptIn } from "../../lib/sms";

const blank = {
  first_name: "", last_name: "", email: "", phone: "", whatsapp_number: "", facebook_url: "",
  company: "", customer_type: "", source: "", owner: "", deal_value: "", expected_close: "",
  division: "", district: "", area: "", address: "", latitude: "", longitude: "",
  sms_opt_in: true, whatsapp_opt_in: true,   // new contacts start as "agreed"; untick if they haven't
};
type Form = typeof blank;

function Disclosure({ icon, title, summary, open, onToggle, children }: { icon: React.ReactNode; title: string; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-surface-200 rounded-xl overflow-hidden">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-50 active:bg-surface-100 transition-colors min-h-[56px]">
        <span className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-surface-900">{title}</span>
          <span className={`block text-xs truncate ${summary ? "text-surface-600" : "text-surface-400"}`}>{summary || "Optional"}</span>
        </span>
        {open ? <ChevronDown size={18} className="text-brand-600 flex-shrink-0" /> : <Plus size={18} className="text-surface-400 flex-shrink-0" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-4 border-t border-surface-100">{children}</div>}
    </section>
  );
}

function PreviewCard({ form, tags, team, fields, custom, hasPin, lat, lng, editing }: {
  form: Form; tags: string[]; team: TeamMember[]; fields: CustomField[]; custom: Record<string, string>; hasPin: boolean; lat: number | null; lng: number | null; editing: boolean;
}) {
  const name = [form.first_name, form.last_name].filter((x) => x.trim()).join(" ");
  const ini = ((form.first_name[0] ?? "") + (form.last_name[0] ?? "")).toUpperCase() || (form.company[0] ?? form.phone[0] ?? "?").toUpperCase();
  const place = [form.area, form.district, form.division && form.division !== form.district ? form.division : ""].filter(Boolean).join(", ");
  const owner = team.find((t) => t.user_id === form.owner)?.email;
  const filledCustom = fields.filter((d) => custom[d.key]);
  const checks: [string, boolean][] = [
    ["Name", !!name], ["Mobile", !!form.phone.trim()], ["Email", !!form.email.trim()], ["Shop", !!form.company.trim()],
    ["Place", !!form.district], ["Map pin", hasPin], ["Type", !!form.customer_type], ["Source", !!form.source],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex justify-between gap-3 text-[13px] py-1"><span className="text-surface-500 flex-shrink-0">{label}</span><span className="text-surface-900 text-right break-words min-w-0">{children}</span></div>
  );
  return (
    <aside className="hidden lg:block lg:sticky lg:top-3" aria-label="Contact preview">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-surface-500 mb-2 px-1">Live preview</p>
      <div className="bg-white border border-surface-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 flex items-center gap-3 bg-gradient-to-br from-brand-50 to-white border-b border-surface-100">
          <div className="w-12 h-12 rounded-full bg-brand-500 text-white flex items-center justify-center text-lg font-bold flex-shrink-0">{ini}</div>
          <div className="min-w-0">
            <p className={`text-base font-bold leading-tight truncate ${name ? "text-surface-900" : "text-surface-400"}`}>{name || (editing ? "Unnamed contact" : "New contact")}</p>
            <p className="text-xs text-surface-600 truncate">{[form.company.trim(), place].filter(Boolean).join(" · ") || "Shop and place will show here"}</p>
          </div>
        </div>
        <div className="px-4 py-3 divide-y divide-surface-100">
          <div className="pb-2">
            <Row label="Mobile">{form.phone.trim() || <span className="text-surface-300">—</span>}</Row>
            <Row label="Email">{form.email.trim() || <span className="text-surface-300">—</span>}</Row>
            {form.whatsapp_number.trim() && <Row label="WhatsApp">{form.whatsapp_number}</Row>}
            {form.facebook_url.trim() && <Row label="Facebook"><span className="truncate inline-block max-w-[12rem] align-bottom">{form.facebook_url}</span></Row>}
          </div>
          {(form.customer_type || form.source || owner || form.deal_value || form.expected_close || filledCustom.length > 0) && (
            <div className="py-2">
              {form.customer_type && <Row label="Type"><span className="capitalize">{form.customer_type}</span></Row>}
              {form.source && <Row label="Source">{SOURCE_LABELS[form.source]}</Row>}
              {owner && <Row label="Owner">{owner}</Row>}
              {form.deal_value && <Row label="Deal value">৳{Number(form.deal_value).toLocaleString("en-IN")}</Row>}
              {form.expected_close && <Row label="Expected close">{new Date(form.expected_close).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" })}</Row>}
              {filledCustom.map((d) => <Row key={d.id} label={d.label}>{custom[d.key]}</Row>)}
            </div>
          )}
          {(tags.length > 0 || (form.phone.trim() && (form.sms_opt_in || form.whatsapp_opt_in))) && (
            <div className="py-2 flex flex-wrap gap-1.5">
              {tags.map((t) => <span key={t} className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">{t}</span>)}
              {form.phone.trim() && form.sms_opt_in && <span className="px-2 py-0.5 rounded-full bg-success-light text-success-dark text-xs font-medium">SMS ✓</span>}
              {form.phone.trim() && form.whatsapp_opt_in && <span className="px-2 py-0.5 rounded-full bg-success-light text-success-dark text-xs font-medium">WhatsApp ✓</span>}
            </div>
          )}
          {form.address.trim() && <p className="py-2 text-[13px] text-surface-700">{form.address}</p>}
          <div className="pt-2">
            {hasPin ? <MapPicker readOnly lat={lat} lng={lng} height={150} /> : (
              <div className="rounded-lg border border-dashed border-surface-200 bg-surface-50 text-center text-xs text-surface-500 py-6">No map pin yet — tap “Pin here”</div>
            )}
          </div>
        </div>
        <div className="px-4 py-3 bg-surface-50 border-t border-surface-100">
          <div className="flex items-center justify-between text-xs mb-1.5"><span className="font-medium text-surface-700">Profile completeness</span><span className="text-surface-500">{done} of {checks.length}</span></div>
          <div className="h-1.5 rounded-full bg-surface-200 overflow-hidden"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(done / checks.length) * 100}%` }} /></div>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {checks.map(([l, ok]) => <span key={l} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${ok ? "bg-success-light text-success-dark" : "bg-white border border-surface-200 text-surface-400"}`}>{ok && <Check size={10} />}{l}</span>)}
          </div>
          {!form.email.trim() && <p className="text-[11px] text-surface-500 mt-2">Tip: with an email you can send this person email campaigns.</p>}
        </div>
      </div>
    </aside>
  );
}

export default function ContactFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = !!id;
  const navigate = useNavigate();
  const places = useLocations();
  useSources();
  const { me } = useMe();
  const [form, setForm] = useState<Form>(blank);
  const [tags, setTags] = useState<string[]>([]);
  const [presets, setPresets] = useState<TagPreset[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<{ owner: string; sms: boolean; wa: boolean } | null>(null);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ message: string; contactId: string } | null>(null);
  const [limit, setLimit] = useState<{ resource: string; current: number; limit: number } | null>(null);

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [added, setAdded] = useState<{ id: string; name: string } | null>(null);
  const [locMsg, setLocMsg] = useState("");
  const [locating, setLocating] = useState(false);
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    fetchTeam().then(setTeam).catch(() => undefined);
    fetchCustomFields().then(setFields).catch(() => undefined);
    fetchTagPresets().then(setPresets).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!id) return;
    fetchCrmContact(id).then((c) => {
      setForm({
        first_name: c.first_name ?? "", last_name: c.last_name ?? "", email: c.email ?? "", phone: c.phone ?? "",
        whatsapp_number: c.whatsapp_number ?? "", facebook_url: c.facebook_url ?? "", company: c.company ?? "", customer_type: c.customer_type ?? "",
        source: c.source ?? "", owner: c.owner_user_id ?? "", deal_value: c.deal_value != null ? String(c.deal_value / 100) : "",
        expected_close: c.expected_close_date ?? "", division: c.division ?? "", district: c.district ?? c.city ?? "", area: c.area ?? "",
        address: c.address ?? "", latitude: c.latitude != null ? String(c.latitude) : "", longitude: c.longitude != null ? String(c.longitude) : "",
        sms_opt_in: c.sms_opt_in, whatsapp_opt_in: c.whatsapp_opt_in,
      });
      setTags(c.tags);
      setCustom(Object.fromEntries(Object.entries(c.custom_fields ?? {}).map(([k, v]) => [k, String(v)])));
      setOriginal({ owner: c.owner_user_id ?? "", sms: c.sms_opt_in, wa: c.whatsapp_opt_in });
      setOpen({
        more: !!(c.whatsapp_number || c.facebook_url || c.tags.length),
        place: !!(c.division || c.district || c.area || c.address || c.latitude != null),
        biz: !!(c.customer_type || c.source || c.owner_user_id || c.deal_value != null || c.expected_close_date || Object.keys(c.custom_fields ?? {}).length),
        consent: c.sms_opt_in || c.whatsapp_opt_in,
      });
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [id]);

  const latNum = form.latitude.trim() === "" ? null : Number(form.latitude);
  const lngNum = form.longitude.trim() === "" ? null : Number(form.longitude);
  const hasPin = latNum != null && lngNum != null && !Number.isNaN(latNum) && !Number.isNaN(lngNum);

  // map centre when there is no pin yet: the chosen area, else district, else division
  const hint: MapHint | null = useMemo(() => {
    const a = places.areas.find((x) => x.name === form.area && x.parent_name === form.district);
    const d = places.districts.find((x) => x.name === form.district);
    const v = places.divisions.find((x) => x.name === form.division);
    const pick = a?.latitude != null ? [a, 14] : d?.latitude != null ? [d, 11] : v?.latitude != null ? [v, 9] : null;
    return pick ? { lat: (pick[0] as any).latitude, lng: (pick[0] as any).longitude, zoom: pick[1] as number } : null;
  }, [places.areas, places.districts, places.divisions, form.area, form.district, form.division]);

  const allTags = useMemo(() => Array.from(new Set([...presets.map((p) => p.name), ...tags])).sort(), [presets, tags]);
  const canAssign = me?.my_role !== "sales" && team.length > 0;

  const pinHere = () => {
    if (!("geolocation" in navigator)) { setLocMsg("This phone/browser can't share its location."); return; }
    setLocating(true); setLocMsg("");
    navigator.geolocation.getCurrentPosition(
      (p) => { setForm((f) => ({ ...f, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) })); setLocating(false); setLocMsg(`Pinned (accurate to ~${Math.round(p.coords.accuracy)} m).`); },
      (err) => { setLocating(false); setLocMsg(err.code === 1 ? "Allow location access in the browser, then try again." : "Couldn't get the location. Move to an open area and retry."); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };

  async function save(e: FormEvent, force = false, another = false) {
    e.preventDefault();
    const email = form.email.trim() || null;
    const phone = form.phone.trim() || null;
    if (!email && !phone) { setError("Add a mobile number (or an email)."); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if ((form.latitude.trim() === "") !== (form.longitude.trim() === "") || (hasPin === false && form.latitude.trim() !== "")) {
      setError("Enter both latitude and longitude as numbers, or drop a pin on the map."); return;
    }
    setError(null); setSaving(true);
    const deal = form.deal_value.trim() === "" ? null : Number(form.deal_value);
    const geo = { latitude: hasPin ? latNum : null, longitude: hasPin ? lngNum : null };
    try {
      if (editing && id) {
        await updateContact(id, { email, phone, first_name: form.first_name.trim() || null, last_name: form.last_name.trim() || null, tags });
        await updateProfile(id, {
          company: form.company.trim() || null, division: form.division || null, district: form.district || null, area: form.area || null,
          address: form.address.trim() || null, source: form.source || null, whatsapp_number: form.whatsapp_number.trim() || null,
          facebook_url: form.facebook_url.trim() || null, customer_type: form.customer_type || null, deal_value: deal,
          expected_close_date: form.expected_close || null, ...geo,
          custom_fields: Object.fromEntries(fields.map((d) => [d.key, custom[d.key]?.trim() ? custom[d.key] : null])),
        });
        if (canAssign && original && form.owner !== original.owner) await setOwner(id, form.owner || null);
        if (original && (form.sms_opt_in !== original.sms || form.whatsapp_opt_in !== original.wa)) {
          await updateOptIn(id, { sms_opt_in: form.sms_opt_in, whatsapp_opt_in: form.whatsapp_opt_in });
        }
        navigate(`/contacts/${id}`);
      } else {
        const c = await createContact({
          email, phone, first_name: form.first_name.trim() || null, last_name: form.last_name.trim() || null, tags,
          company: form.company.trim() || null, division: form.division || null, district: form.district || null, area: form.area || null,
          address: form.address.trim() || null, source: form.source || null, customer_type: form.customer_type || null,
          whatsapp_number: form.whatsapp_number.trim() || null, facebook_url: form.facebook_url.trim() || null,
          owner_user_id: canAssign && form.owner ? form.owner : null, deal_value: deal, expected_close_date: form.expected_close || null, ...geo,
          custom_fields: Object.fromEntries(Object.entries(custom).filter(([, v]) => v !== "")),
          sms_opt_in: !!phone && form.sms_opt_in, whatsapp_opt_in: !!phone && form.whatsapp_opt_in,
        }, force);
        if (another) {
          setAdded({ id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone || c.email || "Contact" });
          setForm(blank); setTags([]); setCustom({}); setOpen({}); setLocMsg(""); setSaving(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        navigate(`/contacts/${c.id}`);
      }
    } catch (err) {
      if (err instanceof DuplicateContactError) setDuplicate({ message: err.message, contactId: err.contactId });
      else if (err instanceof PlanLimitError) setLimit({ resource: err.resource, current: err.current, limit: err.limit });
      else { setError(err instanceof Error ? err.message : "Could not save the contact"); window.scrollTo({ top: 0, behavior: "smooth" }); }
      setSaving(false);
    }
  }

  const name = [form.first_name, form.last_name].filter(Boolean).join(" ") || (editing ? "this contact" : "New contact");
  if (loading) return <AppLayout><div className="flex justify-center py-20"><Spinner size="lg" /></div></AppLayout>;

  const placeText = [form.area, form.district, form.division && form.division !== form.district ? form.division : ""].filter(Boolean).join(", ");
  const moreFilled = [form.whatsapp_number, form.facebook_url].filter((v) => v.trim()).length + (tags.length ? 1 : 0);
  const bizBits = [form.customer_type && (form.customer_type === "retail" ? "Retail" : "Wholesale"), form.source && SOURCE_LABELS[form.source],
    form.owner && team.find((t) => t.user_id === form.owner)?.email.split("@")[0], form.deal_value && `৳${form.deal_value}`].filter(Boolean) as string[];
  const summaries = {
    more: moreFilled ? [form.whatsapp_number.trim() && "WhatsApp", form.facebook_url.trim() && "Facebook", tags.length && `${tags.length} tag${tags.length > 1 ? "s" : ""}`].filter(Boolean).join(" · ") : "WhatsApp, Facebook, tags",
    place: [placeText, hasPin ? "map pinned" : ""].filter(Boolean).join(" · ") || "Division, district, area, address, map",
    biz: bizBits.join(" · ") || "Type, source, owner, deal value",
    consent: form.phone.trim() ? ([form.sms_opt_in && "SMS ✓", form.whatsapp_opt_in && "WhatsApp ✓"].filter(Boolean).join("  ") || "Not agreed") : "Needs a mobile number",
  };

  return (
    <AppLayout>
      <div className="field-form">
        <nav className="flex items-center gap-1.5 text-sm text-surface-600 mb-3">
          <Link to="/contacts" className="text-brand-600 hover:text-brand-700 font-medium">Contacts</Link>
          <ChevronRight size={14} className="text-surface-300" />
          {editing && <><Link to={`/contacts/${id}`} className="text-brand-600 hover:text-brand-700 font-medium truncate max-w-[9rem]">{name}</Link><ChevronRight size={14} className="text-surface-300" /></>}
          <span className="text-surface-900 font-medium">{editing ? "Edit" : "New"}</span>
        </nav>
        <h1 className="text-xl font-bold text-surface-900 tracking-tight">{editing ? `Edit ${name}` : "Add a contact"}</h1>
        <p className="text-sm text-surface-600 mt-1 mb-4">{editing ? "Change what you need, then save." : "Just the basics to start — add more details only if you have them."}</p>

        {added && (
          <Alert variant="success" className="mb-4" onDismiss={() => setAdded(null)}>
            <div className="flex items-center gap-2 text-sm"><Check size={16} /> <span><strong>{added.name}</strong> was added.</span> <Link to={`/contacts/${added.id}`} className="ml-auto text-brand-700 font-medium hover:underline">View</Link></div>
          </Alert>
        )}
        {error && <Alert variant="error" className="mb-4" onDismiss={() => setError(null)}>{error}</Alert>}
        {duplicate && (
          <Alert variant="warning" className="mb-4">
            <p className="text-sm font-medium">Looks like a duplicate</p>
            <p className="text-sm">{duplicate.message}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Button size="xs" onClick={() => navigate(`/contacts/${duplicate.contactId}`)}>Open existing</Button>
              <Button size="xs" variant="secondary" onClick={(e) => { setDuplicate(null); save(e as unknown as FormEvent, true); }}>Add anyway</Button>
              <Button size="xs" variant="ghost" onClick={() => setDuplicate(null)}>Dismiss</Button>
            </div>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
        <form onSubmit={save} className="space-y-3 min-w-0">
          {/* ── the essentials ── */}
          <section className="bg-white border border-surface-200 rounded-xl p-4 sm:p-5 space-y-4 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <Input label="First name" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} placeholder="Rahim" autoFocus={!editing} autoComplete="given-name" />
              <Input label="Last name" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} placeholder="Uddin" autoComplete="family-name" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Mobile number" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="01XXXXXXXXX"
                helperText={form.email.trim() ? undefined : "Add a mobile number or an email."} autoComplete="tel" />
              <Input label="Email" type="email" inputMode="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="rahim@example.com" autoComplete="email" />
            </div>
            <Input label="Shop / company" value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Rahim Fashion" autoComplete="organization" />

            {/* one-tap location for people collecting details on the ground */}
            <div className={`rounded-lg border px-3.5 py-3 ${hasPin ? "border-success-base/40 bg-success-light/40" : "border-surface-200 bg-surface-50"}`}>
              <div className="flex items-center gap-3">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${hasPin ? "bg-success-base text-white" : "bg-white text-brand-600 border border-surface-200"}`}>{hasPin ? <Check size={18} /> : <MapPin size={18} />}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-surface-900">{hasPin ? "Location saved" : "Exact location"}</p>
                  <p className="text-xs text-surface-600 truncate">{hasPin ? `${latNum!.toFixed(5)}, ${lngNum!.toFixed(5)}` : "At the shop? Pin it now."}</p>
                </div>
                <Button type="button" size="sm" variant={hasPin ? "secondary" : "primary"} loading={locating} icon={<LocateFixed size={15} />} onClick={pinHere}>{hasPin ? "Re-pin" : "Pin here"}</Button>
              </div>
              {locMsg && <p className="text-xs text-surface-600 mt-2">{locMsg}</p>}
            </div>
          </section>

          <p className="text-xs font-semibold uppercase tracking-wide text-surface-500 pt-2 px-1">More details <span className="font-normal normal-case text-surface-400">— only if you have them</span></p>

          <Disclosure icon={<ContactIcon size={18} />} title="Other contact info" summary={summaries.more} open={!!open.more} onToggle={() => toggle("more")}>
            <Input label="WhatsApp number (if different)" type="tel" inputMode="tel" value={form.whatsapp_number} onChange={(e) => set("whatsapp_number", e.target.value)} placeholder="01XXXXXXXXX" />
            <Input label="Facebook profile / page" value={form.facebook_url} onChange={(e) => set("facebook_url", e.target.value)} placeholder="https://facebook.com/…" />
            <TagInput label="Tags" value={tags} onChange={setTags} suggestions={allTags}
              onCreateNew={(n) => createTagPreset(n).then((p) => setPresets((prev) => [...prev, p])).catch(() => undefined)}
              helperText="Pick a tag or type a new one and press Enter." />
          </Disclosure>

          <Disclosure icon={<MapPin size={18} />} title="Place & map" summary={summaries.place} open={!!open.place} onToggle={() => toggle("place")}>
            <PlacePicker places={places} value={{ division: form.division, district: form.district, area: form.area }} onChange={(v) => setForm((p) => ({ ...p, ...v }))} />
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Address / delivery notes</label>
              <textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="House 5, Road 3, Dhanmondi — green gate, 2nd floor"
                className="w-full border border-surface-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-surface-700 mb-1.5">Exact location</p>
              <MapPicker lat={hasPin ? latNum : null} lng={hasPin ? lngNum : null} hint={hint} height={300}
                onChange={(a, b) => (Number.isNaN(a) ? setForm((p) => ({ ...p, latitude: "", longitude: "" })) : setForm((p) => ({ ...p, latitude: String(a), longitude: String(b) })))} />
            </div>
          </Disclosure>

          <Disclosure icon={<Briefcase size={18} />} title="Business & follow-up" summary={summaries.biz} open={!!open.biz} onToggle={() => toggle("biz")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Customer type" value={form.customer_type} onChange={(e) => set("customer_type", e.target.value)}>
                <option value="">Not set</option><option value="retail">Retail</option><option value="wholesale">Wholesale</option>
              </Select>
              <Select label="How did they find you?" value={form.source} onChange={(e) => set("source", e.target.value)}>
                <option value="">Not set</option>{SOURCES.map((k) => <option key={k} value={k}>{SOURCE_LABELS[k]}</option>)}
              </Select>
              {canAssign && (
                <Select label="Owner" value={form.owner} onChange={(e) => set("owner", e.target.value)}>
                  <option value="">{editing ? "No owner" : "Assign automatically"}</option>
                  {team.map((t) => <option key={t.user_id} value={t.user_id}>{t.email}</option>)}
                </Select>
              )}
              <Input label="Deal value (৳)" type="number" inputMode="decimal" min="0" value={form.deal_value} onChange={(e) => set("deal_value", e.target.value)} />
              <Input label="Expected close" type="date" value={form.expected_close} onChange={(e) => set("expected_close", e.target.value)} />
            </div>
            {fields.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-surface-100">
                {fields.map((d) => d.field_type === "select" ? (
                  <Select key={d.id} label={d.label} value={custom[d.key] ?? ""} onChange={(e) => setCustom((p) => ({ ...p, [d.key]: e.target.value }))}>
                    <option value="">Not set</option>{d.options.map((o) => <option key={o}>{o}</option>)}
                  </Select>
                ) : (
                  <Input key={d.id} label={d.label} type={d.field_type === "number" ? "number" : d.field_type === "date" ? "date" : "text"}
                    value={custom[d.key] ?? ""} onChange={(e) => setCustom((p) => ({ ...p, [d.key]: e.target.value }))} />
                ))}
              </div>
            )}
          </Disclosure>

          <Disclosure icon={<MessageSquareText size={18} />} title="Permission to message" summary={summaries.consent} open={!!open.consent} onToggle={() => toggle("consent")}>
            <p className="text-xs text-surface-500">Ticked by default. Untick any channel the person has not agreed to — it is saved in their consent history.</p>
            <label className={`flex items-center gap-3 min-h-[44px] text-sm text-surface-800 ${form.phone.trim() ? "" : "opacity-50"}`}><input type="checkbox" className="h-5 w-5" disabled={!form.phone.trim()} checked={form.sms_opt_in} onChange={(e) => set("sms_opt_in", e.target.checked)} /> Agreed to receive SMS</label>
            <label className={`flex items-center gap-3 min-h-[44px] text-sm text-surface-800 ${form.phone.trim() ? "" : "opacity-50"}`}><input type="checkbox" className="h-5 w-5" disabled={!form.phone.trim()} checked={form.whatsapp_opt_in} onChange={(e) => set("whatsapp_opt_in", e.target.checked)} /> Agreed to receive WhatsApp</label>
            {!form.phone.trim() && <p className="text-xs text-surface-500">Add a mobile number first.</p>}
          </Disclosure>
        </form>
        <PreviewCard form={form} tags={tags} team={team} fields={fields} custom={custom} hasPin={hasPin} lat={latNum} lng={lngNum} editing={editing} />
        </div>
      </div>

      <StickyActionBar>
        <Button type="button" variant="ghost" className="hidden sm:inline-flex" onClick={() => navigate(editing ? `/contacts/${id}` : "/contacts")}>Cancel</Button>
        <div className="flex-1" />
        {!editing && <Button type="button" variant="secondary" disabled={saving} onClick={(e) => save(e as unknown as FormEvent, false, true)}><span className="sm:hidden">Save + new</span><span className="hidden sm:inline">Save &amp; add another</span></Button>}
        <Button type="button" loading={saving} icon={<Save size={15} />} className="min-w-[7.5rem]" onClick={(e) => save(e as unknown as FormEvent)}>{editing ? "Save" : "Add contact"}</Button>
      </StickyActionBar>
      {limit && <UpgradeLimitModal {...limit} onClose={() => setLimit(null)} />}
    </AppLayout>
  );
}
