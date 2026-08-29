const KEYS = new Set([
  "schemaVersion", "instructionId", "projectId", "baseCommit", "mode", "providerOrder",
  "normalCreditBudget", "hostedComputeSpendCeilingUsd", "allowedActions",
  "verificationCommandIds", "integration", "maximumFiles", "maximumDurationMs",
  "maximumRepairAttempts", "checkpointRequired", "rollbackRequired",
]);

export const SELF_UPGRADE_REGISTRY = Object.freeze({
  actions: Object.freeze(["project.inspect", "project.patch", "project.verify", "workflow.run"]),
  verifications: Object.freeze(["verify"]),
});

const PROVIDER_ORDER = Object.freeze([
  "codespaces-open-weight",
  "local-open-weight",
  "deterministic-only",
  "waiting-zero-credit-provider",
]);

export function createSelfUpgradeInstruction({ instructionId, baseCommit }) {
  return validateSelfUpgradeInstruction({
    schemaVersion: 1,
    instructionId,
    projectId: "mahoraga",
    baseCommit: String(baseCommit ?? "").toLowerCase(),
    mode: "candidate-only",
    providerOrder: PROVIDER_ORDER,
    normalCreditBudget: 0,
    hostedComputeSpendCeilingUsd: 0,
    allowedActions: [...SELF_UPGRADE_REGISTRY.actions],
    verificationCommandIds: [...SELF_UPGRADE_REGISTRY.verifications],
    integration: "pull-request-only",
    maximumFiles: 16,
    maximumDurationMs: 7_200_000,
    maximumRepairAttempts: 2,
    checkpointRequired: true,
    rollbackRequired: true,
  });
}

export function validateSelfUpgradeInstruction(value, { registry = SELF_UPGRADE_REGISTRY } = {}) {
  exact(value);
  const resolved = validateRegistry(registry);
  if (value.schemaVersion !== 1) invalid("schema version");
  if (typeof value.instructionId !== "string" || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(value.instructionId)) invalid("identifier");
  if (value.projectId !== "mahoraga") invalid("project");
  if (!/^[a-f0-9]{40}$/.test(value.baseCommit)) invalid("base commit");
  if (value.mode !== "candidate-only") invalid("mode");
  exactArray(value.providerOrder, PROVIDER_ORDER, "provider order");
  if (value.normalCreditBudget !== 0) invalid("model credit budget");
  if (value.hostedComputeSpendCeilingUsd !== 0) invalid("compute spend ceiling");
  registryArray(value.allowedActions, resolved.actions, "allowed action identifiers");
  registryArray(value.verificationCommandIds, resolved.verifications, "verification command identifiers");
  if (value.integration !== "pull-request-only") invalid("integration");
  if (value.maximumFiles !== 16) invalid("file limit");
  if (value.maximumDurationMs !== 7_200_000) invalid("duration");
  if (value.maximumRepairAttempts !== 2) invalid("repair attempts");
  if (value.checkpointRequired !== true) invalid("checkpoint");
  if (value.rollbackRequired !== true) invalid("rollback");
  const result = structuredClone(value);
  Object.freeze(result.providerOrder);
  Object.freeze(result.allowedActions);
  Object.freeze(result.verificationCommandIds);
  return Object.freeze(result);
}

export function createSelfUpgradeValidationReceipt(instruction) {
  const validated = validateSelfUpgradeInstruction(instruction);
  return Object.freeze({
    receiptType: "self-upgrade-policy-validation",
    policyType: "static-policy-profile",
    mode: validated.mode,
    executable: false,
    instructionId: validated.instructionId,
    baseCommit: validated.baseCommit,
    allowedActionIds: [...validated.allowedActions],
    verificationIds: [...validated.verificationCommandIds],
  });
}

function validateRegistry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Self-upgrade registry is invalid.");
  if (Object.keys(value).some((key) => !["actions", "verifications"].includes(key))) throw new TypeError("Self-upgrade registry field is not allowed.");
  const actions = registryIds(value.actions, "actions", new RegExp("^[a-z][a-z0-9-]{0,31}[.][a-z][a-z0-9-]{0,31}$"));
  const verifications = registryIds(value.verifications, "verifications", /^[a-z][a-z0-9-]{2,63}$/);
  return { actions, verifications };
}

function registryIds(value, label, pattern) {
  if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length || value.some((id) => typeof id !== "string" || !pattern.test(id))) {
    throw new TypeError(`Self-upgrade registry ${label} are invalid.`);
  }
  return new Set(value);
}

function registryArray(actual, registry, label) {
  if (!Array.isArray(actual) || actual.length !== registry.size || new Set(actual).size !== actual.length || actual.some((id) => !registry.has(id))) invalid(label);
}

function exact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("must be an object");
  for (const key of Object.keys(value)) {
    if (!KEYS.has(key)) throw new TypeError(`Self-upgrade instruction field is not allowed: ${key}`);
  }
  for (const key of KEYS) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`Self-upgrade instruction field is missing: ${key}`);
  }
}

function exactArray(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) invalid(label);
}

function invalid(label) {
  throw new TypeError(`Self-upgrade instruction ${label} is invalid.`);
}
