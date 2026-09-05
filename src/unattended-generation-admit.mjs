export const UNATTENDED_GENERATION_ADMIT_KIND = "unattended-generation-admit";
export const UNATTENDED_GENERATION_ADMIT_SCHEMA_VERSION = 1;

const FORBIDDEN_CONTENT_KEYS = new Set(["prompt", "response", "content", "messages", "chat"]);

export function envGenerationExplicit(value) {
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return null;
}

export function decideUnattendedGeneration({
  explicit = null,
  probe = null,
  cloudTagged = false,
  spendGrantUsd = 0,
  platformApiKeyPresent = false,
  allowPaidFallback = false,
} = {}) {
  if (allowPaidFallback === true) return admit(false, "refuse-paid-route", "paid-fallback-forbidden");
  if (Number(spendGrantUsd) !== 0) return admit(false, "refuse-paid-route", "spend-grant-not-zero");
  if (platformApiKeyPresent === true) return admit(false, "refuse-paid-route", "platform-api-key-present");
  if (cloudTagged === true || probe?.cloudTagged === true) {
    return admit(false, "refuse-paid-route", "ollama-cloud-not-credit-free");
  }
  if (explicit === false) return admit(false, "hold-planned", "inspect-only-explicit");
  if (explicit === true) return admit(true, "dispatch-credit-free", "generation-explicit");
  if (probe?.verified === true) return admit(true, "dispatch-credit-free", "loopback-reasoner-live");
  return admit(false, "wait-for-local-reasoner", "wait-for-local-reasoner");
}

function admit(requiresGeneration, nextAction, reason) {
  const value = Object.freeze({
    schemaVersion: UNATTENDED_GENERATION_ADMIT_SCHEMA_VERSION,
    kind: UNATTENDED_GENERATION_ADMIT_KIND,
    requiresGeneration: requiresGeneration === true,
    armed: requiresGeneration === true,
    nextAction,
    reason: String(reason).slice(0, 80),
    creditCost: 0,
    paidFallback: false,
  });
  assertContentFree(value);
  return value;
}

function assertContentFree(value) {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertContentFree(item);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_CONTENT_KEYS.has(key)) fail("generation-admit-content-forbidden");
    assertContentFree(item);
  }
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
