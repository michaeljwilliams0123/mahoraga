import { createHash } from "node:crypto";
import { classifyCopilotHarnessUsage, isZeroMarginalCreditEligible, validateMicrosoftBillingClass } from "./microsoft-usage-cost.mjs";

export const COPILOT_HARNESS_DESCRIPTOR_SCHEMA_VERSION = 1;

const HARNESS_TYPES = new Set(["standard-harness", "copilot-chat-harness", "github-copilot-harness", "unknown"]);
const MODEL_STATUSES = new Set(["production", "preview", "experimental", "unknown"]);
const EVALUATION_STATES = new Set(["passing", "failing", "unknown"]);
const DATA_CLASSES = new Set(["synthetic", "personal", "enterprise", "local-only"]);
const INPUT_KEYS = new Set([
  "alias", "harnessType", "published", "connectable", "capabilityClasses", "instructionsSummary",
  "knowledgeCategories", "toolKinds", "skillNames", "connectedAgentAliases", "modelClass", "modelStatus",
  "memoryEnabled", "evaluation", "monitoring", "authorityScopes", "dataClasses", "observedAt",
]);
const OUTPUT_KEYS = new Set([
  "schemaVersion", "descriptorId", "alias", "harnessType", "published", "connectable", "capabilityClasses",
  "instructionsFingerprint", "knowledgeCategories", "toolKinds", "skillNames", "connectedAgentAliases",
  "modelClass", "modelStatus", "memoryEnabled", "evaluation", "monitoring", "authorityScopes", "dataClasses",
  "billingClass", "zeroCreditEligible", "observedAt",
]);
const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const URL = /https?:\/\/[^\s]+/i;
const SENSITIVE = [
  /authorization\s*:\s*bearer\s+[a-z0-9._~+\/-]{12,}/i,
  /\bgithub_pat_[a-z0-9_]{20,}\b/i,
  /\bgh[pousr]_[a-z0-9]{20,}\b/i,
  /\bsk-(?:proj-)?[a-z0-9_-]{20,}\b/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:password|client_secret|connection_string)\s*[:=]\s*[^\s,;]{8,}/i,
];

export function createCopilotHarnessDescriptor(input) {
  exact(input, INPUT_KEYS, "copilot-harness-descriptor-invalid");
  const core = normalizeInput(input);
  const descriptorId = `chd-${digest(identityCore(core)).slice(0, 32)}`;
  return validateCopilotHarnessDescriptor({ schemaVersion: 1, descriptorId, ...core });
}

export function validateCopilotHarnessDescriptor(value) {
  exact(value, OUTPUT_KEYS, "copilot-harness-descriptor-invalid");
  if (value.schemaVersion !== COPILOT_HARNESS_DESCRIPTOR_SCHEMA_VERSION) fail("copilot-harness-descriptor-invalid");
  const core = normalizeOutput(value);
  const expectedId = `chd-${digest(identityCore(core)).slice(0, 32)}`;
  if (value.descriptorId !== expectedId) fail("copilot-harness-descriptor-id-mismatch");
  return deepFreeze({ schemaVersion: 1, descriptorId: value.descriptorId, ...core });
}

export function buildCopilotHarnessTopology(descriptors, { maximumConnectedAgents = 8, maximumDepth = 2 } = {}) {
  if (!Array.isArray(descriptors) || descriptors.length > 32 || !Number.isSafeInteger(maximumConnectedAgents) || maximumConnectedAgents < 1 || maximumConnectedAgents > 8 || !Number.isSafeInteger(maximumDepth) || maximumDepth < 1 || maximumDepth > 4) {
    fail("copilot-harness-topology-invalid");
  }
  const validated = descriptors.map(validateCopilotHarnessDescriptor).sort((a, b) => a.alias.localeCompare(b.alias));
  const byAlias = new Map();
  for (const descriptor of validated) {
    if (byAlias.has(descriptor.alias)) fail("copilot-harness-topology-invalid");
    if (descriptor.connectedAgentAliases.length > maximumConnectedAgents) fail("copilot-harness-topology-invalid");
    byAlias.set(descriptor.alias, descriptor);
  }
  const edges = [];
  for (const descriptor of validated) {
    for (const target of descriptor.connectedAgentAliases) {
      if (target === descriptor.alias || !byAlias.has(target)) fail("copilot-harness-topology-invalid");
      edges.push({ from: descriptor.alias, to: target });
    }
  }
  assertDepthAndAcyclic(byAlias, maximumDepth);
  return deepFreeze({
    schemaVersion: 1,
    maximumDepth,
    nodes: validated.map((descriptor) => ({
      alias: descriptor.alias,
      harnessType: descriptor.harnessType,
      published: descriptor.published,
      connectable: descriptor.connectable,
      billingClass: descriptor.billingClass,
      zeroCreditEligible: descriptor.zeroCreditEligible,
    })),
    edges: edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
  });
}

