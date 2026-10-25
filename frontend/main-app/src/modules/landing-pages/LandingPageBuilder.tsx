import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GripVertical, ChevronDown, ChevronUp, X, ExternalLink } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Alert from "../../components/Alert";
import UpgradeLimitModal from "../../components/UpgradeLimitModal";
import {
  createLandingPage, getLandingPage, updateLandingPage,
  type Block, type FormBlock, type FormField, type HeroBlock, type TextBlock,
} from "../../lib/landingPages";
import { PlanLimitError } from "../../lib/planLimit";

function uid() { return Math.random().toString(36).slice(2, 9); }

const PRESET_FIELDS: Array<{ name: string; label: string; field_type: FormField["field_type"] }> = [
  { name: "first_name", label: "First Name", field_type: "text" },
  { name: "last_name", label: "Last Name", field_type: "text" },
  { name: "email", label: "Email Address", field_type: "email" },
  { name: "phone", label: "Phone Number", field_type: "tel" },
];

const fieldCls = "w-full border border-surface-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 bg-white";

function HeroEditor({ block, onChange }: { block: HeroBlock; onChange: (b: HeroBlock) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-surface-600 mb-1">Heading</label>
        <input type="text" value={block.heading} onChange={(e) => onChange({ ...block, heading: e.target.value })} className={fieldCls} placeholder="e.g. Join our newsletter" />
      </div>
      <div>
        <label className="block text-xs font-medium text-surface-600 mb-1">Subheading</label>
        <input type="text" value={block.subheading} onChange={(e) => onChange({ ...block, subheading: e.target.value })} className={fieldCls} placeholder="e.g. Get exclusive updates every week" />
      </div>
    </div>
  );
}

function TextEditor({ block, onChange }: { block: TextBlock; onChange: (b: TextBlock) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-surface-600 mb-1">Content</label>
      <textarea value={block.content} onChange={(e) => onChange({ ...block, content: e.target.value })} rows={4} className={`${fieldCls} resize-none`} placeholder="Write your text here…" />
    </div>
  );
}

