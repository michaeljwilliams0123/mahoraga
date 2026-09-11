import { createPeerLearningEvent } from "./peer-learning.mjs";

function fail(code) {
  throw new TypeError(code);
}

function text(value, maximum, code) {
  if (typeof value !== "string") fail(code);
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maximum) fail(code);
  return normalized;
}

function stringList(value, maximumItems, maximumLength, code) {
  if (!Array.isArray(value) || value.length > maximumItems) fail(code);
  return value.map((item) => text(item, maximumLength, code));
}

export function studioLearningRecordToPeerEvent(record, options = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    fail("studio-learning-invalid");
  }
  if (record.approval_state !== "approved") fail("studio-learning-not-approved");
  if (record.verification_state !== "verified") fail("studio-learning-not-verified");

  const evidenceRefs = stringList(
    record.evidence_references ?? [], 32, 220, "studio-learning-evidence-invalid",
  );
  const correlationId = text(
    record.correlation_id, 96, "studio-learning-correlation-invalid",
  );
  evidenceRefs.push(`studio-correlation:${correlationId}`);

  const provenance = record.provenance == null
    ? null
    : text(record.provenance, 120, "studio-learning-provenance-invalid");
  if (provenance) evidenceRefs.push(`studio-provenance:${provenance}`);

  const objectiveIds = stringList(
    record.objective_ids ?? [], 32, 96, "studio-learning-objectives-invalid",
  );

  return createPeerLearningEvent({
    source: "copilot-studio-mahoraga",
    eventType: text(record.peer_event_type, 64, "studio-learning-event-type-invalid"),
    capability: text(record.capability, 64, "studio-learning-capability-invalid"),
    statement: text(record.statement, 500, "studio-learning-statement-invalid"),
    confidence: record.confidence,
    objectiveIds,
    evidenceRefs,
    observedAt: record.observed_at || options.observedAt || new Date().toISOString(),
  });
}