export function assessCopilotConnectedAgentRoutingDescriptions(entries, { maximumAgents = 8 } = {}) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > maximumAgents || !Number.isSafeInteger(maximumAgents) || maximumAgents < 1 || maximumAgents > 8) {
    fail("copilot-connected-agent-routing-invalid");
  }
  const aliases = new Set();
  const agents = entries.map((entry) => {
    exact(entry, new Set(["alias", "description"]), "copilot-connected-agent-routing-invalid");
    const alias = slug(entry.alias, 96, "copilot-connected-agent-routing-invalid");
    if (aliases.has(alias)) fail("copilot-connected-agent-routing-invalid");
    aliases.add(alias);
    const description = text(entry.description, 1024, "copilot-connected-agent-routing-invalid");
    assertSafe([description]);
    const normalizedDescription = description.replace(/\s+/g, " ").trim().toLowerCase();
    return { alias, descriptionFingerprint: digest(normalizedDescription) };
  }).sort((a, b) => a.alias.localeCompare(b.alias));
  const groups = new Map();
  for (const agent of agents) {
    const group = groups.get(agent.descriptionFingerprint) ?? [];
    group.push(agent.alias);
    groups.set(agent.descriptionFingerprint, group);
  }
  const conflicts = [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({ aliases: group.sort(), reason: "duplicate-description" }))
    .sort((a, b) => a.aliases[0].localeCompare(b.aliases[0]));
  return deepFreeze({ schemaVersion: 1, distinct: conflicts.length === 0, agents, conflicts });
}

function normalizeInput(input) {
  const instructionsSummary = text(input.instructionsSummary, 1024, "copilot-harness-instructions-invalid");
  assertSafe([instructionsSummary]);
  const harnessType = allowed(input.harnessType, HARNESS_TYPES, "copilot-harness-type-invalid");
  const billingClass = classifyCopilotHarnessUsage({ harnessType, operation: "execute" });
  return {
    alias: slug(input.alias, 96, "copilot-harness-alias-invalid"),
    harnessType,
    published: boolean(input.published, "copilot-harness-state-invalid"),
    connectable: boolean(input.connectable, "copilot-harness-state-invalid"),
    capabilityClasses: tokenList(input.capabilityClasses, 16, 64, "copilot-harness-capabilities-invalid"),
    instructionsFingerprint: digest(instructionsSummary),
    knowledgeCategories: tokenList(input.knowledgeCategories, 16, 64, "copilot-harness-knowledge-invalid"),
    toolKinds: tokenList(input.toolKinds, 16, 64, "copilot-harness-tools-invalid"),
    skillNames: tokenList(input.skillNames, 16, 96, "copilot-harness-skills-invalid"),
    connectedAgentAliases: tokenList(input.connectedAgentAliases, 8, 96, "copilot-harness-connected-agents-invalid"),
    modelClass: slug(input.modelClass, 96, "copilot-harness-model-invalid"),
    modelStatus: allowed(input.modelStatus, MODEL_STATUSES, "copilot-harness-model-invalid"),
    memoryEnabled: boolean(input.memoryEnabled, "copilot-harness-memory-invalid"),
    evaluation: normalizeEvaluation(input.evaluation),
    monitoring: normalizeMonitoring(input.monitoring),
    authorityScopes: tokenList(input.authorityScopes, 16, 96, "copilot-harness-authority-invalid"),
    dataClasses: enumList(input.dataClasses, DATA_CLASSES, 8, "copilot-harness-data-class-invalid"),
    billingClass,
    zeroCreditEligible: isZeroMarginalCreditEligible(billingClass),
    observedAt: timestamp(input.observedAt, "copilot-harness-observed-at-invalid"),
  };
}

function normalizeOutput(value) {
  const harnessType = allowed(value.harnessType, HARNESS_TYPES, "copilot-harness-type-invalid");
  const billingClass = validateMicrosoftBillingClass(value.billingClass);
  const expectedBillingClass = classifyCopilotHarnessUsage({ harnessType, operation: "execute" });
  if (billingClass !== expectedBillingClass || value.zeroCreditEligible !== isZeroMarginalCreditEligible(billingClass)) fail("copilot-harness-billing-invalid");
  return {
    alias: slug(value.alias, 96, "copilot-harness-alias-invalid"),
    harnessType,
    published: boolean(value.published, "copilot-harness-state-invalid"),
    connectable: boolean(value.connectable, "copilot-harness-state-invalid"),
    capabilityClasses: tokenList(value.capabilityClasses, 16, 64, "copilot-harness-capabilities-invalid"),
    instructionsFingerprint: sha64(value.instructionsFingerprint, "copilot-harness-instructions-invalid"),
    knowledgeCategories: tokenList(value.knowledgeCategories, 16, 64, "copilot-harness-knowledge-invalid"),
    toolKinds: tokenList(value.toolKinds, 16, 64, "copilot-harness-tools-invalid"),
    skillNames: tokenList(value.skillNames, 16, 96, "copilot-harness-skills-invalid"),
    connectedAgentAliases: tokenList(value.connectedAgentAliases, 8, 96, "copilot-harness-connected-agents-invalid"),
    modelClass: slug(value.modelClass, 96, "copilot-harness-model-invalid"),
    modelStatus: allowed(value.modelStatus, MODEL_STATUSES, "copilot-harness-model-invalid"),
    memoryEnabled: boolean(value.memoryEnabled, "copilot-harness-memory-invalid"),
    evaluation: normalizeEvaluation(value.evaluation),
    monitoring: normalizeMonitoring(value.monitoring),
    authorityScopes: tokenList(value.authorityScopes, 16, 96, "copilot-harness-authority-invalid"),
    dataClasses: enumList(value.dataClasses, DATA_CLASSES, 8, "copilot-harness-data-class-invalid"),
    billingClass,
    zeroCreditEligible: value.zeroCreditEligible,
    observedAt: timestamp(value.observedAt, "copilot-harness-observed-at-invalid"),
  };
}