function FormEditor({ block, onChange }: { block: FormBlock; onChange: (b: FormBlock) => void }) {
  const updateField = (idx: number, patch: Partial<FormField>) =>
    onChange({ ...block, fields: block.fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)) });
  const removeField = (idx: number) => onChange({ ...block, fields: block.fields.filter((_, i) => i !== idx) });
  const moveField = (idx: number, dir: -1 | 1) => {
    const arr = [...block.fields]; const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    onChange({ ...block, fields: arr });
  };
  const addField = (preset: (typeof PRESET_FIELDS)[number]) =>
    onChange({ ...block, fields: [...block.fields, { id: uid(), name: preset.name, label: preset.label, field_type: preset.field_type, required: false }] });
  const addCustomField = () =>
    onChange({ ...block, fields: [...block.fields, { id: uid(), name: "custom_field", label: "Custom Field", field_type: "text", required: false }] });

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-surface-600 mb-2">Form Fields</label>
        {block.fields.length === 0 && <p className="text-sm text-surface-600 italic py-2">No fields yet — add one below.</p>}
        <div className="space-y-2">
          {block.fields.map((field, idx) => (
            <div key={field.id} className="flex items-center gap-2 bg-surface-50 border border-surface-200 rounded-md px-3 py-2">
              <div className="flex flex-col gap-0.5">
                <button type="button" onClick={() => moveField(idx, -1)} disabled={idx === 0} className="text-surface-300 hover:text-surface-600 disabled:opacity-30 leading-none text-xs">▲</button>
                <button type="button" onClick={() => moveField(idx, 1)} disabled={idx === block.fields.length - 1} className="text-surface-300 hover:text-surface-600 disabled:opacity-30 leading-none text-xs">▼</button>
              </div>
              <input type="text" value={field.label} onChange={(e) => updateField(idx, { label: e.target.value })} className="flex-1 text-sm border border-surface-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white" placeholder="Field label" />
              <select value={field.field_type} onChange={(e) => updateField(idx, { field_type: e.target.value as FormField["field_type"] })} className="text-xs border border-surface-200 rounded-md px-1.5 py-1 focus:outline-none bg-white">
                <option value="text">Text</option>
                <option value="email">Email</option>
                <option value="tel">Phone</option>
                <option value="textarea">Textarea</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-surface-500 cursor-pointer">
                <input type="checkbox" checked={field.required} onChange={(e) => updateField(idx, { required: e.target.checked })} className="rounded" />
                Req
              </label>
              <button type="button" onClick={() => removeField(idx)} className="text-surface-300 hover:text-danger-base transition-colors"><X size={13} /></button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRESET_FIELDS.filter((p) => !block.fields.some((f) => f.name === p.name)).map((p) => (
            <button key={p.name} type="button" onClick={() => addField(p)} className="text-xs bg-brand-50 text-brand-700 border border-brand-200 rounded-full px-2.5 py-0.5 hover:bg-brand-100 transition-colors">+ {p.label}</button>
          ))}
          <button type="button" onClick={addCustomField} className="text-xs bg-surface-100 text-surface-600 border border-surface-200 rounded-full px-2.5 py-0.5 hover:bg-surface-200 transition-colors">+ Custom field</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-surface-600 mb-1">Submit button label</label>
          <input type="text" value={block.submit_label} onChange={(e) => onChange({ ...block, submit_label: e.target.value })} className={fieldCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-600 mb-1">Success message (shown after submit)</label>
          <input type="text" value={block.success_message} onChange={(e) => onChange({ ...block, success_message: e.target.value })} className={fieldCls} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-surface-600 mb-1">Auto-apply tags (comma-separated)</label>
        <input type="text" value={block.auto_tags.join(", ")} onChange={(e) => onChange({ ...block, auto_tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} className={fieldCls} placeholder="e.g. newsletter, lead" />
        <p className="text-xs text-surface-600 mt-1">These tags are added to every Contact created from this form.</p>
      </div>
    </div>
  );
}

const BLOCK_LABELS: Record<string, string> = { hero: "Hero", text: "Text", form: "Form" };
const BLOCK_ICONS: Record<string, string> = { hero: "🏠", text: "📝", form: "📋" };

function BlockPreview({ block }: { block: Block }) {
  if (block.type === "hero") return <span className="text-sm text-surface-700"><span className="font-semibold">{block.heading || "(no heading)"}</span>{block.subheading && <span className="text-surface-400 ml-2 text-xs">— {block.subheading}</span>}</span>;
  if (block.type === "text") return <span className="text-sm text-surface-500">{block.content.slice(0, 80) + (block.content.length > 80 ? "…" : "") || "(empty)"}</span>;
  if (block.type === "form") return <span className="text-sm text-surface-500">{block.fields.length} field{block.fields.length !== 1 ? "s" : ""} · "{block.submit_label}"</span>;
  return null;
}

function BlockCard({ block, expanded, onToggle, onChange, onDelete, onDragStart, onDragOver, onDrop, onDragEnd, isDragTarget }: {
  block: Block; expanded: boolean; onToggle: () => void; onChange: (b: Block) => void; onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void; onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void; onDragEnd: () => void; isDragTarget: boolean;
}) {
  return (
    <div draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
      className={`rounded-md border-2 transition-all ${isDragTarget ? "border-brand-400 bg-brand-500/5" : "border-surface-200 bg-white"}`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={onToggle}>
        <GripVertical size={14} className="text-surface-300 hover:text-surface-500 cursor-grab active:cursor-grabbing flex-shrink-0" />
        <span className="flex-shrink-0">{BLOCK_ICONS[block.type]}</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-surface-600 w-10 flex-shrink-0">{BLOCK_LABELS[block.type]}</span>
        <div className="flex-1 min-w-0 truncate"><BlockPreview block={block} /></div>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-surface-300 hover:text-danger-base transition-colors flex-shrink-0"><X size={14} /></button>
        {expanded ? <ChevronUp size={14} className="text-surface-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-surface-400 flex-shrink-0" />}
      </div>
      {expanded && (
        <div className="border-t border-surface-100 px-4 pb-4 pt-3">
          {block.type === "hero" && <HeroEditor block={block} onChange={(b) => onChange(b)} />}
          {block.type === "text" && <TextEditor block={block} onChange={(b) => onChange(b)} />}
          {block.type === "form" && <FormEditor block={block} onChange={(b) => onChange(b)} />}
        </div>
      )}
    </div>
  );
}

export default function LandingPageBuilder() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id;
  const navigate = useNavigate();

  const [title, setTitle]               = useState("Untitled page");
  const [slug, setSlug]                 = useState<string | null>(null);
  const [blocks, setBlocks]             = useState<Block[]>([]);
  const [isPublished, setIsPublished]   = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState("");
  const [pageId, setPageId]             = useState<string | null>(id ?? null);
  const [limitError, setLimitError]     = useState<{ resource: string; current: number; limit: number } | null>(null);

  const dragIndexRef = useRef<number | null>(null);
  const [dropTarget, setDropTarget]     = useState<number | null>(null);

  useEffect(() => {
    if (!isNew && id) {
      getLandingPage(id)
        .then((p) => {
          setTitle(p.title); setSlug(p.slug);
          setBlocks(p.blocks.map((b) => b.type === "form" ? { ...b, fields: b.fields.map((f) => ({ ...f, id: f.id ?? uid() })) } : b));
          setIsPublished(p.is_published); setPageId(p.id);
        })
        .catch((e) => setError(e.message));
    }
  }, [id, isNew]);

  const addBlock = (type: "hero" | "text" | "form") => {
    const defaults: Record<string, Block> = {
      hero: { type: "hero", heading: "Your Headline Here", subheading: "A short supporting line." },
      text: { type: "text", content: "Add your text here." },
      form: { type: "form", fields: [{ id: uid(), name: "email", label: "Email Address", field_type: "email", required: true }], submit_label: "Subscribe", success_message: "Thank you! You're subscribed.", auto_tags: [] },
    };
    setBlocks((prev) => [...prev, defaults[type]]);
    setExpandedIndex(blocks.length);
  };

  const updateBlock = (index: number, block: Block) => setBlocks((prev) => prev.map((b, i) => (i === index ? block : b)));
  const deleteBlock = (index: number) => { setBlocks((prev) => prev.filter((_, i) => i !== index)); setExpandedIndex(null); };

  const handleSave = async () => {
    if (!title.trim()) { setError("Page title is required."); return; }
    setSaving(true); setError("");
    try {
      if (isNew || !pageId) {
        const page = await createLandingPage(title, blocks);
        setSlug(page.slug); setPageId(page.id);
        navigate(`/landing-pages/${page.id}/edit`, { replace: true });
      } else {
        const page = await updateLandingPage(pageId, { title, blocks, is_published: isPublished });
        setSlug(page.slug); setIsPublished(page.is_published);
      }
    } catch (e) {
      if (e instanceof PlanLimitError) { setLimitError({ resource: e.resource, current: e.current, limit: e.limit }); }
      else { setError(e instanceof Error ? e.message : "Save failed"); }
    }
    finally { setSaving(false); }
  };

  const togglePublish = async () => {
    if (!pageId) { setError("Save the page first before publishing."); return; }
    setSaving(true); setError("");
    try { const page = await updateLandingPage(pageId, { is_published: !isPublished }); setIsPublished(page.is_published); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => { dragIndexRef.current = index; e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver  = (e: React.DragEvent, index: number) => { e.preventDefault(); setDropTarget(index); };
  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault(); const fromIndex = dragIndexRef.current;
    if (fromIndex !== null && fromIndex !== targetIndex) {
      setBlocks((prev) => { const arr = [...prev]; const [moved] = arr.splice(fromIndex, 1); arr.splice(targetIndex, 0, moved); return arr; });
      setExpandedIndex(null);
    }
    dragIndexRef.current = null; setDropTarget(null);
  };
  const handleDragEnd = () => { dragIndexRef.current = null; setDropTarget(null); };

  const hasFormBlock = blocks.some((b) => b.type === "form");
  const publicUrl = slug ? `${window.location.origin}/lp/${slug}` : null;

  return (
    <AppLayout>
      <div>
        {/* Top bar */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <button type="button" onClick={() => navigate("/landing-pages")} className="text-sm text-surface-500 hover:text-surface-800 font-medium">← Pages</button>
          <span className="text-surface-300">/</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 text-xl font-bold text-surface-900 bg-transparent border-b-2 border-transparent focus:border-brand-400 focus:outline-none py-1 min-w-32" placeholder="Page title" />
          <div className="flex items-center gap-2 flex-shrink-0">
            {publicUrl && isPublished && (
              <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                <Button size="xs" variant="ghost" icon={<ExternalLink size={12} />}>Preview</Button>
              </a>
            )}
            <button type="button" onClick={togglePublish} disabled={saving || !pageId}
              className={`text-sm font-medium px-3 py-1.5 rounded-md border transition-colors disabled:opacity-50 ${isPublished ? "border-success-base bg-success-light text-success-dark" : "border-surface-200 bg-white text-surface-600 hover:bg-surface-50"}`}>
              {isPublished ? "✓ Published" : "Publish"}
            </button>
            <Button size="sm" onClick={handleSave} loading={saving}>Save</Button>
          </div>
        </div>

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        {/* Slug info */}
        {slug && (
          <div className="mb-4 rounded-md bg-surface-50 border border-surface-200 px-4 py-2.5 text-sm text-surface-600 flex items-center gap-2 flex-wrap">
            <span className="font-medium">Public URL:</span>
            {isPublished
              ? <a href={`/lp/${slug}`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline break-all">{publicUrl}</a>
              : <span className="text-surface-400 break-all">{publicUrl} <span className="text-xs">(publish to make it live)</span></span>
            }
          </div>
        )}

        {/* Block list */}
        <div className="space-y-3 mb-6">
          {blocks.length === 0 && (
            <div className="rounded-md border-2 border-dashed border-surface-200 py-12 text-center text-surface-400">
              <p className="text-base mb-1">No blocks yet</p>
              <p className="text-sm">Add blocks below to build your landing page.</p>
            </div>
          )}
          {blocks.map((block, index) => (
            <BlockCard
              key={`${block.type}-${index}`} block={block} expanded={expandedIndex === index}
              onToggle={() => setExpandedIndex(expandedIndex === index ? null : index)}
              onChange={(b) => updateBlock(index, b)} onDelete={() => deleteBlock(index)}
              onDragStart={(e) => handleDragStart(e, index)} onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)} onDragEnd={handleDragEnd}
              isDragTarget={dropTarget === index && dragIndexRef.current !== index}
            />
          ))}
        </div>

        {/* Add block palette */}
        <Card>
          <p className="section-label mb-3">Add block</p>
          <div className="flex flex-wrap gap-2">
            {(["hero", "text", "form"] as const).map((type) => (
              <button key={type} type="button" onClick={() => addBlock(type)} disabled={type === "form" && hasFormBlock}
                title={type === "form" && hasFormBlock ? "Only one form block per page" : ""}
                className="flex items-center gap-2 px-4 py-2.5 rounded-md border border-surface-200 hover:border-brand-300 hover:bg-brand-50 text-sm font-medium text-surface-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                <span>{BLOCK_ICONS[type]}</span> {BLOCK_LABELS[type]}{type === "form" && hasFormBlock ? " (added)" : ""}
              </button>
            ))}
          </div>
        </Card>
      </div>

      {limitError && <UpgradeLimitModal {...limitError} onClose={() => setLimitError(null)} />}
    </AppLayout>
  );
}
