import { createHash } from "node:crypto";

const ACTIVE_STATES = new Set(["open", "recovering", "failed", "rolled-back"]);
const TRANSITIONS = Object.freeze({
  "recovery-attempted": { status: "recovering", recoveryState: "attempted" },
  "recovery-verified": { status: "open", recoveryState: "verified" },
  "recovery-failed": { status: "failed", recoveryState: "failed" },
  "recovery-rolled-back": { status: "rolled-back", recoveryState: "rolled-back" },
});

export function repairIncidentId(issue, baselineVersion) {
  const normalized = normalizeIssue(issue, baselineVersion);
  return `rpi-${createHash("sha256").update(JSON.stringify({
    relative: normalized.relative,
    expectedSha256: normalized.expectedSha256,
    condition: normalized.condition,
    baselineVersion: normalized.baselineVersion,
  }), "utf8").digest("hex").slice(0, 32)}`;
}

export function reconcileRepairIncidents(previous, current, { baselineVersion, now = () => new Date() } = {}) {
  if (!Array.isArray(previous) || !Array.isArray(current)) throw incidentError("repair-incidents-invalid");
  const observedAt = normalizeTime(now());
  const previousById = new Map(previous.map((item) => {
    const incident = normalizeIncident(item);
    return [incident.id, incident];
  }));
  const currentById = new Map(current.map((issue) => {
    const normalized = normalizeIssue(issue, baselineVersion);
    const id = repairIncidentId(normalized, normalized.baselineVersion);
    return [id, normalized];
  }));
  const incidents = [];
  const events = [];

  for (const [id, issue] of currentById) {
    const existing = previousById.get(id);
    if (existing && ACTIVE_STATES.has(existing.status)) {
      incidents.push(existing);
      continue;
    }
    const incident = Object.freeze({
      id, ...issue, status: "open", recoveryState: "not-attempted",
      openedAt: observedAt, updatedAt: observedAt, resolvedAt: null, lastErrorCode: null,
    });
    incidents.push(incident);
    events.push(Object.freeze({ type: "repair-incident-opened", incident, occurredAt: observedAt }));
  }

  for (const existing of previousById.values()) {
    if (currentById.has(existing.id)) continue;
    if (!ACTIVE_STATES.has(existing.status)) { incidents.push(existing); continue; }
    const resolved = Object.freeze({ ...existing, status: "resolved", updatedAt: observedAt, resolvedAt: observedAt });
    incidents.push(resolved);
    events.push(Object.freeze({ type: "repair-incident-resolved", incident: resolved, occurredAt: observedAt }));
  }
  return Object.freeze({ incidents: Object.freeze(incidents.sort((a, b) => a.id.localeCompare(b.id))), events: Object.freeze(events) });
}

export function advanceRepairIncident(value, transition, { errorCode = null, now = () => new Date() } = {}) {
  const incident = normalizeIncident(value);
  const target = TRANSITIONS[transition];
  if (!target || !ACTIVE_STATES.has(incident.status)) throw incidentError("repair-incident-transition-invalid");
  if (errorCode !== null && (typeof errorCode !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(errorCode))) throw incidentError("repair-incident-error-code-invalid");
  const occurredAt = normalizeTime(now());
  const updated = Object.freeze({ ...incident, ...target, updatedAt: occurredAt, lastErrorCode: errorCode });
  return Object.freeze({ incident: updated, event: Object.freeze({ type: `repair-incident-${transition}`, incident: updated, occurredAt }) });
}

function normalizeIssue(value, baselineVersion) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw incidentError("repair-issue-invalid");
  const relative = normalizeRelative(value.relative);
  const condition = normalizeSlug(value.condition ?? value.code, "repair-condition-invalid");
  const version = normalizeVersion(value.baselineVersion ?? baselineVersion);
  return Object.freeze({
    relative,
    condition,
    expectedSha256: normalizeDigest(value.expectedSha256, true),
    observedSha256: normalizeDigest(value.observedSha256, true),
    baselineVersion: version,
  });
}

function normalizeIncident(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.id !== "string" || !/^rpi-[a-f0-9]{32}$/.test(value.id)) throw incidentError("repair-incident-invalid");
  if (!new Set([...ACTIVE_STATES, "resolved"]).has(value.status) || !new Set(["not-attempted", "attempted", "verified", "failed", "rolled-back"]).has(value.recoveryState)) throw incidentError("repair-incident-state-invalid");
  const normalized = normalizeIssue(value, value.baselineVersion);
  for (const item of [value.openedAt, value.updatedAt]) normalizeTime(item);
  if (value.resolvedAt !== null) normalizeTime(value.resolvedAt);
  if (value.lastErrorCode !== null && (typeof value.lastErrorCode !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value.lastErrorCode))) throw incidentError("repair-incident-error-code-invalid");
  return Object.freeze({ id: value.id, ...normalized, status: value.status, recoveryState: value.recoveryState, openedAt: value.openedAt, updatedAt: value.updatedAt, resolvedAt: value.resolvedAt, lastErrorCode: value.lastErrorCode });
}

function normalizeRelative(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240 || value.startsWith("/") || value.includes("\\") || /[\u0000-\u001f\u007f:*?]/.test(value) || value.split("/").some((part) => !part || part === "." || part === "..")) throw incidentError("repair-relative-invalid");
  return value;
}
function normalizeSlug(value, code) { if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(value)) throw incidentError(code); return value; }
function normalizeVersion(value) { if (typeof value !== "string" || value.length < 1 || value.length > 120 || /[\r\n\u0000]/.test(value)) throw incidentError("repair-baseline-version-invalid"); return value; }
function normalizeDigest(value, nullable) { if (nullable && value === null) return null; if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw incidentError("repair-digest-invalid"); return value; }
function normalizeTime(value) { const date = value instanceof Date ? value : new Date(value); if (!Number.isFinite(date.getTime())) throw incidentError("repair-time-invalid"); return date.toISOString(); }
function incidentError(code) { const error = new Error(code); error.code = code; return error; }
