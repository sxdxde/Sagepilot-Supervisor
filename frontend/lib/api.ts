// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Supervisor {
  id: string;
  name: string;
  base_instruction: string;
  available_actions: string[];
  wake_up_interval_minutes: number;
  wake_aggressiveness: "conservative" | "moderate" | "aggressive";
  model: string;
  created_at: string;
}

export interface OrderContext {
  customer_name: string;
  items: string[];
  amount: number;
  notes: string;
}

export interface Run {
  id: string;
  supervisor_id: string;
  order_id: string;
  order_context: OrderContext | null;
  status: "active" | "sleeping" | "interrupted" | "terminated" | "completed";
  temporal_workflow_id: string | null;
  memory_summary: string;
  next_wake_up: string | null;
  final_output: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  run_id: string;
  activity_type:
    | "event_received"
    | "wake_decision"
    | "agent_reasoning"
    | "action_executed"
    | "instruction_added"
    | "sleep_decision"
    | "final_output"
    | "system";
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface WorkflowState {
  current_status: string;
  memory_summary: string;
  next_wake_up_str: string;
  actions_taken_count: number;
  pending_events_count: number;
  additional_instructions: string[];
}

export interface RunDetail extends Run {
  activity_log: ActivityLog[];
  workflow_state: WorkflowState | null;
  supervisor?: Supervisor;
}

// ---------------------------------------------------------------------------
// Request payload types
// ---------------------------------------------------------------------------

export interface CreateSupervisorPayload {
  name: string;
  base_instruction: string;
  available_actions?: string[];
  wake_up_interval_minutes?: number;
  wake_aggressiveness?: "conservative" | "moderate" | "aggressive";
  model?: string;
}

export interface CreateRunPayload {
  supervisor_id: string;
  order_id: string;
  order_context: {
    customer_name: string;
    items: string[];
    amount: number;
    notes?: string;
  };
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${path}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    // Try to surface the FastAPI error detail if available.
    let detail: string = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail ?? JSON.stringify(body);
    } catch {
      // Response body was not JSON — keep statusText.
    }
    throw new Error(`API error ${res.status} on ${options.method ?? "GET"} ${path}: ${detail}`);
  }

  // 204 No Content — return empty object cast to T.
  if (res.status === 204) return {} as T;

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Supervisors
// ---------------------------------------------------------------------------

export async function getSupervisors(): Promise<Supervisor[]> {
  return apiFetch<Supervisor[]>("/api/supervisors");
}

export async function createSupervisor(
  data: CreateSupervisorPayload
): Promise<Supervisor> {
  return apiFetch<Supervisor>("/api/supervisors", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getSupervisor(id: string): Promise<Supervisor> {
  return apiFetch<Supervisor>(`/api/supervisors/${id}`);
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export async function getRuns(): Promise<Run[]> {
  return apiFetch<Run[]>("/api/runs");
}

export async function createRun(data: CreateRunPayload): Promise<Run> {
  return apiFetch<Run>("/api/runs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getRun(id: string): Promise<RunDetail> {
  return apiFetch<RunDetail>(`/api/runs/${id}`);
}

// ---------------------------------------------------------------------------
// Run lifecycle signals
// ---------------------------------------------------------------------------

export async function sendEvent(
  runId: string,
  eventType: string,
  payload: Record<string, unknown> = {}
): Promise<{ success: boolean; event_type: string; will_wake: boolean }> {
  return apiFetch(`/api/runs/${runId}/events`, {
    method: "POST",
    body: JSON.stringify({ event_type: eventType, payload }),
  });
}

export async function addInstruction(
  runId: string,
  instruction: string
): Promise<{ success: boolean }> {
  return apiFetch(`/api/runs/${runId}/instructions`, {
    method: "POST",
    body: JSON.stringify({ instruction }),
  });
}

export async function interruptRun(runId: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/runs/${runId}/interrupt`, { method: "POST" });
}

export async function resumeRun(runId: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/runs/${runId}/resume`, { method: "POST" });
}

export async function terminateRun(runId: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/runs/${runId}/terminate`, { method: "POST" });
}
