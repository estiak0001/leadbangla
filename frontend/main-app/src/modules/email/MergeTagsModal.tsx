import { FormEvent, useState } from "react";
import { Check, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import Input from "../../components/Input";
import { useConfirm } from "../../components/ConfirmDialog";
import { BUILTIN_TAGS, createMergeTag, deleteMergeTag, updateMergeTag, type MergeTag } from "../../lib/mergeTags";

interface Props {
  tags: MergeTag[];
  onChange: (tags: MergeTag[]) => void;
  onInsert: (tag: string) => void;
  onClose: () => void;
}

/** Add / edit / delete the org's own merge tags (e.g. shop_name). The four
 * built-in contact tags are listed read-only and their names are reserved. */
export default function MergeTagsModal({ tags, onChange, onInsert, onClose }: Props) {
  const confirmAsk = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  const custom = tags.filter((t) => !t.builtin);
  const normalizedNew = newKey.trim().toLowerCase().replace(/^\{\{|\}\}$/g, "").trim();
  const reserved = BUILTIN_TAGS.some((b) => b.key === normalizedNew);
  const duplicate = custom.some((t) => t.key === normalizedNew);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
  }

  const saveValue = (existing: MergeTag, value: string) =>
    run(async () => {
      const u = await updateMergeTag(existing.id, { value });
      onChange(tags.map((t) => (t.id === u.id ? u : t)));
      setEditId(null);
    });

  const remove = (t: MergeTag) =>
    run(async () => {
      if (!(await confirmAsk({ title: "Delete this tag?", message: <>Emails that use <code className="font-mono bg-surface-100 px-1 rounded">{`{{${t.key}}}`}</code> will show a blank in its place.</>, confirmLabel: "Delete tag", tone: "danger", icon: "delete" }))) return;
      await deleteMergeTag(t.id);
      onChange(tags.filter((x) => x.id !== t.id));
    });

  function add(e: FormEvent) {
    e.preventDefault();
    if (reserved) { setError(`{{${normalizedNew}}} is a built-in contact tag — choose a different name.`); return; }
    if (duplicate) { setError(`A tag named {{${normalizedNew}}} already exists.`); return; }
    run(async () => {
      const created = await createMergeTag(newKey, newVal);
      onChange([...tags, created]);
      setNewKey(""); setNewVal("");
    });
  }

  // A plain render helper (not a component) so the input keeps focus while typing.
  function editRow(existing: MergeTag, placeholder: string) {
    const id = existing.id;
    return editId === id ? (
      <span className="flex items-center gap-1.5 flex-1 min-w-0">
        <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveValue(existing, editVal); } if (e.key === "Escape") setEditId(null); }}
          className="flex-1 min-w-0 rounded border border-surface-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
        <button type="button" disabled={busy} onClick={() => saveValue(existing, editVal)} className="p-1 rounded text-success-dark hover:bg-success-light" aria-label="Save"><Check size={14} /></button>
        <button type="button" onClick={() => setEditId(null)} className="p-1 rounded text-surface-400 hover:bg-surface-100" aria-label="Cancel"><X size={14} /></button>
      </span>
    ) : (
      <span className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
        <span className={`truncate text-xs ${existing.value ? "text-surface-800" : "text-surface-400 italic"}`}>{existing.value || placeholder}</span>
        <button type="button" onClick={() => { setEditId(id); setEditVal(existing.value); }} className="p-1 rounded text-surface-400 hover:bg-surface-100 hover:text-brand-600" aria-label="Edit"><Pencil size={13} /></button>
        <button type="button" onClick={() => remove(existing)} className="p-1 rounded text-surface-400 hover:bg-danger-light hover:text-danger-base" aria-label="Delete tag"><Trash2 size={13} /></button>
      </span>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[88vh] flex flex-col" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-surface-900">Merge tags</h2>
            <p className="text-xs text-surface-500">Placeholders like <code>{"{{first_name}}"}</code> are replaced when the email is sent.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded text-surface-400 hover:bg-surface-100" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-4 overflow-y-auto space-y-5">
          {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-surface-500">Built-in contact tags</h3>
            <p className="text-xs text-surface-500 mb-2">Filled from each contact's own details. These are fixed and can't be edited or removed.</p>
            <div className="rounded-lg border border-surface-200 divide-y divide-surface-100">
              {BUILTIN_TAGS.map((b) => (
                <div key={b.key} className="flex items-center justify-between gap-2 px-3 py-2">
                  <button type="button" onClick={() => onInsert(`{{${b.key}}}`)} title="Insert into email"
                    className="text-xs font-mono rounded bg-surface-100 px-1.5 py-0.5 text-surface-700 hover:bg-brand-50 hover:text-brand-700">{`{{${b.key}}}`}</button>
                  <span className="flex items-center gap-1.5 text-xs text-surface-500"><Lock size={11} /> {b.label} from contact</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-surface-500">Your own tags</h3>
            <p className="text-xs text-surface-500 mb-2">Same value for every recipient — shop name, offer, hotline, coupon code…</p>
            {custom.length === 0 ? (
              <p className="text-xs text-surface-400 italic py-2">No custom tags yet.</p>
            ) : (
              <div className="rounded-lg border border-surface-200 divide-y divide-surface-100 mb-3">
                {custom.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 px-3 py-2">
                    <button type="button" onClick={() => onInsert(`{{${t.key}}}`)} title="Insert into email"
                      className="text-xs font-mono rounded bg-brand-50 px-1.5 py-0.5 text-brand-700 hover:bg-brand-100 flex-shrink-0">{`{{${t.key}}}`}</button>
                    {editRow(t, "(empty)")}
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={add} className="flex items-end gap-2 flex-wrap">
              <div className="w-40"><Input inputSize="sm" label="Tag name" placeholder="shop_name" value={newKey} onChange={(e) => setNewKey(e.target.value)} required /></div>
              <div className="flex-1 min-w-[10rem]"><Input inputSize="sm" label="Value" placeholder="আমার দোকান" value={newVal} onChange={(e) => setNewVal(e.target.value)} /></div>
              <Button type="submit" size="sm" icon={<Plus size={14} />} loading={busy} disabled={!normalizedNew || reserved || duplicate}>Add</Button>
            </form>
            <p className={`mt-1.5 text-[11px] ${reserved || duplicate ? "text-danger-base" : "text-surface-400"}`}>
              {reserved ? "That name is a built-in contact tag." : duplicate ? "A tag with this name already exists." : "Name: start with a letter, then a–z, 0–9 or _."}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
