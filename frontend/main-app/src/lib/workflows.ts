import { getAccessToken } from "./auth";
import { throwForFailedResponse } from "./planLimit";

export type TriggerType = "contact_created" | "tag_added" | "form_submitted" | "manual" | "stage_entered";
export type EnrollmentStatus = "active" | "completed" | "cancelled" | "failed";

export interface WorkflowStep {
  type: "send_email" | "send_sms" | "wait" | "add_tag" | "remove_tag" | "if_then" | "move_to_stage";
  // send_email
  subject?: string;
  html_body?: string;
  // send_sms / message
  message?: string;
  // wait
  delay_hours?: number;
  delay_minutes?: number;
  delay_seconds?: number;
  // add_tag / remove_tag
  tag?: string;
  // move_to_stage
  stage_id?: string;
  // if_then
  condition?: { field: string; operator: string; value?: string };
  then_step?: Omit<WorkflowStep, "if_then">;
  else_step?: Omit<WorkflowStep, "if_then">;
  // client-only id for stable React keys
  _id?: string;
}

export interface Workflow {
  id: string;
  name: string;
  trigger_type: TriggerType;
  trigger_config: Record<string, string>;
  steps: WorkflowStep[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  enrollment_count: number;
  active_count: number;
  completed_count: number;
}

export interface StepLog {
  step_index: number;
  step_type: string;
  status: string;
  notes: string | null;
  executed_at: string;
}

export interface Enrollment {
  id: string;
  contact_id: string;
  contact_email: string | null;
  contact_name: string | null;
  current_step_index: number;
  status: EnrollmentStatus;
  enrolled_at: string;
  completed_at: string | null;
  error_message: string | null;
  step_logs: StepLog[];
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/workflows${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    return throwForFailedResponse(res);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const fetchWorkflows = () => apiFetch<Workflow[]>("");

export const getWorkflow = (id: string) => apiFetch<Workflow>(`/${id}`);

export const createWorkflow = (data: {
  name: string;
  trigger_type: string;
  trigger_config: object;
  steps: WorkflowStep[];
}) => apiFetch<Workflow>("", { method: "POST", body: JSON.stringify(data) });

export const updateWorkflow = (
  id: string,
  data: {
    name?: string;
    trigger_type?: string;
    trigger_config?: object;
    steps?: WorkflowStep[];
    is_active?: boolean;
  }
) => apiFetch<Workflow>(`/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const deleteWorkflow = (id: string) =>
  apiFetch<void>(`/${id}`, { method: "DELETE" });

export const fetchEnrollments = (id: string) =>
  apiFetch<Enrollment[]>(`/${id}/enrollments`);

export const manualTrigger = (workflowId: string, contactId: string) =>
  apiFetch<{ enrollment_id: string; status: string }>(`/${workflowId}/trigger`, {
    method: "POST",
    body: JSON.stringify({ contact_id: contactId }),
  });
