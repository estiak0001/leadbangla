import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import WaTemplateRequests from "./WaTemplateRequests";
import { BadgeCheck, FilePlus2, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import Alert from "../../../components/Alert";
import Badge from "../../../components/Badge";
import Button from "../../../components/Button";
import Card from "../../../components/Card";
import Input from "../../../components/Input";
import Spinner from "../../../components/Spinner";
import type { SmsChannel } from "../../../lib/sms";
import { useConfirm } from "../../../components/ConfirmDialog";
import {
  CHANNELS, STARTER_TEMPLATES, createMessageTemplate, deleteMessageTemplate, fetchMessageTemplates,
  smsParts, updateMessageTemplate, type MessageTemplate,
} from "../../../lib/messaging";

export default function TemplatesTab({ channel }: { channel: SmsChannel }) {
  const cfg = CHANNELS[channel];
  const navigate = useNavigate();
  const confirmAsk = useConfirm();
  const isWa = channel === "whatsapp";
  const [items, setItems] = useState<MessageTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MessageTemplate | "new" | null>(null);
  const [draft, setDraft] = useState({ name: "", body: "", approved: false });
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"meta" | "drafts">("meta");

  useEffect(() => { fetchMessageTemplates(channel).then(setItems).catch(() => setError("Failed to load templates")); }, [channel]);

  function openEditor(t: MessageTemplate | "new", seed?: { name: string; body: string }) {
    setDraft(t === "new" ? { name: seed?.name ?? "", body: seed?.body ?? "", approved: false } : { name: t.name, body: t.body, approved: t.approved });
    setEditing(t);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      if (editing === "new") {
        const t = await createMessageTemplate({ channel, ...draft, approved: isWa && draft.approved });
        setItems((p) => [...(p ?? []), t].sort((a, b) => a.name.localeCompare(b.name)));
      } else if (editing) {
        const t = await updateMessageTemplate(editing.id, { name: draft.name, body: draft.body, approved: isWa ? draft.approved : undefined });
        setItems((p) => (p ?? []).map((x) => (x.id === t.id ? t : x)));
      }
      setEditing(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to save template"); }
    finally { setSaving(false); }
  }

  async function remove(t: MessageTemplate) {
    if (!(await confirmAsk({ title: "Delete this template?", message: <>“{t.name}” will be removed. Campaigns already created from it are not affected.</>, confirmLabel: "Delete", tone: "danger", icon: "delete" }))) return;
    try { await deleteMessageTemplate(t.id); setItems((p) => (p ?? []).filter((x) => x.id !== t.id)); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to delete"); }
  }

  if (!items) return error ? <Alert variant="error">{error}</Alert> : <div className="py-16 flex justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      {isWa && (
        <div className="inline-flex border border-surface-200 rounded-[3px] overflow-hidden bg-white text-sm" role="tablist">
          {([["meta", "Approved templates"], ["drafts", "Message drafts"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`px-3.5 py-1.5 font-medium ${view === k ? "bg-brand-500 text-white" : "text-surface-600 hover:bg-surface-50"}`}>{l}</button>
          ))}
        </div>
      )}
      {isWa && view === "meta" ? <WaTemplateRequests /> : <>
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {isWa && (
        <Alert variant="info">Meta must approve a template before you can message customers first. After Meta approves it, switch on <b>Approved</b> here so your team knows which ones are safe to use.</Alert>
      )}

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-surface-700">Your templates</h2>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => openEditor("new")}>New template</Button>
        </div>
        {items.length === 0 ? (
          <Card className="text-center !py-5 text-sm text-surface-500">No saved templates yet. Create one, or start from an idea below.</Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {items.map((t) => (
              <Card key={t.id} className="!p-3.5 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-surface-900 truncate">{t.name}</h3>
                  {isWa && <Badge variant={t.approved ? "success" : "default"} size="sm">{t.approved ? "Approved" : "Not approved"}</Badge>}
                </div>
                <p className="mt-1.5 text-xs text-surface-600 line-clamp-4 whitespace-pre-line flex-1">{t.body}</p>
                <div className="mt-3 flex items-center justify-between border-t border-surface-100 pt-2">
                  <Button size="xs" icon={<Send size={12} />} onClick={() => navigate(`${cfg.path}/campaigns/new?tpl=${t.id}`)}>Use</Button>
                  <div className="flex gap-1">
                    <button onClick={() => openEditor(t)} aria-label="Edit" className="p-1.5 rounded text-surface-400 hover:bg-surface-100 hover:text-brand-600"><Pencil size={14} /></button>
                    <button onClick={() => remove(t)} aria-label="Delete" className="p-1.5 rounded text-surface-400 hover:bg-danger-light hover:text-danger-base"><Trash2 size={14} /></button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-surface-700 mb-2">Starter ideas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {STARTER_TEMPLATES[channel].map((s) => (
            <Card key={s.id} className="!p-3.5 flex flex-col bg-surface-50">
              <h3 className="text-sm font-semibold text-surface-900">{s.emoji} {s.name}</h3>
              <p className="mt-1.5 text-xs text-surface-600 line-clamp-4 whitespace-pre-line flex-1">{s.body}</p>
              <div className="mt-3 flex items-center gap-2 border-t border-surface-200 pt-2">
                <Button size="xs" icon={<Send size={12} />} onClick={() => navigate(`${cfg.path}/campaigns/new?starter=${s.id}`)}>Use</Button>
                <Button size="xs" variant="secondary" icon={<FilePlus2 size={12} />} onClick={() => openEditor("new", { name: s.name, body: s.body })}>Save &amp; edit</Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4" onClick={() => setEditing(null)}>
          <form onSubmit={save} className="bg-white rounded-xl shadow-2xl w-full max-w-lg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100">
              <h2 className="text-sm font-semibold text-surface-900">{editing === "new" ? "New" : "Edit"} {cfg.label} template</h2>
              <button type="button" onClick={() => setEditing(null)} className="p-1 rounded text-surface-400 hover:bg-surface-100" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <Input inputSize="sm" label="Template name" placeholder="e.g. Eid offer" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required autoFocus />
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Message</label>
                <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} required maxLength={1600} rows={7}
                  placeholder="প্রিয় {{first_name}}, …"
                  className="block w-full rounded-md border border-surface-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
                <p className="mt-1 text-[11px] text-surface-500">
                  {channel === "sms" ? <>{smsParts(draft.body).length} characters · {smsParts(draft.body).parts} SMS parts</> : <>{[...draft.body].length} / 1600 characters</>}
                  {" · use "}<code>{"{{first_name}}"}</code>{" for personalising"}
                </p>
              </div>
              {isWa && (
                <label className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer">
                  <input type="checkbox" checked={draft.approved} onChange={(e) => setDraft({ ...draft, approved: e.target.checked })} />
                  <BadgeCheck size={15} className="text-success-dark" /> Approved by Meta
                </label>
              )}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-surface-100">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" size="sm" loading={saving}>Save template</Button>
            </div>
          </form>
        </div>
      )}
      </>}
    </div>
  );
}
