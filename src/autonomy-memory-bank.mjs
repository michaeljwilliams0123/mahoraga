import { createHash } from "node:crypto";
import { createInstitutionalMemoryRecord, reconcileInstitutionalMemory, validateInstitutionalMemoryRecord } from "./institutional-memory.mjs";
import { reconcileObjectiveEconomy, validateObjectiveCandidate } from "./objective-economy.mjs";

export const AUTONOMY_MEMORY_BANK_SCHEMA_VERSION = 1;

const BANK_KEYS = new Set([
  "schemaVersion",
  "kind",
  "operationalEvents",
  "institutionalMemory",
  "objectives",
  "objectiveTemplates",
  "connectorRecords",
  "observedAt",
  "creditCost",
  "paidFallback",
]);
const OPERATIONAL_KEYS = new Set(["schemaVersion", "eventId", "eventClass", "source", "connectorId", "objectiveId", "correlationId", "status", "reasonCode", "observedAt", "zeroCredit", "providerRequired"]);
const TEMPLATE_KEYS = new Set(["schemaVersion", "templateId", "title", "triggerClass", "actionPackId", "preferredConnectorFamily", "recurrence", "confidence", "requiresApproval", "lastUsedAt", "updatedAt", "zeroCredit", "providerRequired"]);
const CONNECTOR_KEYS = new Set(["schemaVersion", "connectorId", "family", "trustState", "capabilities", "lastHealthyAt", "lastFailureCode", "zeroCreditReady", "updatedAt", "zeroCredit", "providerRequired"]);
const EVENT_CLASSES = new Set(["receipt", "retry", "dead-letter", "readiness", "route-outcome"]);
const EVENT_STATUSES = new Set(["observed", "accepted", "held", "failed", "completed"]);
const CONNECTOR_FAMILIES = new Set(["github", "microsoft", "google", "file", "queue", "owner"]);
const TRUST_STATES = new Set(["unknown", "ready", "degraded", "blocked"]);
const TRIGGER_CLASSES = new Set(["message", "schedule", "file-change", "repository-event", "manual"]);

export function emptyAutonomyMemoryBank() {
  return deepFreeze({
    schemaVersion: AUTONOMY_MEMORY_BANK_SCHEMA_VERSION,
    kind: "autonomy-memory-bank",
    operationalEvents: [],
    institutionalMemory: reconcileInstitutionalMemory({ records: [], incoming: [], now: "1970-01-01T00:00:00.000Z" }),
    objectives: [],
    objectiveTemplates: [],
    connectorRecords: [],
    observedAt: null,
    creditCost: 0,
    paidFallback: false,
  });
}

export function validateAutonomyMemoryBank(value) {
  exact(value, BANK_KEYS, "autonomy-memory-bank-invalid");
  if (value.schemaVersion !== AUTONOMY_MEMORY_BANK_SCHEMA_VERSION || value.kind !== "autonomy-memory-bank") fail("autonomy-memory-bank-invalid");
  if (value.creditCost !== 0 || value.paidFallback !== false) fail("autonomy-memory-bank-provider-boundary-invalid");
  const operationalEvents = normalizeOperationalEvents(value.operationalEvents);
  const institutionalMemory = normalizeInstitutionalMemory(value.institutionalMemory);
  const objectives = normalizeObjectives(value.objectives);
  const objectiveTemplates = normalizeObjectiveTemplates(value.objectiveTemplates);
  const connectorRecords = normalizeConnectorRecords(value.connectorRecords);
  const observedAt = value.observedAt === null ? null : timestamp(value.observedAt, "autonomy-memory-bank-invalid");
  return deepFreeze({
    schemaVersion: AUTONOMY_MEMORY_BANK_SCHEMA_VERSION,
    kind: "autonomy-memory-bank",
    operationalEvents,
    institutionalMemory,
    objectives,
    objectiveTemplates,
    connectorRecords,
    observedAt,
    creditCost: 0,
    paidFallback: false,
  });
}

