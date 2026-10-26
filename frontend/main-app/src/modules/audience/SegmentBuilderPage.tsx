import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ChevronRight, Mail, MapPin, MessageCircle, MessageSquare, Plus, Save, Sparkles, Users, X } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import MultiPick from "../../components/MultiPick";
import Spinner from "../../components/Spinner";
import TagInput from "../../components/TagInput";
import {
  createSegment, fetchSegment, fetchTagPresets, fetchTemplates, previewSegment, previewSegmentContacts, updateSegment,
  type Contact, type Segment, type SegmentMatchType, type SegmentReach, type SegmentRule, type TagPreset,
} from "../../lib/audience";
import { blankRule, fetchSegmentMeta, fetchSuggestions, GROUP_INFO, inputKind, optLabel, optValue, optionsWithCounts, ruleComplete, type FieldDef, type SegmentMeta, type SuggestionSet } from "../../lib/segments";

const box = "w-full border border-surface-200 rounded-md px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500";

function RuleValue({ rule, field, onChange, tags, sug }: { rule: SegmentRule; field: FieldDef; onChange: (patch: Partial<SegmentRule>) => void; tags: string[]; sug?: SuggestionSet }) {
  const kind = inputKind(rule.operator, field);
  const opts = optionsWithCounts(field, sug) ?? [];
  if (kind === "none") return <div className="text-xs text-surface-400 px-1 py-2">No value needed</div>;
  if (kind === "pick") return <select className={box} value={rule.value ?? ""} onChange={(e) => onChange({ value: e.target.value })}><option value="">Choose…</option>{opts.map((o) => <option key={optValue(o)} value={optValue(o)}>{optLabel(o)}</option>)}</select>;
  if (kind === "list") return opts.length
    ? <MultiPick options={opts} value={rule.values ?? []} onChange={(v) => onChange({ values: v })} placeholder="Choose one or more…" />
    : <TagInput value={rule.values ?? []} onChange={(v) => onChange({ values: v })} suggestions={field.type === "tags" ? tags : []} placeholder="Type and press Enter" />;
  if (kind === "tags") return (<><input className={box} list={`tags-${field.key}`} value={rule.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} placeholder="Tag name" /><datalist id={`tags-${field.key}`}>{tags.map((t) => <option key={t} value={t} />)}</datalist></>);
  if (kind === "days") return <div className="flex items-center gap-2"><input className={box} type="number" min="1" inputMode="numeric" value={rule.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} placeholder="30" /><span className="text-sm text-surface-500">days</span></div>;
  if (kind === "date") return <input className={box} type="date" value={rule.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} />;
  if (kind === "date2") return <div className="flex items-center gap-2"><input className={box} type="date" value={rule.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} /><span className="text-xs text-surface-500">and</span><input className={box} type="date" value={rule.value2 ?? ""} onChange={(e) => onChange({ value2: e.target.value })} /></div>;
  if (kind === "number2") return <div className="flex items-center gap-2"><input className={box} type="number" inputMode="decimal" value={rule.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} /><span className="text-xs text-surface-500">and</span><input className={box} type="number" inputMode="decimal" value={rule.value2 ?? ""} onChange={(e) => onChange({ value2: e.target.value })} /></div>;
  if (kind === "number") return <input className={box} type="number" inputMode="decimal" value={rule.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} placeholder={field.key === "deal_value" ? "Amount in ৳" : "Number"} />;
  return <input className={box} value={rule.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} placeholder="Type a value" />;
}

