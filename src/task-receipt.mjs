const STATES = new Set(["accepted", "running", "verifying", "succeeded", "partial", "waiting", "blocked", "unsupported", "failed"]);
const CAPABILITIES = new Set(["artifact.inspect", "m365.reason", "provider.gap", "browser.targets", "browser.navigate", "browser.status", "browser.smoke", "update.scan", "system.capabilities.describe", "manifest.describe", "repository.inspect", "repair.scan", "system.health"]);
const INTENTS = new Set(["attachment", "microsoft-work", "browser-targets", "browser-navigation", "browser-health", "update-scan", "capability-describe", "configuration-describe", "repository-inspect", "repair", "system-health", "unsupported"]);
const ACTIONS = new Set(["return-summary", "wait", "explain-limitation", "continue", "verify", "retry", "none"]);
const KEYS = new Set(["schemaVersion", "intentKind", "capability", "state", "requiredEvidenceIds", "workerId", "routeReason", "providerId", "normalCreditBudget", "hostedComputeSpendCeilingUsd", "limitations", "nextAction"]);
const PAIRS = new Map([["attachment", "artifact.inspect"], ["microsoft-work", ["m365.reason", "provider.gap"]], ["browser-targets", "browser.targets"], ["browser-navigation", "browser.navigate"], ["browser-health", ["browser.status", "browser.smoke"]], ["update-scan", "update.scan"], ["capability-describe", "system.capabilities.describe"], ["configuration-describe", "manifest.describe"], ["repository-inspect", "repository.inspect"], ["repair", "repair.scan"], ["system-health", "system.health"]]);
const EVIDENCE = new Set(["request.repository", "evidence.attachment", "evidence.microsoft-work", "evidence.youtube", "evidence.external-destination", "evidence.browser-targets", "evidence.browser-health", "evidence.update-scan", "evidence.capability-description", "evidence.configuration-description", "evidence.repository-inspection", "evidence.repair", "evidence.system-health", "evidence.unsupported"]);
const LIMITATIONS = new Set(["no-registered-capability"]);

export function createTaskReceipt({ intent, route, state, providerDecision, nextAction } = {}) {
  const receipt = { schemaVersion: 1, intentKind: intent?.intentKind, capability: route?.capability ?? intent?.capability ?? null, state, requiredEvidenceIds: intent?.requiredEvidenceIds, workerId: route?.workerId ?? null, routeReason: route?.reason, providerId: providerDecision?.providerId ?? null, normalCreditBudget: 0, hostedComputeSpendCeilingUsd: 0, limitations: intent?.limitations ?? [], nextAction };
  return validateTaskReceipt(receipt);
}

export function validateTaskReceipt(value) {
  exact(value, KEYS, "task receipt");
  if (value.schemaVersion !== 1 || !INTENTS.has(value.intentKind)) throw new TypeError("Task receipt identity is invalid.");
  if (value.capability !== null && (!CAPABILITIES.has(value.capability) || !pairAllows(value.intentKind, value.capability))) throw new TypeError("Task receipt capability is invalid.");
  if (!STATES.has(value.state) || (value.intentKind === "unsupported" && !new Set(["unsupported", "waiting", "blocked", "failed"]).has(value.state))) throw new TypeError("Task receipt state is invalid.");
  list(value.requiredEvidenceIds, EVIDENCE, "evidence ID"); list(value.limitations, LIMITATIONS, "limitation");
  nullableCode(value.workerId, "worker ID"); nullableCode(value.providerId, "provider ID"); stringCode(value.routeReason, "route reason");
  if (value.normalCreditBudget !== 0 || value.hostedComputeSpendCeilingUsd !== 0) throw new TypeError("Task receipt budgets must be zero.");
  if (!ACTIONS.has(value.nextAction)) throw new TypeError("Task receipt next action is invalid.");
  return deepFreeze(structuredClone(value));
}

function pairAllows(intentKind, capability) { const expected = PAIRS.get(intentKind); return Array.isArray(expected) ? expected.includes(capability) : expected === capability; }
function exact(value, keys, label) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`); for (const key of Object.keys(value)) if (!keys.has(key)) throw new TypeError(`${label} field is not allowed: ${key}`); for (const key of keys) if (!Object.hasOwn(value, key)) throw new TypeError(`${label} field is missing: ${key}`); }
function list(value, allowed, label) { if (!Array.isArray(value) || value.length > 20 || value.some((item) => typeof item !== "string" || !allowed.has(item))) throw new TypeError(`${label} list is invalid.`); }
function stringCode(value, label) { if (typeof value !== "string" || !/^[a-z][a-z0-9.-]{0,63}$/.test(value)) throw new TypeError(`${label} is invalid.`); }
function nullableCode(value, label) { if (value !== null) stringCode(value, label); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
