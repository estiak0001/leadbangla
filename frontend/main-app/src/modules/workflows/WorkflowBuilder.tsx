import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronDown, ChevronUp, GripVertical, X } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Alert from "../../components/Alert";
import Input from "../../components/Input";
import UpgradeLimitModal from "../../components/UpgradeLimitModal";
import {
  createWorkflow, getWorkflow, updateWorkflow, type WorkflowStep,
} from "../../lib/workflows";
import { PlanLimitError } from "../../lib/planLimit";
import { fetchStages, type PipelineStage } from "../../lib/crm";

const StagesContext = createContext<PipelineStage[]>([]);

function uid() { return Math.random().toString(36).slice(2, 9); }

const TRIGGER_OPTIONS = [
  { value: "contact_created", label: "Contact Created — fires when a new contact is added" },
  { value: "form_submitted", label: "Form Submitted — fires when a landing page form is submitted" },
  { value: "tag_added", label: "Tag Added — fires when a specific tag is applied" },
  { value: "stage_entered", label: "Lead Enters CRM Stage — fires when a lead is moved to a stage" },
  { value: "manual", label: "Manual — triggered manually only (for testing)" },
];

const STEP_ICONS: Record<string, string> = {
  send_email: "✉️", send_sms: "💬", wait: "⏱️", add_tag: "🏷️", remove_tag: "🗑️", if_then: "❓", move_to_stage: "📌",
};
const STEP_LABELS: Record<string, string> = {
  send_email: "Send Email", send_sms: "Send SMS", wait: "Wait",
  add_tag: "Add Tag", remove_tag: "Remove Tag", if_then: "If / Then", move_to_stage: "Move to CRM Stage",
};
const TEMPLATE_HINT = "Template vars: {{first_name}}, {{last_name}}, {{email}}, {{phone}}";
const SIMPLE_TYPES = ["send_email", "send_sms", "wait", "add_tag", "remove_tag"] as const;

const inputCls = "w-full text-xs border border-surface-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 bg-white";
const textareaCls = `${inputCls} resize-none`;

function MiniStepEditor({ label, step, onChange }: { label: string; step: WorkflowStep | undefined; onChange: (s: WorkflowStep) => void }) {
  const type = step?.type ?? "send_email";
  return (
    <div className="space-y-2 bg-surface-50 border border-surface-200 rounded-md p-3">
      <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">{label}</p>
      <select value={type} onChange={(e) => onChange({ ...step, type: e.target.value as any })} className={inputCls}>
        {SIMPLE_TYPES.map((t) => <option key={t} value={t}>{STEP_LABELS[t]}</option>)}
      </select>
      {type === "send_email" && (
        <>
          <input type="text" placeholder="Subject" value={step?.subject ?? ""} onChange={(e) => onChange({ ...step, type: "send_email", subject: e.target.value })} className={inputCls} />
          <textarea placeholder="HTML body" value={step?.html_body ?? ""} onChange={(e) => onChange({ ...step, type: "send_email", html_body: e.target.value })} rows={3} className={textareaCls} />
        </>
      )}
      {type === "send_sms" && (
        <textarea placeholder="Message" value={step?.message ?? ""} onChange={(e) => onChange({ ...step, type: "send_sms", message: e.target.value })} rows={2} className={textareaCls} />
      )}
      {type === "wait" && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-surface-500">Hours</label>
            <input type="number" min={0} value={step?.delay_hours ?? 0} onChange={(e) => onChange({ ...step, type: "wait", delay_hours: +e.target.value })} className={inputCls} />
          </div>
          <div className="flex-1">
            <label className="text-xs text-surface-500">Minutes</label>
            <input type="number" min={0} value={step?.delay_minutes ?? 0} onChange={(e) => onChange({ ...step, type: "wait", delay_minutes: +e.target.value })} className={inputCls} />
          </div>
        </div>
      )}
      {(type === "add_tag" || type === "remove_tag") && (
        <input type="text" placeholder="Tag name" value={step?.tag ?? ""} onChange={(e) => onChange({ ...step, type: type as any, tag: e.target.value })} className={inputCls} />
      )}
    </div>
  );
}

