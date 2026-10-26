import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Workflow, Plus, RefreshCw } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import PlanUsageStrip from "../../components/PlanUsageStrip";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Alert from "../../components/Alert";
import PageHeader from "../../components/PageHeader";
import EmptyState from "../../components/EmptyState";
import Spinner from "../../components/Spinner";
import {
  fetchWorkflows, deleteWorkflow, updateWorkflow, fetchEnrollments, manualTrigger,
  type Workflow as WF, type Enrollment,
} from "../../lib/workflows";
import { confirmText } from "../../components/ConfirmDialog";

const TRIGGER_LABELS: Record<string, string> = {
  contact_created: "Contact created", tag_added: "Tag added",
  form_submitted: "Form submitted", manual: "Manual only",
};
const ENROLL_BADGE: Record<string, "info" | "success" | "default" | "danger"> = {
  active: "info", completed: "success", cancelled: "default", failed: "danger",
};

function EnrollmentPanel({ workflowId, stepCount }: { workflowId: string; stepCount: number }) {
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [contactId, setContactId] = useState("");
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState("");

  const load = () => { setLoading(true); fetchEnrollments(workflowId).then(setEnrollments).finally(() => setLoading(false)); };
  useEffect(load, [workflowId]);

  const handleManualTrigger = async () => {
    if (!contactId.trim()) return;
    setTriggering(true); setTriggerMsg("");
    try { const res = await manualTrigger(workflowId, contactId.trim()); setTriggerMsg(`Enrollment ${res.enrollment_id} queued.`); setTimeout(load, 1200); }
    catch (e: any) { setTriggerMsg(e.message); }
    finally { setTriggering(false); }
  };

  return (
    <div className="mt-4 border-t border-surface-100 pt-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text" value={contactId} onChange={(e) => setContactId(e.target.value)}
          placeholder="Contact UUID to trigger manually"
          className="flex-1 min-w-48 text-xs border border-surface-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <Button size="xs" loading={triggering} disabled={!contactId.trim()} onClick={handleManualTrigger}>Trigger</Button>
        <Button size="xs" variant="ghost" icon={<RefreshCw size={12} />} onClick={load}>Refresh</Button>
      </div>
      {triggerMsg && <p className="text-xs text-brand-600 font-medium">{triggerMsg}</p>}
      {loading ? <Spinner size="sm" />
        : !enrollments || enrollments.length === 0
        ? <p className="text-xs text-surface-600 italic">No enrollments yet.</p>
        : (
          <div className="space-y-2">
            {enrollments.map((e) => (
              <div key={e.id} className="rounded-md bg-surface-50 border border-surface-100 px-3 py-2.5 text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium text-surface-800">{e.contact_name || e.contact_email || e.contact_id.slice(0, 8)}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={ENROLL_BADGE[e.status] ?? "default"} size="sm" dot>{e.status}</Badge>
                    {e.status === "active" && <span className="text-surface-400">step {e.current_step_index}/{stepCount}</span>}
                  </div>
                </div>
                {e.step_logs.length > 0 && (
                  <div className="space-y-0.5 mt-1 border-t border-surface-100 pt-1">
                    {e.step_logs.map((log, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={`mt-0.5 status-dot flex-shrink-0 ${log.status === "executed" ? "bg-success-base" : log.status === "failed" ? "bg-danger-base" : "bg-surface-300"}`} />
                        <span className="text-surface-600">[{log.step_index}] {log.step_type} — {log.status}{log.notes ? `: ${log.notes}` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
                {e.error_message && <p className="text-danger-dark mt-1 text-xs">{e.error_message}</p>}
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WF[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [expanded, setExpanded]   = useState<string | null>(null);

  const load = () => { setLoading(true); fetchWorkflows().then(setWorkflows).catch((e) => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(load, []);

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmText(`Delete workflow "${name}"?`))) return;
    await deleteWorkflow(id).catch((e) => alert(e.message));
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
  };

  const toggleActive = async (wf: WF) => {
    try { const u = await updateWorkflow(wf.id, { is_active: !wf.is_active }); setWorkflows((prev) => prev.map((w) => (w.id === wf.id ? u : w))); }
    catch (e: any) { alert(e.message); }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Workflows"
        description="Trigger-based journeys that send emails & SMS automatically."
        actions={
          <Link to="/workflows/new">
            <Button size="sm" icon={<Plus size={16} />}>New Workflow</Button>
          </Link>
        }
      />
      <PlanUsageStrip items={["workflows"]} />

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : workflows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Workflow size={40} />}
            title="No workflows yet"
            description="Build your first automation to start sending triggered messages."
            action={<Link to="/workflows/new"><Button size="sm" icon={<Plus size={15} />}>Create Workflow</Button></Link>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => (
            <Card key={wf.id}>
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-surface-900">{wf.name}</span>
                    <Badge variant={wf.is_active ? "success" : "default"} size="sm" dot>{wf.is_active ? "Active" : "Inactive"}</Badge>
                    <Badge variant="primary" size="sm">{TRIGGER_LABELS[wf.trigger_type] ?? wf.trigger_type}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-surface-600">
                    <span>{wf.steps.length} step(s)</span>
                    <span>{wf.enrollment_count} enrolled</span>
                    <span className="text-success-dark">{wf.completed_count} completed</span>
                    {wf.active_count > 0 && <span className="text-info-dark">{wf.active_count} active</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button size="xs" variant="ghost" onClick={() => setExpanded(expanded === wf.id ? null : wf.id)}>
                    {expanded === wf.id ? "Hide" : "Enrollments"}
                  </Button>
                  <Button size="xs" variant="secondary" onClick={() => toggleActive(wf)}>
                    {wf.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Link to={`/workflows/${wf.id}/edit`}>
                    <Button size="xs" variant="ghost">Edit</Button>
                  </Link>
                  <Button size="xs" variant="danger" onClick={() => handleDelete(wf.id, wf.name)}>Delete</Button>
                </div>
              </div>
              {expanded === wf.id && <EnrollmentPanel workflowId={wf.id} stepCount={wf.steps.length} />}
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