export function reconcileAutonomyMemoryBank({
  memory = null,
  operationalIncoming = [],
  institutionalIncoming = [],
  objectiveIncoming = [],
  objectiveTemplateIncoming = [],
  connectorIncoming = [],
  now = new Date().toISOString(),
} = {}) {
  const current = memory == null ? emptyAutonomyMemoryBank() : validateAutonomyMemoryBank(memory);
  const timestampNow = timestamp(now, "autonomy-memory-bank-invalid");
  const operationalEvents = normalizeOperationalEvents([...current.operationalEvents, ...operationalIncoming]);
  const institutionalRecords = reconcileInstitutionalMemory({
    records: current.institutionalMemory.records,
    incoming: institutionalIncoming.map((item) => item?.schemaVersion ? validateInstitutionalMemoryRecord(item) : createInstitutionalMemoryRecord(item, { observedAt: timestampNow })),
    now: timestampNow,
  });
  const objectives = reconcileObjectiveEconomy(objectiveIncoming, current.objectives);
  const objectiveTemplates = normalizeObjectiveTemplates([...current.objectiveTemplates, ...objectiveTemplateIncoming]);
  const connectorRecords = normalizeConnectorRecords([...current.connectorRecords, ...connectorIncoming]);
  return deepFreeze({
    schemaVersion: AUTONOMY_MEMORY_BANK_SCHEMA_VERSION,
    kind: "autonomy-memory-bank",
    operationalEvents,
    institutionalMemory: institutionalRecords,
    objectives,
    objectiveTemplates,
    connectorRecords,
    observedAt: timestampNow,
    creditCost: 0,
    paidFallback: false,
  });
}

export function summarizeAutonomyMemoryBank(memory) {
  const current = validateAutonomyMemoryBank(memory);
  return deepFreeze({
    kind: current.kind,
    schemaVersion: current.schemaVersion,
    operationalEventCount: current.operationalEvents.length,
    institutionalMemoryCount: current.institutionalMemory.records.length,
    objectiveCount: current.objectives.length,
    objectiveTemplateCount: current.objectiveTemplates.length,
    connectorCount: current.connectorRecords.length,
    activeConnectorCount: current.connectorRecords.filter((item) => item.trustState === "ready" && item.zeroCreditReady).length,
    fingerprint: digest({
      operationalEventIds: current.operationalEvents.map((item) => item.eventId),
      institutionalMemory: current.institutionalMemory.fingerprint,
      objectiveIds: current.objectives.map((item) => item.objectiveId),
      templateIds: current.objectiveTemplates.map((item) => item.templateId),
      connectorIds: current.connectorRecords.map((item) => item.connectorId),
    }),
    observedAt: current.observedAt,
    creditCost: 0,
    paidFallback: false,
  });
}

function normalizeOperationalEvents(value) {
  if (!Array.isArray(value) || value.length > 4096) fail("autonomy-memory-bank-invalid");
  const byId = new Map();
  for (const raw of value) {
    const record = validateOperationalEvent(raw);
    const current = byId.get(record.eventId);
    if (current && JSON.stringify(current) !== JSON.stringify(record)) fail("autonomy-memory-operational-conflict");
    byId.set(record.eventId, record);
  }
  return deepFreeze([...byId.values()].sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.eventId.localeCompare(b.eventId)));
}

function normalizeInstitutionalMemory(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.records)) fail("autonomy-memory-bank-invalid");
  return reconcileInstitutionalMemory({ records: value.records, incoming: [], now: value.records.at(-1)?.observedAt ?? "1970-01-01T00:00:00.000Z" });
}

function normalizeObjectives(value) {
  if (!Array.isArray(value)) fail("autonomy-memory-bank-invalid");
  return reconcileObjectiveEconomy([], value.map(validateObjectiveCandidate));
}

function normalizeObjectiveTemplates(value) {
  if (!Array.isArray(value) || value.length > 1024) fail("autonomy-memory-bank-invalid");
  const byId = new Map();
  for (const raw of value) {
    const record = validateObjectiveTemplate(raw);
    const current = byId.get(record.templateId);
    if (!current || record.updatedAt > current.updatedAt) byId.set(record.templateId, record);
  }
  return deepFreeze([...byId.values()].sort((a, b) => a.templateId.localeCompare(b.templateId)));
}

function normalizeConnectorRecords(value) {
  if (!Array.isArray(value) || value.length > 512) fail("autonomy-memory-bank-invalid");
  const byId = new Map();
  for (const raw of value) {
    const record = validateConnectorRecord(raw);
    const current = byId.get(record.connectorId);
    if (!current || record.updatedAt > current.updatedAt) byId.set(record.connectorId, record);
  }
  return deepFreeze([...byId.values()].sort((a, b) => a.connectorId.localeCompare(b.connectorId)));
}