export default function SegmentBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const editing = !!id;
  const newTemplateRoute = useLocation().pathname.endsWith("/templates/new");
  const navigate = useNavigate();
  const startTemplateId = (useLocation().state as { templateId?: string } | null)?.templateId;
  const [templates, setTemplates] = useState<Segment[]>([]);
  const [isTemplate, setIsTemplate] = useState(newTemplateRoute);
  const [meta, setMeta] = useState<SegmentMeta | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState<SegmentRule[]>([]);
  const [match, setMatch] = useState<SegmentMatchType>("all");
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [reach, setReach] = useState<SegmentReach | null>(null);
  const [sample, setSample] = useState<Contact[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const seq = useRef(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickGroup, setPickGroup] = useState("Person");
  const [sugs, setSugs] = useState<Record<string, SuggestionSet>>({});
  const asked = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetchSegmentMeta().then((m) => { setMeta(m); setPickGroup(m.fields[0]?.group ?? "Person"); }).catch((e) => setError(e.message));
    fetchTagPresets().then((p: TagPreset[]) => setTags(p.map((t) => t.name))).catch(() => undefined);
  }, []);
  useEffect(() => { if (!id && !newTemplateRoute) fetchTemplates().then(setTemplates).catch(() => undefined); }, [id, newTemplateRoute]);
  useEffect(() => {   // arrived with "Use" on a template
    if (!startTemplateId || id) return;
    fetchSegment(startTemplateId).then((t) => { setName(t.name); setDescription(t.description ?? ""); setMatch(t.match_type); setRules(t.rules.map((r) => ({ ...r }))); }).catch(() => undefined);
  }, [startTemplateId, id]);
  useEffect(() => {
    if (!id) return;
    fetchSegment(id).then((s) => { setName(s.name); setDescription(s.description ?? ""); setRules(s.rules); setMatch(s.match_type); setIsTemplate(!!s.is_template); })
      .catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [id]);

  const byGroup = useMemo(() => {
    const m = new Map<string, FieldDef[]>();
    meta?.fields.forEach((f) => m.set(f.group, [...(m.get(f.group) ?? []), f]));
    return [...m.entries()];
  }, [meta]);
  const ready = rules.filter((r) => ruleComplete(r, meta));
  const allReady = ready.length === rules.length && rules.length > 0;

  // live preview, debounced
  const sig = JSON.stringify([ready, match]);
  useEffect(() => {
    if (!meta) return;
    if (ready.length === 0) { setCount(null); setReach(null); setSample([]); return; }
    const my = ++seq.current;
    setPreviewing(true);
    const t = setTimeout(() => {
      Promise.all([previewSegment(ready, match), previewSegmentContacts(ready, match)])
        .then(([p, c]) => { if (my === seq.current) { setCount(p.count); setReach(p.reach); setSample(c.slice(0, 8)); setPreviewError(""); } })
        .catch((e) => { if (my === seq.current) setPreviewError(e.message); })
        .finally(() => { if (my === seq.current) setPreviewing(false); });
    }, 400);
    return () => clearTimeout(t);
  }, [sig, meta]);  // eslint-disable-line react-hooks/exhaustive-deps

  // load "what already exists" for every field in use
  useEffect(() => {
    rules.forEach((r) => {
      if (asked.current.has(r.field)) return;
      asked.current.add(r.field);
      fetchSuggestions(r.field).then((v) => setSugs((m) => ({ ...m, [r.field]: v })));
    });
  }, [rules]);
  const addRule = (f: FieldDef) => {
    setRules((rs) => [...rs, { ...blankRule(), field: f.key, operator: f.operators[0], value: f.type === "bool" ? null : "" }]);
    setPickerOpen(false);
  };
  const patch = (i: number, p: Partial<SegmentRule>) => setRules((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const changeField = (i: number, key: string) => {
    const f = meta!.fields.find((x) => x.key === key)!;
    setRules((rs) => rs.map((r, k) => (k === i ? { field: key, operator: f.operators[0], value: "", value2: null, values: null } : r)));
  };
  const changeOp = (i: number, op: string) => patch(i, { operator: op, value: "", value2: null, values: null });
  const applyTemplate = useCallback((t: Segment) => { setName(t.name); setDescription(t.description ?? ""); setMatch(t.match_type); setRules(t.rules.map((r) => ({ ...r }))); }, []);

  async function save() {
    if (name.trim().length < 2) { setError("Give the segment a name (at least 2 letters)."); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (rules.length === 0) { setError("Add at least one rule — what should these contacts have in common?"); return; }
    if (!allReady) { setError("Finish or remove the incomplete rules first."); return; }
    setSaving(true); setError(null);
    try {
      const s = editing ? await updateSegment(id!, name.trim(), rules, match, description.trim()) : await createSegment(name.trim(), rules, match, description.trim(), isTemplate);
      navigate(isTemplate ? "/segments?tab=templates" : `/segments/${s.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save"); setSaving(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }

  if (loading || !meta) return <AppLayout>{error ? <Alert variant="error">{error}</Alert> : <div className="flex justify-center py-20"><Spinner size="lg" /></div>}</AppLayout>;
  const lastHint = count === 0 && rules.length > 1 && match === "all" ? "Nobody matches all of these rules together. Try “any”, or remove the last rule." : count === 0 ? "Nobody matches yet. Loosen the rule." : "";

  return (
    <AppLayout>
      <nav className="flex items-center gap-1.5 text-sm text-surface-600 mb-3">
        <Link to="/segments" className="text-brand-600 hover:text-brand-700 font-medium">Segments</Link><ChevronRight size={14} className="text-surface-300" />
        <span className="text-surface-900 font-medium">{isTemplate ? "Template" : editing ? "Edit" : "New segment"}</span>
      </nav>
      <div className="sticky -top-3 sm:-top-5 lg:-top-6 z-20 -mx-3 sm:-mx-5 lg:-mx-6 px-3 sm:px-5 lg:px-6 pt-3 sm:pt-5 lg:pt-6 pb-2.5 mb-4 bg-surface-50 border-b border-surface-200 flex items-center gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-bold text-surface-900 tracking-tight leading-tight truncate">{isTemplate ? (editing ? "Edit template" : "New template") : editing ? "Edit segment" : "Create a segment"}</h1>
          <p className="text-xs text-surface-500 truncate">{isTemplate ? "A starting point on the Templates tab — not used for sending." : count != null ? `${count} contact${count === 1 ? "" : "s"} match right now` : "Add a rule to see who matches"}</p>
        </div>
        <Button variant="ghost" size="sm" className="flex-shrink-0" onClick={() => navigate(isTemplate ? "/segments?tab=templates" : editing ? `/segments/${id}` : "/segments")}>Cancel</Button>
        <Button size="sm" className="flex-shrink-0" loading={saving} icon={<Save size={15} />} onClick={save}><span className="sm:hidden">{editing || isTemplate ? "Save" : "Create"}</span><span className="hidden sm:inline">{isTemplate ? "Save template" : editing ? "Save changes" : "Create segment"}</span></Button>
      </div>
      {error && <Alert variant="error" className="mb-4" onDismiss={() => setError(null)}>{error}</Alert>}

      {!editing && !isTemplate && templates.length > 0 && (
        <div className="mb-4 bg-white border border-surface-200 rounded-[4px] p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-surface-500 flex items-center gap-1.5 mb-2"><Sparkles size={13} className="text-brand-500" />Start from a ready-made segment</p>
          <div className="flex flex-wrap sm:flex-nowrap gap-1.5">
            {templates.map((t) => <button key={t.name} type="button" onClick={() => applyTemplate(t)} title={t.description ?? undefined}
              className="sm:flex-1 sm:min-w-0 sm:truncate px-2 py-1.5 rounded-sm border border-surface-200 text-xs font-medium text-surface-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-colors">{t.name}</button>)}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start pb-2">
        <div className="space-y-4 min-w-0">

          <section className="bg-white border border-surface-200 rounded-[4px] p-4 sm:p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-surface-600">{isTemplate ? "Template name" : "Segment name"}</label>
              <input className={`${box} text-base font-medium`} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="e.g. Dhaka wholesale customers" autoFocus={!editing} />
            </div>
            <div>
              <label className="text-xs font-medium text-surface-600">Note <span className="text-surface-400 font-normal">(optional — helps your team know what this is for)</span></label>
              <input className={box} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="e.g. For the Eid wholesale offer" />
            </div>
          </section>

          <section className="bg-white border border-surface-200 rounded-[4px]">
            <header className="flex items-center justify-between gap-3 flex-wrap px-4 sm:px-5 py-3 border-b border-surface-100">
              <p className="text-sm font-semibold text-surface-900">Who should be in it?</p>
              {rules.length > 1 && (
                <div className="flex items-center gap-2 text-sm text-surface-600">
                  Match
                  <div className="inline-flex bg-surface-100 p-0.5 rounded-sm" role="group" aria-label="Match all or any">
                    {(["all", "any"] as const).map((m) => <button key={m} type="button" onClick={() => setMatch(m)} className={`px-3 py-1 rounded-sm text-xs font-semibold ${match === m ? "bg-white shadow-sm text-brand-700" : "text-surface-600"}`}>{m === "all" ? "ALL" : "ANY"}</button>)}
                  </div>
                  of these rules
                </div>
              )}
            </header>
            <div className="p-3 sm:p-4 space-y-3">
              {rules.map((r, i) => {
                const f = meta.fields.find((x) => x.key === r.field);
                const info = GROUP_INFO[f?.group ?? ""];
                const sg = sugs[r.field];
                const kind = f ? inputKind(r.operator, f) : "text";
                const chips = (sg?.values ?? []).filter(() => !(f?.options?.length)).slice(0, 8);   // pick-lists already show counts inside the dropdown
                const toggled = (v: string) => (kind === "list" ? !!r.values?.includes(v) : (r.value ?? "") === v);
                return (
                  <div key={i} className="rounded-sm border border-surface-200 bg-white">
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-surface-50 border-b border-surface-100 rounded-t-sm">
                      <span className="inline-flex items-center gap-2 text-xs font-semibold text-surface-700">
                        <span className={`w-2 h-2 rounded-full ${info?.dot ?? "bg-surface-400"}`} />{f?.group ?? "Rule"}
                        {i > 0 && <span className="text-[10px] font-bold tracking-wider text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-sm">{match === "all" ? "AND" : "OR"}</span>}
                      </span>
                      <button type="button" onClick={() => setRules((rs) => rs.filter((_, k) => k !== i))} aria-label="Remove rule" className="p-1 rounded-sm text-surface-400 hover:text-danger-base hover:bg-white"><X size={14} /></button>
                    </div>
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] gap-2 items-start">
                      <select className={box} value={r.field} onChange={(e) => changeField(i, e.target.value)} aria-label="Field">
                        {byGroup.map(([g, fs]) => <optgroup key={g} label={g}>{fs.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>)}
                      </select>
                      <select className={box} value={r.operator} onChange={(e) => changeOp(i, e.target.value)} aria-label="Condition">
                        {f?.operators.map((op) => <option key={op} value={op}>{meta.operators[op] ?? op}</option>)}
                      </select>
                      {f ? <RuleValue rule={r} field={f} onChange={(p) => patch(i, p)} tags={tags} sug={sg} /> : <div />}
                    </div>
                    {(chips.length > 0 || sg?.hint) && kind !== "none" && (
                      <div className="px-3 pb-3 -mt-1">
                        {sg?.hint && <p className="text-xs text-surface-500 mb-1.5">{sg.hint}</p>}
                        {chips.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-surface-500">In your contacts:</span>
                            {chips.map((v) => (
                              <button key={v.value} type="button" onClick={() => patch(i, kind === "list" ? { values: toggled(v.value) ? (r.values ?? []).filter((x) => x !== v.value) : [...(r.values ?? []), v.value] } : { value: v.value })}
                                className={`px-2 py-0.5 rounded-sm border text-xs transition-colors ${toggled(v.value) ? "bg-brand-500 border-brand-500 text-white" : "bg-white border-surface-200 text-surface-700 hover:border-brand-300 hover:bg-brand-50"}`}>
                                {v.label} <span className={toggled(v.value) ? "text-white/80" : "text-surface-400"}>· {v.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {!ruleComplete(r, meta) && <p className="flex items-center gap-1 text-[11px] text-warning-dark px-3 pb-2 -mt-1"><AlertCircle size={11} />Fill this in to include it</p>}
                  </div>
                );
              })}

              {/* add a rule: pick what to filter by, grouped */}
              {(pickerOpen || rules.length === 0) ? (
                <div className="rounded-sm border border-brand-200 bg-brand-50/30">
                  <div className="flex items-center justify-between px-3 pt-2.5">
                    <p className="text-sm font-semibold text-surface-900">{rules.length ? "Add another rule" : "What do you want to filter by?"}</p>
                    {rules.length > 0 && <button type="button" onClick={() => setPickerOpen(false)} className="p-1 text-surface-400 hover:text-surface-700" aria-label="Close"><X size={15} /></button>}
                  </div>
                  <div className="flex flex-wrap gap-1 px-3 pt-2" role="tablist">
                    {byGroup.map(([g]) => (
                      <button key={g} type="button" role="tab" aria-selected={pickGroup === g} onClick={() => setPickGroup(g)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold whitespace-nowrap border ${pickGroup === g ? "bg-white border-brand-300 text-brand-700 shadow-sm" : "border-transparent text-surface-600 hover:bg-white/70"}`}>
                        <span className={`w-2 h-2 rounded-full ${GROUP_INFO[g]?.dot ?? "bg-surface-400"}`} />{g === "Your extra fields" ? "Your fields" : g}
                      </button>
                    ))}
                  </div>
                  <div className="px-3 pb-3 pt-2">
                    <p className="text-xs text-surface-500 mb-2">{GROUP_INFO[pickGroup]?.blurb}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(byGroup.find(([g]) => g === pickGroup)?.[1] ?? []).map((fd) => (
                        <button key={fd.key} type="button" onClick={() => addRule(fd)} className="px-3 py-1.5 rounded-sm bg-white border border-surface-200 text-sm text-surface-800 hover:border-brand-400 hover:bg-brand-50 transition-colors">
                          <Plus size={12} className="inline -mt-0.5 mr-1 text-brand-500" />{fd.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 px-1 py-1"><Plus size={15} />Add another rule</button>
              )}
            </div>
          </section>
        </div>

        {/* live preview */}
        <aside className="lg:sticky lg:top-3 space-y-3 min-w-0">
          <div className="bg-white border border-surface-200 rounded-[4px] overflow-hidden shadow-sm">
            <div className="p-4 bg-gradient-to-br from-brand-50 to-white border-b border-surface-100">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-surface-500">Live preview</p>
              <div className="flex items-end gap-2 mt-1">
                <span className={`text-4xl font-bold leading-none ${count === 0 ? "text-surface-400" : "text-surface-900"}`}>{count ?? "—"}</span>
                <span className="text-sm text-surface-600 pb-0.5">{count === 1 ? "contact matches" : "contacts match"}</span>
                {previewing && <Spinner size="sm" />}
              </div>
              {previewError && <p className="text-xs text-danger-dark mt-1">{previewError}</p>}
              {lastHint && <p className="text-xs text-warning-dark mt-2">{lastHint}</p>}
              {count === null && <p className="text-xs text-surface-500 mt-2">Complete a rule to see who matches.</p>}
            </div>
            {reach && count! > 0 && (
              <div className="px-4 py-3 border-b border-surface-100">
                <p className="text-xs font-medium text-surface-700 mb-2">Who you can actually reach</p>
                {([["Email", reach.email, <Mail key="e" size={13} />], ["SMS (agreed)", reach.sms, <MessageSquare key="s" size={13} />], ["WhatsApp (agreed)", reach.whatsapp, <MessageCircle key="w" size={13} />], ["Map pin", reach.located, <MapPin key="m" size={13} />]] as const).map(([label, n, icon]) => (
                  <div key={label} className="mb-1.5 last:mb-0">
                    <div className="flex items-center justify-between text-xs"><span className="inline-flex items-center gap-1.5 text-surface-600">{icon}{label}</span><span className="font-semibold text-surface-800">{n}</span></div>
                    <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden mt-0.5"><div className="h-full bg-brand-400 rounded-full transition-all" style={{ width: `${reach.total ? (n / reach.total) * 100 : 0}%` }} /></div>
                  </div>
                ))}
                {reach.sms < reach.phone && <p className="text-[11px] text-surface-500 mt-2">{reach.phone - reach.sms} with a number haven’t agreed to SMS, so SMS campaigns skip them.</p>}
              </div>
            )}
            <div className="px-2 py-1.5">
              {sample.length > 0 ? (
                <ul className="divide-y divide-surface-100">
                  {sample.map((c) => (
                    <li key={c.id} className="flex items-center gap-2.5 px-2 py-2">
                      <span className="w-7 h-7 rounded-full bg-brand-50 text-brand-600 text-[11px] font-bold flex items-center justify-center uppercase flex-shrink-0">{((c.first_name?.[0] ?? "") + (c.last_name?.[0] ?? "")) || (c.company?.[0] ?? c.email?.[0] ?? "?")}</span>
                      <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium text-surface-900 truncate">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || c.email || c.phone}</span><span className="block text-[11px] text-surface-500 truncate">{c.phone ?? c.email}</span></span>
                    </li>
                  ))}
                  {count! > sample.length && <li className="px-2 py-2 text-xs text-surface-500">+ {count! - sample.length} more</li>}
                </ul>
              ) : <div className="py-4 text-center text-xs text-surface-400"><Users size={20} className="mx-auto mb-1 text-surface-300" />People who match will appear here</div>}
            </div>
          </div>
        </aside>
      </div>

    </AppLayout>
  );
}
