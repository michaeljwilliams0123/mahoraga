const STATES = new Set(["accepted", "running", "verifying", "succeeded", "partial", "waiting", "blocked", "unsupported", "failed"]);
const CAPABILITIES = new Set(["artifact.inspect", "m365.reason", "provider.gap", "browser.targets", "browser.navigate", "browser.status", "browser.smoke", "update.scan", "system.capabilities.describe", "manifest.describe", "repository.inspect", "repair.scan", "system.health"]);
const INTENTS = new Set(["attachment", "microsoft-work", "browser-targets", "browser-navigation", "browser-health", "update-scan", "capability-describe", "configuration-describe", "repository-inspect", "repair", "system-health", "unsupported"]);
const ACTIONS = new Set(["return-summary", "wait", "explain-limitation", "continue", "verify", "retry", "none"]);
const KEYS = new Set(["schemaVersion", "intentKind", "capability", "state", "requiredEvidenceIds", "workerId", "routeReason", "providerId", "normalCreditBudget", "hostedComputeSpendCeilingUsd", "limitations", "nextAction"]);
const LIMITATIONS = new Set(["no-registered-capability"]);
const OPERATIONAL_STATES = new Set(["accepted", "running", "verifying", "succeeded", "partial", "waiting", "blocked", "failed"]);
const UNAVAILABLE_STATES = new Set(["waiting", "blocked", "unsupported", "failed"]);
const ACTIONS_BY_STATE = new Map([
  ["accepted", new Set(["wait", "continue"])],
  ["running", new Set(["wait", "continue"])],
  ["verifying", new Set(["verify", "wait"])],
  ["succeeded", new Set(["return-summary"])],
  ["partial", new Set(["return-summary", "continue"])],
  ["waiting", new Set(["wait"])],
  ["blocked", new Set(["explain-limitation", "retry", "wait"])],
  ["unsupported", new Set(["explain-limitation"])],
  ["failed", new Set(["retry", "explain-limitation"])],
]);
const RECEIPT_CONTRACTS = new Map([
  ["attachment", contract(["artifact.inspect"], ["evidence.attachment"])],
  ["microsoft-work", contract(["m365.reason", "provider.gap"], ["evidence.microsoft-work"])],
  ["browser-targets", contract(["browser.targets"], ["evidence.browser-targets"])],
  ["browser-navigation", contract(["browser.navigate"], ["evidence.youtube"])],
  ["browser-health", contract(["browser.status", "browser.smoke"], ["evidence.browser-health"])],
  ["update-scan", contract(["update.scan"], ["evidence.update-scan"])],
  ["capability-describe", contract(["system.capabilities.describe"], ["evidence.capability-description"])],
  ["configuration-describe", contract(["manifest.describe"], ["evidence.configuration-description"])],
  ["repository-inspect", contract(["repository.inspect"], ["request.repository", "evidence.repository-inspection"])],
  ["repair", contract(["repair.scan"], ["evidence.repair"])],
  ["system-health", contract(["system.health"], ["evidence.system-health"])],
  ["unsupported", contract([], ["evidence.external-destination", "evidence.unsupported"])]
]);

export function createTaskReceipt({ intent, route, state, providerDecision, nextAction } = {}) {
  const capability = route && Object.hasOwn(route, "capability") ? route.capability : intent?.capability ?? null;
  const receipt = { schemaVersion: 1, intentKind: intent?.intentKind, capability, state, requiredEvidenceIds: intent?.requiredEvidenceIds, workerId: route?.workerId ?? null, routeReason: route?.reason, providerId: providerDecision?.providerId ?? null, normalCreditBudget: 0, hostedComputeSpendCeilingUsd: 0, limitations: intent?.limitations ?? [], nextAction };
  return validateTaskReceipt(receipt);
}

export function validateTaskReceipt(value) {
  exact(value, KEYS, "task receipt");
  if (value.schemaVersion !== 1 || !INTENTS.has(value.intentKind)) throw new TypeError("Task receipt identity is invalid.");
  const contract = RECEIPT_CONTRACTS.get(value.intentKind);
  if (!contract.capabilities.has(value.capability)) throw new TypeError("Task receipt capability is invalid for intent.");
  if (value.capability !== null && !CAPABILITIES.has(value.capability)) throw new TypeError("Task receipt capability is invalid.");
  if (!STATES.has(value.state) || !contract.states(value.capability).has(value.state)) throw new TypeError("Task receipt state is invalid for route.");
  if (!Array.isArray(value.requiredEvidenceIds) || value.requiredEvidenceIds.length !== 1 || !contract.evidence.has(value.requiredEvidenceIds[0])) throw new TypeError("Evidence ID is invalid for receipt.");
  list(value.requiredEvidenceIds, contract.evidence, "evidence ID");
  const expectedLimitations = isUnavailable(value.capability) ? ["no-registered-capability"] : [];
  if (!sameList(value.limitations, expectedLimitations)) throw new TypeError("Task receipt limitations are invalid for route.");
  list(value.limitations, LIMITATIONS, "limitation");
  nullableCode(value.workerId, "worker ID"); nullableCode(value.providerId, "provider ID"); stringCode(value.routeReason, "route reason");
  if (value.capability === null && value.workerId !== null) throw new TypeError("Unavailable receipt cannot select a worker.");
  if (value.state === "succeeded" && (isUnavailable(value.capability) || value.workerId === null)) throw new TypeError("Succeeded receipt requires an operational worker route.");
  if (value.normalCreditBudget !== 0 || value.hostedComputeSpendCeilingUsd !== 0) throw new TypeError("Task receipt budgets must be zero.");
  if (!ACTIONS.has(value.nextAction) || !ACTIONS_BY_STATE.get(value.state)?.has(value.nextAction)) throw new TypeError("Task receipt next action is invalid for state.");
  return deepFreeze(structuredClone(value));
}

function exact(value, keys, label) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`); for (const key of Object.keys(value)) if (!keys.has(key)) throw new TypeError(`${label} field is not allowed: ${key}`); for (const key of keys) if (!Object.hasOwn(value, key)) throw new TypeError(`${label} field is missing: ${key}`); }
function list(value, allowed, label) { if (!Array.isArray(value) || value.length > 20 || value.some((item) => typeof item !== "string" || !allowed.has(item))) throw new TypeError(`${label} list is invalid.`); }
function stringCode(value, label) { if (typeof value !== "string" || !/^[a-z][a-z0-9.-]{0,63}$/.test(value)) throw new TypeError(`${label} is invalid.`); }
function nullableCode(value, label) { if (value !== null) stringCode(value, label); }
function contract(capabilities, evidence) { return { capabilities: new Set([...capabilities, null]), evidence: new Set(evidence), states: (capability) => isUnavailable(capability) ? UNAVAILABLE_STATES : OPERATIONAL_STATES }; }
function isUnavailable(capability) { return capability === null || capability === "provider.gap"; }
function sameList(actual, expected) { return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