function StageSelect({ value, onChange, className, label }: { value: string; onChange: (v: string) => void; className: string; label: string }) {
  const stages = useContext(StagesContext);
  return (
    <div>
      <label className="block text-xs font-medium text-surface-600 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
        <option value="">Choose a stage…</option>
        {stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
      </select>
    </div>
  );
}

function StepEditor({ step, onChange }: { step: WorkflowStep; onChange: (s: WorkflowStep) => void }) {
  const { type } = step;
  const fieldCls = "w-full border border-surface-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 bg-white";

  if (type === "send_email") return (
    <div className="space-y-3">
      <p className="text-xs text-surface-600">{TEMPLATE_HINT}</p>
      <div>
        <label className="block text-xs font-medium text-surface-600 mb-1">Subject</label>
        <input type="text" value={step.subject ?? ""} onChange={(e) => onChange({ ...step, subject: e.target.value })} className={fieldCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-surface-600 mb-1">HTML Body</label>
        <textarea value={step.html_body ?? ""} onChange={(e) => onChange({ ...step, html_body: e.target.value })} rows={6} className={`${fieldCls} font-mono resize-y`} placeholder="<p>Hi {{first_name}},</p><p>Welcome!</p>" />
      </div>
    </div>
  );

  if (type === "send_sms") {
    const msg = step.message ?? "";
    return (
      <div className="space-y-3">
        <p className="text-xs text-surface-600">{TEMPLATE_HINT}</p>
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-xs font-medium text-surface-600">Message</label>
            <span className={`text-xs ${msg.length > 160 ? "text-warning-dark" : "text-surface-400"}`}>{msg.length}/160</span>
          </div>
          <textarea value={msg} onChange={(e) => onChange({ ...step, message: e.target.value })} rows={4} className={`${fieldCls} resize-none`} />
        </div>
      </div>
    );
  }

  if (type === "wait") return (
    <div className="space-y-3">
      <p className="text-xs text-surface-500">Pauses the journey. The next step runs after this delay.</p>
      <div className="grid grid-cols-3 gap-3">
        {(["delay_hours", "delay_minutes", "delay_seconds"] as const).map((field) => (
          <div key={field}>
            <label className="block text-xs font-medium text-surface-600 mb-1 capitalize">{field.replace("delay_", "")}</label>
            <input type="number" min={0} value={step[field] ?? 0} onChange={(e) => onChange({ ...step, [field]: +e.target.value })} className={fieldCls} />
          </div>
        ))}
      </div>
      <p className="text-xs text-surface-600">For testing use delay_seconds; for production use delay_hours / delay_minutes.</p>
    </div>
  );

  if (type === "add_tag" || type === "remove_tag") return (
    <div>
      <label className="block text-xs font-medium text-surface-600 mb-1">Tag</label>
      <input type="text" value={step.tag ?? ""} onChange={(e) => onChange({ ...step, tag: e.target.value })} className={fieldCls} placeholder="e.g. welcomed" />
    </div>
  );

  if (type === "move_to_stage") return <StageSelect value={step.stage_id ?? ""} onChange={(v) => onChange({ ...step, stage_id: v })} className={fieldCls} label="Move the lead to stage" />;

  if (type === "if_then") {
    const cond = step.condition ?? { field: "email", operator: "is_set" };
    const needsValue = cond.operator === "has_tag" || cond.operator === "not_has_tag";
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium text-surface-600 mb-2">Condition</p>
          <div className="flex gap-2 flex-wrap">
            <select value={cond.field} onChange={(e) => onChange({ ...step, condition: { ...cond, field: e.target.value } })} className={`flex-1 text-sm ${fieldCls}`}>
              {["email", "phone", "first_name", "last_name", "tags"].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={cond.operator} onChange={(e) => onChange({ ...step, condition: { ...cond, operator: e.target.value } })} className={`flex-1 text-sm ${fieldCls}`}>
              <option value="is_set">is set</option>
              <option value="is_not_set">is not set</option>
              <option value="has_tag">has tag</option>
              <option value="not_has_tag">does not have tag</option>
            </select>
            {needsValue && (
              <input type="text" placeholder="tag value" value={cond.value ?? ""} onChange={(e) => onChange({ ...step, condition: { ...cond, value: e.target.value } })} className={`flex-1 text-sm ${fieldCls}`} />
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MiniStepEditor label="If true, do:" step={step.then_step as WorkflowStep} onChange={(s) => onChange({ ...step, then_step: s })} />
          <MiniStepEditor label="If false, do:" step={step.else_step as WorkflowStep} onChange={(s) => onChange({ ...step, else_step: s })} />
        </div>
      </div>
    );
  }
  return null;
}

function StagePreview({ id }: { id?: string }) {
  const stages = useContext(StagesContext);
  return <span className="text-sm text-surface-500">{stages.find((st) => st.id === id)?.name ?? "(choose a stage)"}</span>;
}

function StepPreview({ step }: { step: WorkflowStep }) {
  if (step.type === "send_email") return <span className="text-sm text-surface-500">{step.subject || "(no subject)"}</span>;
  if (step.type === "send_sms") return <span className="text-sm text-surface-500">{(step.message || "").slice(0, 60) || "(no message)"}</span>;
  if (step.type === "wait") { const h = step.delay_hours ?? 0; const m = step.delay_minutes ?? 0; const s = step.delay_seconds ?? 0; return <span className="text-sm text-surface-500">{h}h {m}m {s}s</span>; }
  if (step.type === "add_tag" || step.type === "remove_tag") return <span className="text-sm text-surface-500">"{step.tag || ""}"</span>;
  if (step.type === "move_to_stage") return <StagePreview id={step.stage_id} />;
  if (step.type === "if_then") { const c = step.condition; return <span className="text-sm text-surface-500">{c?.field} {c?.operator} {c?.value ?? ""}</span>; }
  return null;
}

function StepCard({ step, expanded, onToggle, onChange, onDelete, onDragStart, onDragOver, onDrop, onDragEnd, isDragTarget }: {
  step: WorkflowStep; expanded: boolean; onToggle: () => void; onChange: (s: WorkflowStep) => void;
  onDelete: () => void; onDragStart: (e: React.DragEvent) => void; onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void; onDragEnd: () => void; isDragTarget: boolean;
}) {
  return (
    <div
      draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
      className={`rounded-md border-2 transition-all ${isDragTarget ? "border-brand-400 bg-brand-500/5" : "border-surface-200 bg-white"}`}
    >
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={onToggle}>
        <GripVertical size={14} className="text-surface-300 hover:text-surface-500 cursor-grab active:cursor-grabbing flex-shrink-0" />
        <span className="flex-shrink-0">{STEP_ICONS[step.type]}</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-surface-600 w-20 flex-shrink-0">{STEP_LABELS[step.type]}</span>
        <div className="flex-1 min-w-0 truncate"><StepPreview step={step} /></div>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-surface-300 hover:text-danger-base transition-colors flex-shrink-0 p-0.5">
          <X size={14} />
        </button>
        {expanded ? <ChevronUp size={14} className="text-surface-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-surface-400 flex-shrink-0" />}
      </div>
      {expanded && (
        <div className="border-t border-surface-100 px-4 pb-4 pt-3">
          <StepEditor step={step} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

const DEFAULT_STEPS: Record<string, Partial<WorkflowStep>> = {
  send_email: { subject: "", html_body: "" },
  send_sms: { message: "" },
  wait: { delay_hours: 0, delay_minutes: 0, delay_seconds: 0 },
  add_tag: { tag: "" },
  remove_tag: { tag: "" },
  move_to_stage: { stage_id: "" },
  if_then: {
    condition: { field: "email", operator: "is_set" },
    then_step: { type: "send_email", subject: "", html_body: "" } as WorkflowStep,
    else_step: { type: "send_sms", message: "" } as WorkflowStep,
  },
};

export default function WorkflowBuilder() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id;
  const navigate = useNavigate();

  const [name, setName]               = useState("New Workflow");
  const [triggerType, setTriggerType] = useState("contact_created");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, string>>({});
  const [steps, setSteps]             = useState<WorkflowStep[]>([]);
  const [isActive, setIsActive]       = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");
  const [stages, setStages]           = useState<PipelineStage[]>([]);
  useEffect(() => { fetchStages().then((st) => setStages([...st].sort((a, b) => a.position - b.position))).catch(() => undefined); }, []);
  const [workflowId, setWorkflowId]   = useState<string | null>(id ?? null);
  const [limitError, setLimitError]   = useState<{ resource: string; current: number; limit: number } | null>(null);

  const dragIndexRef = useRef<number | null>(null);
  const [dropTarget, setDropTarget]   = useState<number | null>(null);

  useEffect(() => {
    if (!isNew && id) {
      getWorkflow(id)
        .then((wf) => {
          setName(wf.name);
          setTriggerType(wf.trigger_type);
          setTriggerConfig(wf.trigger_config as any);
          setSteps(wf.steps.map((s) => ({ ...s, _id: uid() })));
          setIsActive(wf.is_active);
          setWorkflowId(wf.id);
        })
        .catch((e) => setError(e.message));
    }
  }, [id, isNew]);

  const addStep = (type: WorkflowStep["type"]) => {
    const newStep: WorkflowStep = { type, _id: uid(), ...DEFAULT_STEPS[type] } as WorkflowStep;
    setSteps((prev) => [...prev, newStep]);
    setExpandedIndex(steps.length);
  };

  const updateStep = (index: number, s: WorkflowStep) =>
    setSteps((prev) => prev.map((x, i) => (i === index ? s : x)));

  const deleteStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
    setExpandedIndex(null);
  };

  const cleanSteps = (ss: WorkflowStep[]) => ss.map(({ _id, ...rest }) => rest as WorkflowStep);

  const handleSave = async () => {
    if (!name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError("");
    try {
      const payload = { name, trigger_type: triggerType, trigger_config: triggerConfig, steps: cleanSteps(steps), is_active: isActive };
      if (isNew || !workflowId) {
        const wf = await createWorkflow(payload);
        setWorkflowId(wf.id);
        navigate(`/workflows/${wf.id}/edit`, { replace: true });
      } else {
        await updateWorkflow(workflowId, payload);
      }
    } catch (e) {
      if (e instanceof PlanLimitError) { setLimitError({ resource: e.resource, current: e.current, limit: e.limit }); }
      else { setError(e instanceof Error ? e.message : "Save failed"); }
    }
    finally { setSaving(false); }
  };

  const toggleActive = async () => {
    if (!workflowId) { setError("Save first."); return; }
    try { const wf = await updateWorkflow(workflowId, { is_active: !isActive }); setIsActive(wf.is_active); }
    catch (e: any) { setError(e.message); }
  };

  const onDragStart = (e: React.DragEvent, i: number) => { dragIndexRef.current = i; e.dataTransfer.effectAllowed = "move"; };
  const onDragOver  = (e: React.DragEvent, i: number) => { e.preventDefault(); setDropTarget(i); };
  const onDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from !== null && from !== targetIdx) {
      setSteps((prev) => { const arr = [...prev]; const [moved] = arr.splice(from, 1); arr.splice(targetIdx, 0, moved); return arr; });
      setExpandedIndex(null);
    }
    dragIndexRef.current = null; setDropTarget(null);
  };
  const onDragEnd = () => { dragIndexRef.current = null; setDropTarget(null); };

  return (
    <StagesContext.Provider value={stages}>
    <AppLayout>
      <div>
        {/* Top bar */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <button onClick={() => navigate("/workflows")} className="text-sm text-surface-500 hover:text-surface-800 font-medium">
            ← Workflows
          </button>
          <span className="text-surface-300">/</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 text-xl font-bold text-surface-900 bg-transparent border-b-2 border-transparent focus:border-brand-400 focus:outline-none py-1 min-w-48"
            placeholder="Workflow name"
          />
          <button
            onClick={toggleActive}
            disabled={!workflowId}
            className={`text-sm font-medium px-3 py-1.5 rounded-md border transition-colors disabled:opacity-50 ${isActive ? "border-success-base bg-success-light text-success-dark hover:bg-success-light/80" : "border-surface-200 bg-white text-surface-600 hover:bg-surface-50"}`}
          >
            {isActive ? "✓ Active" : "Activate"}
          </button>
          <Button onClick={handleSave} loading={saving} size="sm">Save</Button>
        </div>

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        {/* Trigger */}
        <Card className="mb-4">
          <p className="section-label mb-3">Trigger</p>
          <select
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value)}
            className="w-full border border-surface-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 bg-white appearance-none"
          >
            {TRIGGER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {triggerType === "tag_added" && (
            <div className="mt-3">
              <Input label="Tag name (leave blank to match any tag)" type="text" value={triggerConfig.tag ?? ""} onChange={(e) => setTriggerConfig({ tag: e.target.value })} placeholder="e.g. newsletter" />
            </div>
          )}
          {triggerType === "stage_entered" && (
            <div className="mt-3">
              <StageSelect label="Which stage? (leave on 'Any stage' to match every move)" value={triggerConfig.stage_id ?? ""} onChange={(v) => setTriggerConfig(v ? { stage_id: v } : {})}
                className="w-full border border-surface-200 rounded-md px-3 py-2 text-sm bg-white" />
            </div>
          )}
          {triggerType === "form_submitted" && (
            <div className="mt-3">
              <Input label="Landing page ID (leave blank to match any form)" type="text" value={triggerConfig.landing_page_id ?? ""} onChange={(e) => setTriggerConfig({ landing_page_id: e.target.value })} placeholder="e.g. uuid-of-landing-page" />
            </div>
          )}
        </Card>

        {/* Steps */}
        <div className="space-y-3 mb-4">
          {steps.length === 0 && (
            <div className="rounded-md border-2 border-dashed border-surface-200 py-10 text-center text-surface-400">
              No steps yet — add a step below to build the journey.
            </div>
          )}
          {steps.map((step, i) => (
            <StepCard
              key={step._id ?? i}
              step={step}
              expanded={expandedIndex === i}
              onToggle={() => setExpandedIndex(expandedIndex === i ? null : i)}
              onChange={(s) => updateStep(i, s)}
              onDelete={() => deleteStep(i)}
              onDragStart={(e) => onDragStart(e, i)}
              onDragOver={(e) => onDragOver(e, i)}
              onDrop={(e) => onDrop(e, i)}
              onDragEnd={onDragEnd}
              isDragTarget={dropTarget === i && dragIndexRef.current !== i}
            />
          ))}
        </div>

        {/* Add step palette */}
        <Card>
          <p className="section-label mb-3">Add step</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STEP_LABELS) as WorkflowStep["type"][]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => addStep(t)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-surface-200 hover:border-brand-300 hover:bg-brand-50 text-sm font-medium text-surface-700 transition-all"
              >
                <span>{STEP_ICONS[t]}</span> {STEP_LABELS[t]}
              </button>
            ))}
          </div>
        </Card>
      </div>

      {limitError && <UpgradeLimitModal {...limitError} onClose={() => setLimitError(null)} />}
    </AppLayout>
    </StagesContext.Provider>
  );
}
