export type RuntimeTaskPhase = "active" | "settled" | "unknown";

const ACTIVE_RUNTIME_TASK_STATES = new Set(["queued", "claimed", "running", "verifying"]);
const SETTLED_RUNTIME_TASK_STATES = new Set(["completed", "failed", "cancelled", "waiting", "waiting_for_user"]);

export function runtimeTaskPhase(status: string): RuntimeTaskPhase {
  if (ACTIVE_RUNTIME_TASK_STATES.has(status)) return "active";
  if (SETTLED_RUNTIME_TASK_STATES.has(status)) return "settled";
  return "unknown";
}
