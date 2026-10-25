import { useEffect, useState } from "react";
import { Check, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Spinner from "../../components/Spinner";
import { deletePreset, fetchPermissionCatalog, fetchPresets, ROLE_INFO, savePreset, type AccessPreset, type PermissionCatalog, type TeamMember } from "../../lib/team";

const BUILTIN = ["owner", "admin", "member", "sales"] as const;
const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

function Chips({ keys, cat, full }: { keys: string[]; cat: PermissionCatalog; full?: boolean }) {
  if (full) return <span className="text-xs font-medium text-success-dark">Full access to everything</span>;
  if (!keys.length) return <span className="text-xs text-surface-400">No areas</span>;
  return <span className="flex flex-wrap gap-1">{keys.map((k) => <span key={k} className="px-1.5 py-0.5 rounded-[3px] bg-surface-100 text-[11px] text-surface-700">{cat.catalog.find((c) => c.key === k)?.label ?? k}</span>)}</span>;
}

export default function RolesTab({ members, canEdit }: { members: TeamMember[]; canEdit: boolean }) {
  const [cat, setCat] = useState<PermissionCatalog | null>(null);
  const [presets, setPresets] = useState<AccessPreset[]>([]);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<{ id: string | null; name: string; perms: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { Promise.all([fetchPermissionCatalog(), fetchPresets()]).then(([c, p]) => { setCat(c); setPresets(p); }).catch((e) => setError(e.message)); }, []);
  if (error) return <Alert variant="error">{error}</Alert>;
  if (!cat) return <div className="flex justify-center py-12"><Spinner /></div>;

  const countPreset = (p: AccessPreset) => members.filter((m) => m.role === "member" && m.custom_permissions && same(m.permissions, p.permissions)).length;

  const save = async () => {
    if (!edit || !edit.name.trim()) return;
    setBusy(true); setError("");
    try {
      const saved = await savePreset(edit.name.trim(), edit.perms);
      let next = presets.filter((x) => x.id !== saved.id);
      if (edit.id && edit.id !== saved.id) { await deletePreset(edit.id); next = next.filter((x) => x.id !== edit.id); }
      setPresets([...next, saved].sort((a, b) => a.name.localeCompare(b.name))); setEdit(null);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const remove = async (p: AccessPreset) => {
    if (!confirm(`Delete the role “${p.name}”? People who already have this access keep it.`)) return;
    try { await deletePreset(p.id); setPresets((x) => x.filter((y) => y.id !== p.id)); } catch (e: any) { setError(e.message); }
  };
  const toggle = (k: string) => setEdit((e) => e && ({ ...e, perms: e.perms.includes(k) ? e.perms.filter((x) => x !== k) : [...e.perms, k] }));

  return (
    <div className="space-y-5">
      <section className="bg-white border border-surface-200 rounded-[4px]">
        <header className="px-4 py-3 border-b border-surface-100"><h2 className="text-sm font-semibold text-surface-900">Built-in roles</h2><p className="text-xs text-surface-500">Every person has one of these. These can’t be changed — create a custom role below for anything else.</p></header>
        <ul className="divide-y divide-surface-100">
          {BUILTIN.map((r) => (
            <li key={r} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
              <div className="sm:w-56 flex-shrink-0"><p className="text-sm font-semibold text-surface-900 flex items-center gap-1.5">{ROLE_INFO[r].label}<Lock size={11} className="text-surface-300" /></p>
                <p className="text-xs text-surface-500">{ROLE_INFO[r].blurb}</p></div>
              <div className="flex-1 min-w-0"><Chips keys={cat.role_defaults[r] ?? []} cat={cat} full={r === "owner" || r === "admin"} /></div>
              <p className="text-xs text-surface-500 sm:w-24 sm:text-right">{members.filter((m) => m.role === r).length === 1 ? "1 person" : `${members.filter((m) => m.role === r).length} people`}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white border border-surface-200 rounded-[4px]">
        <header className="px-4 py-3 border-b border-surface-100 flex items-center justify-between gap-3">
          <div><h2 className="text-sm font-semibold text-surface-900">Custom roles</h2><p className="text-xs text-surface-500">Named access sets such as “Telesales”. Pick one when adding or editing a team member.</p></div>
          {canEdit && !edit && <Button size="sm" onClick={() => setEdit({ id: null, name: "", perms: [] })}><Plus size={14} /> New role</Button>}
        </header>

        {edit && (
          <div className="p-4 border-b border-surface-100 bg-surface-50/60 space-y-3">
            <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={60} placeholder="Role name, e.g. Telesales" className="w-full sm:max-w-sm border border-surface-300 rounded-[3px] px-3 py-2 text-base sm:text-sm" />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5">
              {cat.catalog.map((c) => (
                <label key={c.key} className={`flex items-start gap-2 border rounded-[3px] px-2.5 py-2 text-sm cursor-pointer bg-white ${edit.perms.includes(c.key) ? "border-brand-300" : "border-surface-200"}`}>
                  <input type="checkbox" className="mt-0.5" checked={edit.perms.includes(c.key)} onChange={() => toggle(c.key)} />
                  <span><span className="font-medium text-surface-800">{c.label}</span><span className="block text-xs text-surface-500">{c.description}</span></span>
                </label>
              ))}
            </div>
            <div className="flex gap-2"><Button size="sm" loading={busy} disabled={!edit.name.trim() || !edit.perms.length} onClick={save}><Check size={14} /> Save role</Button><Button size="sm" variant="secondary" onClick={() => setEdit(null)}><X size={14} /> Cancel</Button></div>
          </div>
        )}

        {presets.length === 0 && !edit ? <p className="p-8 text-center text-sm text-surface-500">No custom roles yet.{canEdit && " Create one for a job like Telesales or Page admin."}</p> : (
          <ul className="divide-y divide-surface-100">
            {presets.map((p) => (
              <li key={p.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                <div className="sm:w-56 flex-shrink-0"><p className="text-sm font-semibold text-surface-900">{p.name}</p><p className="text-xs text-surface-500">{countPreset(p)} {countPreset(p) === 1 ? "person uses" : "people use"} exactly this</p></div>
                <div className="flex-1 min-w-0"><Chips keys={p.permissions} cat={cat} /></div>
                {canEdit && <div className="flex gap-1 sm:w-24 sm:justify-end">
                  <button aria-label={`Edit ${p.name}`} onClick={() => setEdit({ id: p.id, name: p.name, perms: p.permissions })} className="p-1.5 text-surface-500 hover:text-brand-600"><Pencil size={14} /></button>
                  <button aria-label={`Delete ${p.name}`} onClick={() => remove(p)} className="p-1.5 text-surface-500 hover:text-danger-dark"><Trash2 size={14} /></button>
                </div>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-surface-500">Need one person to differ? Open them under People and tick or untick areas — that overrides their role for just them.</p>
    </div>
  );
}
