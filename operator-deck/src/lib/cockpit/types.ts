/** Pure cockpit contracts for Mahoraga.v2 — no browser write authority. */

export const COCKPIT_PANEL_IDS = ["mesh", "cloud", "workspace"] as const;
export type CockpitPanelId = (typeof COCKPIT_PANEL_IDS)[number];

export type OwnerSessionState = "absent" | "present" | "unknown";

export type FailClosedReason =
  | "owner-session-required"
  | "browser-fleet-authority-denied"
  | "paid-fallback-denied"
  | "hard-deny"
  | "core-not-paired"
  | "adapter-input-invalid";

export type FailClosedResult = {
  ok: false;
  reason: FailClosedReason;
  detail: string;
};

export type OkResult<T> = {
  ok: true;
  value: T;
};

export type AdapterResult<T> = OkResult<T> | FailClosedResult;

export type CockpitPanelModel = {
  id: CockpitPanelId;
  title: string;
  tone: "ok" | "warn" | "danger" | "steel" | "neutral";
  summary: string;
  lines: ReadonlyArray<{ label: string; value: string }>;
  actionable: false;
};

export type AutomationIntent =
  | { kind: "starter"; command: string }
  | { kind: "credit-free-preview"; healthOk: boolean; healthStatus: "healthy" | "degraded" | "unhealthy"; planeOk: boolean; planeReason?: string | null }
  | { kind: "relay-operations"; actionId: "runtime.health-check" | "repository.verify" | "repair.request" | "task.cancel" | "task.retry"; idempotencyKey: string; taskId?: string; incidentId?: string }
  | { kind: "version-ledger" }
  | { kind: "browser-github-write" };

export type AutomationPlan =
  | { surface: "starter"; command: string }
  | { surface: "credit-free"; nextAction: string; executable: boolean }
  | { surface: "relay-operations"; actionId: string; idempotencyKey: string; taskId?: string; incidentId?: string; requiresOwnerConfirmation: boolean }
  | { surface: "version-ledger"; receipt: string };

export type ObservationalHealthCard = {
  ok: boolean;
  product: string;
  executionPlane: string;
  authority: string;
  automaticPaidFallback: boolean;
  browserMaySelectProvider: boolean;
  relaySeesPlaintext: boolean;
};

export type LocalConsoleProbe = {
  provider: "ollama";
  status: "ready" | "soft-fail" | "unavailable";
  creditCost: 0;
  paidFallback: false;
  detail: string;
};
