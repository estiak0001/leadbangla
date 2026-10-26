import { useEffect, useState } from "react";
import { X } from "lucide-react";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import { PlanLimitError } from "../../lib/planLimit";
import {
  deletePreset, fetchPermissionCatalog, fetchPresets, generatePassword, inviteMember, resetMemberPassword, savePreset, patchMember, removeMember, ROLE_INFO,
  type AccessPreset, type PermissionCatalog, type TeamMember,
} from "../../lib/team";

const field = "w-full border border-surface-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500";

export default function MemberDialog({ member, myRole, onClose, onDone, onLimit }: {
  member: TeamMember | null; myRole: string; onClose: () => void;
  onDone: (notice?: { text: string; link?: string; secret?: string }) => void;
  onLimit: (l: { resource: string; current: number; limit: number }) => void;
}) {
  const editing = member !== null;
  const roles = myRole === "owner" ? ["owner", "admin", "member", "sales"] : ["member", "sales"];
  const [cat, setCat] = useState<PermissionCatalog | null>(null);
  const [email, setEmail] = useState(member?.email ?? "");
  const [title, setTitle] = useState(member?.job_title ?? "");
  const [role, setRole] = useState<string>(member?.role ?? "member");
  const [custom, setCustom] = useState(member?.custom_permissions ?? false);
  const [perms, setPerms] = useState<string[]>(member?.permissions ?? []);
  const [active, setActive] = useState(member?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [presets, setPresets] = useState<AccessPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetId, setPresetId] = useState<string>("");
  const [method, setMethod] = useState<"invite" | "set">("invite");
  const [newPassword, setNewPassword] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPw, setResetPw] = useState("");

  useEffect(() => { fetchPresets().then(setPresets).catch(() => undefined); }, []);
  useEffect(() => { fetchPermissionCatalog().then(setCat).catch((e) => setError(e.message)); }, []);
  const fullAccess = role === "owner" || role === "admin";
  const defaults = cat?.role_defaults[role] ?? [];
  const shown = fullAccess ? (cat?.catalog.map((c) => c.key) ?? []) : custom ? perms : defaults;

  const toggle = (k: string) => {
    if (!custom) { setCustom(true); setPerms(defaults.includes(k) ? defaults.filter((x) => x !== k) : [...defaults, k]); return; }
    setPerms((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  };

  const applyPreset = (id: string) => { const p = presets.find((x) => x.id === id); if (p) { setCustom(true); setPerms(p.permissions); } };
  const storePreset = async () => {
    if (!presetName.trim()) return;
    setSavingPreset(true); setError("");
    try { const p = await savePreset(presetName.trim(), shown); setPresets((prev) => [...prev.filter((x) => x.id !== p.id), p]); setPresetName(""); }
    catch (e: any) { setError(e.message); } finally { setSavingPreset(false); }
  };

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); }
    catch (e: any) { if (e instanceof PlanLimitError) onLimit({ resource: e.resource, current: e.current, limit: e.limit }); else setError(e.message); }
    finally { setBusy(false); }
  };

  const save = () => guard(async () => {
    const chosen = presets.find((p) => p.id === presetId);
    const permissions = !editing && chosen ? chosen.permissions : fullAccess || !custom ? null : perms;
    if (editing) {
      const patch: Record<string, unknown> = { job_title: title, permissions };
      if (role !== member!.role) patch.role = role;
      if (active !== member!.is_active) patch.is_active = active;
      await patchMember(member!.user_id, patch);
      onDone({ text: `Saved changes for ${member!.email}.` });
    } else {
      const r = await inviteMember({ email: email.trim(), role, permissions, job_title: title.trim() || undefined, password_mode: method, password: method === "set" ? newPassword : undefined });
      if (r.temporary_password) { onDone({ text: `Account created for ${r.email}. Give them this temporary password — it is shown only now. They must choose their own at first sign-in.`, secret: r.temporary_password }); return; }
      onDone(r.invite_sent ? { text: `Invite email sent to ${r.email}. They set a password and can sign in.` }
        : { text: `${r.email} was added, but we couldn't send the email. Share this sign-up link with them:`, link: r.invite_link ?? undefined });
    }
  });

  const reset = (mode: "link" | "set") => guard(async () => {
    const r = await resetMemberPassword(member!.user_id, { mode, password: mode === "set" ? resetPw : undefined });
    if (r.temporary_password) onDone({ text: `New temporary password for ${member!.email}. It is shown only now. They must choose their own at next sign-in.`, secret: r.temporary_password });
    else onDone(r.invite_sent ? { text: `Password reset link emailed to ${member!.email}.` } : { text: `We couldn't send the email. Share this reset link with ${member!.email}:`, link: r.invite_link ?? undefined });
  });

  const remove = () => guard(async () => {
    const r = await removeMember(member!.user_id);
    onDone({ text: `${member!.email} was removed. ${r.leads_unassigned} lead(s) are now unassigned and ${r.tasks_reassigned} open task(s) moved to you.` });
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-[6px] shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col animate-slide-up" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-surface-100">
          <h2 className="font-semibold text-surface-900">{editing ? member!.email : "Add a person"}</h2>
          <button onClick={onClose} className="p-1 rounded text-surface-400 hover:bg-surface-100" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-4 py-4 space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          {!editing && (
            <div>
              <label className="text-sm font-medium text-surface-700">Work email</label>
              <input className={field} type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="employee@yourshop.com" />
            </div>
          )}
          {!editing && (
            <div>
              <p className="text-sm font-medium text-surface-700 mb-1.5">How do they get in?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([["invite", "Email an invite link", "They choose their own password."], ["set", "I'll create the password", "Hand it over yourself — no email needed."]] as const).map(([k, l, d]) => (
                  <label key={k} className={`flex items-start gap-2 border rounded-md px-3 py-2 cursor-pointer ${method === k ? "border-brand-300 bg-brand-50/50" : "border-surface-200 hover:bg-surface-50"}`}>
                    <input type="radio" name="method" className="mt-1" checked={method === k} onChange={() => setMethod(k)} />
                    <span><span className="block text-sm font-medium text-surface-800">{l}</span><span className="block text-xs text-surface-500">{d}</span></span>
                  </label>
                ))}
              </div>
              {method === "set" && (
                <div className="flex gap-2 mt-2">
                  <input className={field} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Temporary password (blank = generate one)" autoComplete="off" />
                  <Button size="sm" variant="secondary" onClick={() => setNewPassword(generatePassword())}>Generate</Button>
                </div>
              )}
              {method === "set" && <p className="text-xs text-surface-500 mt-1">At least 8 characters. They will be asked to change it the first time they sign in.</p>}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-surface-700">Job title (optional)</label>
              <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Telesales, Page admin…" maxLength={100} />
            </div>
            <div>
              <label className="text-sm font-medium text-surface-700">Role</label>
              <select className={field} value={presetId ? `preset:${presetId}` : role} onChange={(e) => {
                const v = e.target.value; setCustom(false);
                if (v.startsWith("preset:")) { setPresetId(v.slice(7)); setRole("member"); } else { setPresetId(""); setRole(v); }
              }}>
                {roles.map((r) => <option key={r} value={r}>{ROLE_INFO[r].label}</option>)}
                {!editing && presets.length > 0 && <optgroup label="Custom roles">{presets.map((p) => <option key={p.id} value={`preset:${p.id}`}>{p.name}</option>)}</optgroup>}
                {!roles.includes(role) && <option value={role}>{ROLE_INFO[role].label}</option>}
              </select>
            </div>
          </div>
          <p className="text-xs text-surface-500 -mt-2">{presetId ? "Custom role — access is set by the role. Change it under Team → Roles." : ROLE_INFO[role]?.blurb}</p>
          {!editing && (() => { const keys = presetId ? presets.find((p) => p.id === presetId)?.permissions ?? [] : fullAccess ? null : defaults; return (
            <div className="border border-surface-200 rounded-[3px] bg-surface-50/60 px-3 py-2">
              <p className="text-xs font-medium text-surface-700 mb-1">They will be able to open</p>
              {keys === null ? <p className="text-xs text-success-dark">Everything</p> : <div className="flex flex-wrap gap-1">{keys.map((k) => <span key={k} className="px-1.5 py-0.5 rounded-[3px] bg-white border border-surface-200 text-[11px] text-surface-700">{cat?.catalog.find((c) => c.key === k)?.label ?? k}</span>)}</div>}
            </div>); })()}

          {editing && (<>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-medium text-surface-700">What can they open?</p>
              {!fullAccess && custom && <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => setCustom(false)}>Reset to role default</button>}
            </div>
            {fullAccess ? <p className="text-xs text-surface-500 mb-2">Owners and admins can open everything.</p> : <p className="text-xs text-surface-500 mb-2">{custom ? "Custom access for this person." : "Using the role’s default. Tick or untick to customise."}</p>}
            {!fullAccess && (
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <span className="text-xs text-surface-500">{presets.length ? "Presets:" : "No saved presets yet — tick boxes and save one below."}</span>
                {presets.map((p) => (
                  <span key={p.id} className="inline-flex items-center rounded-full border border-surface-200 bg-white text-xs">
                    <button type="button" onClick={() => applyPreset(p.id)} className="pl-2.5 pr-1.5 py-1 text-surface-700 hover:text-brand-600">{p.name}</button>
                    <button type="button" aria-label={`Delete preset ${p.name}`} onClick={() => deletePreset(p.id).then(() => setPresets((x) => x.filter((y) => y.id !== p.id))).catch((e) => setError(e.message))}
                      className="pr-2 py-1 text-surface-400 hover:text-danger-base">×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {cat?.catalog.map((c) => (
                <label key={c.key} className={`flex items-start gap-2 border rounded-md px-2.5 py-2 text-sm ${fullAccess ? "opacity-60" : "cursor-pointer hover:bg-surface-50"} ${shown.includes(c.key) ? "border-brand-200 bg-brand-50/40" : "border-surface-200"}`}>
                  <input type="checkbox" className="mt-0.5" disabled={fullAccess} checked={shown.includes(c.key)} onChange={() => toggle(c.key)} />
                  <span><span className="font-medium text-surface-800">{c.label}</span><span className="block text-xs text-surface-500">{c.description}</span></span>
                </label>
              ))}
            </div>
          </div>

          {!fullAccess && (
            <div className="flex gap-2">
              <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Save this access as a preset (e.g. Telesales)" maxLength={60} className={field} />
              <Button size="sm" variant="secondary" loading={savingPreset} disabled={!presetName.trim()} onClick={storePreset}>Save preset</Button>
            </div>
          )}
          </>)}

          {editing && (
            <div className="flex items-center justify-between border border-surface-200 rounded-md px-3 py-2.5">
              <div><p className="text-sm font-medium text-surface-800">Access to LeadBangla</p><p className="text-xs text-surface-500">Switch off to block sign-in without deleting anything (e.g. on leave).</p></div>
              <input type="checkbox" className="h-5 w-5" checked={active} onChange={(e) => setActive(e.target.checked)} aria-label="Access on" />
            </div>
          )}

          {editing && (
            <div className="border-t border-surface-100 pt-3">
              <p className="text-sm font-medium text-surface-700 mb-1.5">Password</p>
              <div className="flex flex-wrap gap-2">
                <Button size="xs" variant="secondary" loading={busy} onClick={() => reset("link")}>Email a reset link</Button>
                <Button size="xs" variant="secondary" onClick={() => setResetOpen((o) => !o)}>Set a new password…</Button>
              </div>
              {resetOpen && (
                <div className="flex gap-2 mt-2">
                  <input className={field} value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="New temporary password (blank = generate one)" autoComplete="off" />
                  <Button size="sm" variant="secondary" onClick={() => setResetPw(generatePassword())}>Generate</Button>
                  <Button size="sm" loading={busy} onClick={() => reset("set")}>Set</Button>
                </div>
              )}
            </div>
          )}

          {editing && (
            <div className="border-t border-surface-100 pt-3">
              {confirmRemove ? (
                <Alert variant="warning">
                  <p className="text-sm">Remove {member!.email}? Their leads become unassigned and their open tasks move to you. This can’t be undone.</p>
                  <div className="flex gap-2 mt-2"><Button size="xs" variant="danger" loading={busy} onClick={remove}>Yes, remove</Button><Button size="xs" variant="secondary" onClick={() => setConfirmRemove(false)}>Keep</Button></div>
                </Alert>
              ) : <button type="button" onClick={() => setConfirmRemove(true)} className="text-sm text-danger-dark hover:underline">Remove from company…</button>}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3.5 border-t border-surface-100">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={busy} disabled={!editing && !email.trim()} onClick={save}>{editing ? "Save changes" : method === "set" ? "Create account" : "Send invite"}</Button>
        </div>
      </div>
    </div>
  );
}