export function validateOperationalEvent(value) {
  exact(value, OPERATIONAL_KEYS, "autonomy-operational-event-invalid");
  if (value.schemaVersion !== 1 || value.zeroCredit !== true || value.providerRequired !== false) fail("autonomy-operational-event-invalid");
  return deepFreeze({
    schemaVersion: 1,
    eventId: bounded(value.eventId, 96, "autonomy-operational-event-invalid", /^[a-z][a-z0-9-]{3,95}$/),
    eventClass: allowed(value.eventClass, EVENT_CLASSES, "autonomy-operational-event-invalid"),
    source: bounded(value.source, 64, "autonomy-operational-event-invalid", /^[a-z][a-z0-9-]{1,63}$/),
    connectorId: bounded(value.connectorId, 64, "autonomy-operational-event-invalid", /^[a-z][a-z0-9-]{1,63}$/),
    objectiveId: bounded(value.objectiveId, 96, "autonomy-operational-event-invalid", /^[a-z0-9][a-z0-9-]{1,95}$/),
    correlationId: bounded(value.correlationId, 128, "autonomy-operational-event-invalid", /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
    status: allowed(value.status, EVENT_STATUSES, "autonomy-operational-event-invalid"),
    reasonCode: bounded(value.reasonCode, 96, "autonomy-operational-event-invalid", /^[a-z][a-z0-9.-]{1,95}$/),
    observedAt: timestamp(value.observedAt, "autonomy-operational-event-invalid"),
    zeroCredit: true,
    providerRequired: false,
  });
}

export function validateObjectiveTemplate(value) {
  exact(value, TEMPLATE_KEYS, "autonomy-objective-template-invalid");
  if (value.schemaVersion !== 1 || value.zeroCredit !== true || value.providerRequired !== false) fail("autonomy-objective-template-invalid");
  return deepFreeze({
    schemaVersion: 1,
    templateId: bounded(value.templateId, 96, "autonomy-objective-template-invalid", /^[a-z][a-z0-9-]{3,95}$/),
    title: safeText(value.title, 240, "autonomy-objective-template-invalid"),
    triggerClass: allowed(value.triggerClass, TRIGGER_CLASSES, "autonomy-objective-template-invalid"),
    actionPackId: bounded(value.actionPackId, 64, "autonomy-objective-template-invalid", /^[a-z][a-z0-9-]{1,63}$/),
    preferredConnectorFamily: allowed(value.preferredConnectorFamily, CONNECTOR_FAMILIES, "autonomy-objective-template-invalid"),
    recurrence: bounded(value.recurrence, 64, "autonomy-objective-template-invalid", /^(?:once|hourly|daily|weekly|monthly|on-change)$/),
    confidence: boundedNumber(value.confidence, 0, 1, "autonomy-objective-template-invalid"),
    requiresApproval: value.requiresApproval === true,
    lastUsedAt: value.lastUsedAt === null ? null : timestamp(value.lastUsedAt, "autonomy-objective-template-invalid"),
    updatedAt: timestamp(value.updatedAt, "autonomy-objective-template-invalid"),
    zeroCredit: true,
    providerRequired: false,
  });
}

export function validateConnectorRecord(value) {
  exact(value, CONNECTOR_KEYS, "autonomy-connector-record-invalid");
  if (value.schemaVersion !== 1 || value.zeroCredit !== true || value.providerRequired !== false) fail("autonomy-connector-record-invalid");
  if (!Array.isArray(value.capabilities) || value.capabilities.length > 32 || new Set(value.capabilities).size !== value.capabilities.length) fail("autonomy-connector-record-invalid");
  return deepFreeze({
    schemaVersion: 1,
    connectorId: bounded(value.connectorId, 64, "autonomy-connector-record-invalid", /^[a-z][a-z0-9-]{1,63}$/),
    family: allowed(value.family, CONNECTOR_FAMILIES, "autonomy-connector-record-invalid"),
    trustState: allowed(value.trustState, TRUST_STATES, "autonomy-connector-record-invalid"),
    capabilities: deepFreeze(value.capabilities.map((item) => bounded(item, 64, "autonomy-connector-record-invalid", /^[a-z][a-z0-9.-]{1,63}$/)).sort()),
    lastHealthyAt: value.lastHealthyAt === null ? null : timestamp(value.lastHealthyAt, "autonomy-connector-record-invalid"),
    lastFailureCode: value.lastFailureCode === null ? null : bounded(value.lastFailureCode, 96, "autonomy-connector-record-invalid", /^[a-z][a-z0-9.-]{1,95}$/),
    zeroCreditReady: value.zeroCreditReady === true,
    updatedAt: timestamp(value.updatedAt, "autonomy-connector-record-invalid"),
    zeroCredit: true,
    providerRequired: false,
  });
}

function exact(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail(code);
}

function timestamp(value, code) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  const time = Date.parse(text);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== text) fail(code);
  return text;
}

function bounded(value, maximum, code, pattern) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r\n]/.test(value) || !pattern.test(value)) fail(code);
  return value;
}

function safeText(value, maximum, code) {
  if (typeof value !== "string") fail(code);
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > maximum || /[\0]/.test(value)) fail(code);
  return normalized;
}

function allowed(value, values, code) {
  if (!values.has(value)) fail(code);
  return value;
}

function boundedNumber(value, minimum, maximum, code) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) fail(code);
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
