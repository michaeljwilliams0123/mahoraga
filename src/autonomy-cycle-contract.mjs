const KEYS = new Set([
  "schemaVersion", "cycleId", "projectId", "source", "windowStartedAt", "baseSha", "workflowId",
  "maximumDurationMs", "maximumActions", "maximumRepairAttempts", "normalCreditBudget", "hostedComputeSpendCeilingUsd",
]);

const WINDOW_MS = 8 * 60 * 60 * 1_000;

export function deriveAutonomyCycleId(projectId, windowStartedAt) {
  return `${projectId}:${windowStartedAt}`;
}

export function createAutonomyCycleEnvelope({ projectId, windowStartedAt, baseSha }, options) {
  return validateAutonomyCycleEnvelope({
    schemaVersion: 1, cycleId: deriveAutonomyCycleId(projectId, windowStartedAt), projectId, source: "github-schedule", windowStartedAt, baseSha,
    workflowId: "sovereign-eight-hour-cycle", maximumDurationMs: 7_200_000, maximumActions: 12, maximumRepairAttempts: 2,
    normalCreditBudget: 0, hostedComputeSpendCeilingUsd: 0,
  }, options);
}

export function validateAutonomyCycleEnvelope(value, { now, registeredProjectIds, existingCycleIds = [] } = {}) {
  exact(value);
  const current = canonicalNow(now);
  const registered = identifiers(registeredProjectIds, "registered projects");
  const existing = identifiers(existingCycleIds, "existing cycle identities");
  if (value.schemaVersion !== 1) invalid("schema version");
  if (typeof value.projectId !== "string" || !registered.has(value.projectId)) invalid("project");
  if (value.source !== "github-schedule") invalid("source");
  const start = windowStart(value.windowStartedAt);
  if (current < start || current - start >= WINDOW_MS) invalid("stale window");
  if (!/^[a-f0-9]{40}$/.test(value.baseSha)) invalid("base SHA");
  if (value.workflowId !== "sovereign-eight-hour-cycle") invalid("workflow");
  if (value.maximumDurationMs !== 7_200_000) invalid("duration");
  if (value.maximumActions !== 12) invalid("action limit");
  if (value.maximumRepairAttempts !== 2) invalid("repair attempts");
  if (value.normalCreditBudget !== 0) invalid("normal credit budget");
  if (value.hostedComputeSpendCeilingUsd !== 0) invalid("hosted compute spend ceiling");
  if (value.cycleId !== deriveAutonomyCycleId(value.projectId, value.windowStartedAt)) invalid("cycle identity");
  if (existing.has(value.cycleId)) invalid("duplicate cycle identity");
  return Object.freeze(structuredClone(value));
}

function exact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("must be an object");
  for (const key of Object.keys(value)) if (!KEYS.has(key)) throw new TypeError(`Autonomy cycle envelope field is not allowed: ${key}`);
  for (const key of KEYS) if (!Object.hasOwn(value, key)) throw new TypeError(`Autonomy cycle envelope field is missing: ${key}`);
}

function canonicalNow(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) invalid("current time");
  return value.getTime();
}

function windowStart(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:17:00\.000Z$/.test(value)) invalid("window");
  const timestamp = Date.parse(value);
  const date = new Date(timestamp);
  if (!Number.isFinite(timestamp) || date.toISOString() !== value || date.getUTCHours() % 8 !== 0) invalid("window");
  return timestamp;
}

function identifiers(value, label) {
  if (!(Array.isArray(value) || value instanceof Set) || [...value].some((entry) => typeof entry !== "string")) throw new TypeError(`Autonomy cycle ${label} are invalid.`);
  return new Set(value);
}

function invalid(label) {
  throw new TypeError(`Autonomy cycle envelope ${label} is invalid.`);
}
