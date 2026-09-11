import { createPeerLearningEvent, peerEventToInstitutionalMemory } from "./peer-learning.mjs";

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
const RUNTIME_RECORD_KEYS = new Set([
  "correlation_id", "objective", "capability", "source", "evidence_references", "provenance",
  "confidence", "unknowns", "recommended_next_action", "peer_event_type", "statement", "objective_ids", "observed_at",
]);

export function ingestVerifiedStudioLearning({ database, sourceTaskId, record } = {}) {
  if (!database || typeof database.getTask !== "function" || typeof database.listReceipts !== "function" || typeof database.recordStudioLearningIngestion !== "function") fail("studio-learning-database-invalid");
  if (typeof sourceTaskId !== "string" || sourceTaskId.length < 1 || sourceTaskId.length > 120) fail("studio-learning-source-task-invalid");
  if (!record || typeof record !== "object" || Array.isArray(record)) fail("studio-learning-invalid");
  if ("approval_state" in record || "verification_state" in record) fail("studio-learning-trust-field-forbidden");
  for (const key of Object.keys(record)) if (!RUNTIME_RECORD_KEYS.has(key)) fail("studio-learning-field-unknown");

  const task = database.getTask(sourceTaskId);
  if (!task || task.capability !== "studio.delegate" || task.status !== "completed" || task.assignedWorker !== "copilot-studio") fail("studio-learning-source-task-unverified");
  if (task.correlationId !== record.correlation_id) fail("studio-learning-correlation-mismatch");
  const receipt = database.listReceipts(sourceTaskId, 20).find((item) =>
    item?.capability === "studio.delegate" && item?.outcome === "succeeded" && item?.receipt?.details?.verified === true &&
    item?.receipt?.details?.providerEvidence?.authenticated === true && item?.receipt?.details?.providerEvidence?.conversationEstablished === true);
  if (!receipt) fail("studio-learning-provider-evidence-unverified");

  const peerEvent = studioLearningRecordToPeerEvent({ ...record, approval_state: "approved", verification_state: "verified" });
  const memory = peerEventToInstitutionalMemory(peerEvent);
  return database.recordStudioLearningIngestion({ sourceTaskId, peerEvent, memory });
}