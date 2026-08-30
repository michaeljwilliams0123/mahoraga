export const ZERO_CREDIT_PROVIDER_ORDER = Object.freeze(["codespaces-open-weight", "local-open-weight", "deterministic-only", "waiting-zero-credit-provider"]);
const COST_CLASS_BY_PROVIDER = Object.freeze({ "codespaces-open-weight": "cloud-open-weight", "local-open-weight": "local-model", "deterministic-only": "deterministic" });

export function selectZeroCreditProvider({ providers = [], cloudModeEnabled = false, requiresGeneration = false } = {}) {
  if (!Array.isArray(providers)) throw new TypeError("Zero-credit providers must be an array.");
  const byId = new Map(providers.filter((provider) => provider && typeof provider === "object" && typeof provider.id === "string").map((provider) => [provider.id, provider]));
  if (cloudModeEnabled && eligibleCloud(byId.get("codespaces-open-weight"))) return decision("codespaces-open-weight");
  if (eligibleLocal(byId.get("local-open-weight"))) return decision("local-open-weight");
  if (!requiresGeneration) return decision("deterministic-only");
  return Object.freeze({ status: "waiting", providerId: "waiting-zero-credit-provider", costClass: null });
}

function eligibleCommon(provider) {
  return provider && provider.metered === false && provider.priceUsd === 0 && provider.spendUsd === 0 && provider.zeroDollarStopGuaranteed === true && provider.ready === true && provider.capabilityCanary?.fresh === true && ["verified-zero", "not-applicable"].includes(provider.billingState);
}
function eligibleCloud(provider) { return eligibleCommon(provider) && provider.billingState === "verified-zero"; }
function eligibleLocal(provider) { return eligibleCommon(provider); }
function decision(providerId) { return Object.freeze({ status: "selected", providerId, costClass: COST_CLASS_BY_PROVIDER[providerId] }); }
