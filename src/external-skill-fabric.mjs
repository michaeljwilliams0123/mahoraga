import { economicTierForBillingClass, isZeroMarginalCreditEligible } from "./resource-economy.mjs";

const PROVIDERS = deepFreeze([
  provider("wolfram", "Wolfram", ["synthetic", "personal"], [
    capability("compute.health", "read-only"),
    capability("compute.query", "read-only"),
    capability("compute.context", "read-only"),
    capability("compute.evaluate", "privileged-code-execution"),
  ]),
  provider("roleplay", "AI Roleplay Chat Simulator", ["synthetic", "personal"], [
    capability("training.health", "read-only"),
    capability("training.start", "bounded-session"),
    capability("training.turn", "bounded-session"),
    capability("training.debrief", "read-only"),
    capability("training.evaluate", "read-only"),
  ]),
  provider("edx", "edX", ["synthetic", "personal"], [
    capability("learning.health", "read-only"),
    capability("learning.search", "read-only"),
    capability("learning.details", "read-only"),
    capability("learning.compare", "read-only"),
  ]),
  provider("transkriptor", "Transkriptor", ["personal", "enterprise"], [
    capability("speech.health", "read-only"),
    capability("speech.transcript.list", "read-only"),
    capability("speech.transcript.read", "read-only"),
    capability("speech.summary", "read-only"),
    capability("speech.transcript.export", "bounded-export"),
    capability("speech.quota", "read-only"),
  ]),
]);

export function externalSkillProviders() {
  return PROVIDERS;
}

export function projectExternalSkillRoutes({ readiness = {} } = {}) {
  if (!readiness || typeof readiness !== "object" || Array.isArray(readiness)) throw new TypeError("external-skill-readiness-invalid");
  const routes = [];
  for (const provider of PROVIDERS) {
    const state = normalizeReadiness(readiness[provider.id], provider);
    for (const item of provider.capabilities) routes.push(projectRoute(provider, item, state));
  }
  return deepFreeze(routes);
}
function provider(id, label, dataClasses, capabilities) {
  return {
    id, label, costClass: "licensed-cloud", defaultBillingClass: "unknown", bridgeRequired: true,
    dataClasses: [...dataClasses], capabilities: [...capabilities],
  };
}

function capability(id, permissionClass) {
  return { id, permissionClass };
}

function normalizeReadiness(value, provider) {
  if (value === undefined) return Object.freeze({ bridgeReady: false, capabilities: new Set(), billingClass: provider.defaultBillingClass, quotaAttestation: null, privilegedApproved: false });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("external-skill-provider-readiness-invalid");
  const capabilities = Array.isArray(value.capabilities) ? value.capabilities : [];
  if (capabilities.some((item) => typeof item !== "string" || !provider.capabilities.some((capability) => capability.id === item))) throw new TypeError("external-skill-capability-readiness-invalid");
  return Object.freeze({
    bridgeReady: value.bridgeReady === true,
    capabilities: new Set(capabilities),
    billingClass: typeof value.billingClass === "string" ? value.billingClass : provider.defaultBillingClass,
    quotaAttestation: value.quotaAttestation ?? null,
    privilegedApproved: value.privilegedApproved === true,
  });
}
function projectRoute(provider, capability, state) {
  const capabilityReady = state.bridgeReady && state.capabilities.has(capability.id);
  const privilegedHeld = capability.permissionClass === "privileged-code-execution" && !state.privilegedApproved;
  const zeroMarginal = isZeroMarginalCreditEligible(state.billingClass, state.quotaAttestation);
  const routable = capabilityReady && !privilegedHeld && zeroMarginal;
  const routingReason = !state.bridgeReady ? "connector-not-bound"
    : !state.capabilities.has(capability.id) ? "capability-not-admitted"
      : privilegedHeld ? "authority-required"
        : !zeroMarginal ? "cost-not-admitted" : null;
  return Object.freeze({
    capability: capability.id,
    workerId: `external-${provider.id}`,
    provider: provider.id,
    enabled: true,
    routable,
    routingReason,
    dataClasses: [...provider.dataClasses],
    costClass: provider.costClass,
    billingClass: state.billingClass,
    economicTier: economicTierForBillingClass(state.billingClass),
    permissionClass: capability.permissionClass,
  });
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