function normalizeEvaluation(value) {
  exact(value, new Set(["state", "score", "observedAt"]), "copilot-harness-evaluation-invalid");
  const score = value.score;
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) fail("copilot-harness-evaluation-invalid");
  return deepFreeze({ state: allowed(value.state, EVALUATION_STATES, "copilot-harness-evaluation-invalid"), score, observedAt: timestamp(value.observedAt, "copilot-harness-evaluation-invalid") });
}

function normalizeMonitoring(value) {
  exact(value, new Set(["successRate", "latencyMs", "observedAt"]), "copilot-harness-monitoring-invalid");
  if (typeof value.successRate !== "number" || !Number.isFinite(value.successRate) || value.successRate < 0 || value.successRate > 1) fail("copilot-harness-monitoring-invalid");
  if (!Number.isSafeInteger(value.latencyMs) || value.latencyMs < 0 || value.latencyMs > 3_600_000) fail("copilot-harness-monitoring-invalid");
  return deepFreeze({ successRate: value.successRate, latencyMs: value.latencyMs, observedAt: timestamp(value.observedAt, "copilot-harness-monitoring-invalid") });
}

function identityCore(value) {
  return {
    alias: value.alias,
    harnessType: value.harnessType,
    published: value.published,
    connectable: value.connectable,
    capabilityClasses: [...value.capabilityClasses],
    instructionsFingerprint: value.instructionsFingerprint,
    knowledgeCategories: [...value.knowledgeCategories],
    toolKinds: [...value.toolKinds],
    skillNames: [...value.skillNames],
    connectedAgentAliases: [...value.connectedAgentAliases],
    modelClass: value.modelClass,
    modelStatus: value.modelStatus,
    memoryEnabled: value.memoryEnabled,
    evaluation: value.evaluation,
    monitoring: value.monitoring,
    authorityScopes: [...value.authorityScopes],
    dataClasses: [...value.dataClasses],
    billingClass: value.billingClass,
    zeroCreditEligible: value.zeroCreditEligible,
    observedAt: value.observedAt,
  };
}

function assertDepthAndAcyclic(byAlias, maximumDepth) {
  const visiting = new Set();
  const visited = new Set();
  const walk = (alias, depth) => {
    if (depth > maximumDepth) fail("copilot-harness-topology-invalid");
    if (visiting.has(alias)) fail("copilot-harness-topology-invalid");
    if (visited.has(`${alias}:${depth}`)) return;
    visiting.add(alias);
    for (const target of byAlias.get(alias)?.connectedAgentAliases ?? []) walk(target, depth + 1);
    visiting.delete(alias);
    visited.add(`${alias}:${depth}`);
  };
  for (const alias of byAlias.keys()) walk(alias, 0);
}

function exact(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function tokenList(value, maximumItems, maximumLength, code) {
  if (!Array.isArray(value) || value.length > maximumItems || new Set(value).size !== value.length) fail(code);
  assertSafe(value.filter((item) => typeof item === "string"));
  const result = value.map((item) => slug(item, maximumLength, code)).sort();
  return deepFreeze(result);
}

function enumList(value, allowedValues, maximumItems, code) {
  if (!Array.isArray(value) || value.length > maximumItems || new Set(value).size !== value.length) fail(code);
  const result = value.map((item) => allowed(item, allowedValues, code)).sort();
  return deepFreeze(result);
}

function slug(value, maximumLength, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximumLength || !/^[a-z0-9][a-z0-9.-]*$/.test(value)) fail(code);
  assertSafe([value]);
  return value;
}

function text(value, maximumLength, code) {
  if (typeof value !== "string") fail(code);
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maximumLength || normalized.includes("\0")) fail(code);
  return normalized;
}

function allowed(value, values, code) {
  if (!values.has(value)) fail(code);
  return value;
}

function boolean(value, code) {
  if (typeof value !== "boolean") fail(code);
  return value;
}

function timestamp(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code);
  return value;
}

function sha64(value, code) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(code);
  return value;
}

function assertSafe(values) {
  const textValue = values.join("\n");
  if (GUID.test(textValue) || EMAIL.test(textValue) || URL.test(textValue) || SENSITIVE.some((pattern) => pattern.test(textValue))) fail("copilot-harness-sensitive-content");
}

function digest(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value), "utf8").digest("hex");
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

function fail(code) {
  throw new TypeError(code);
}
