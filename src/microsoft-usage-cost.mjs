const BILLING_CLASSES = Object.freeze(new Set(["deterministic-zero", "license-included", "metered", "unknown"]));
const DETERMINISTIC = Object.freeze(new Set(["powerplatform.health", "powerplatform.discover", "studio.health"]));
const STUDIO_BILLING_UNKNOWN = Object.freeze(new Set(["studio.delegate", "studio.configure", "studio.provision", "studio.deploy"]));

export function classifyMicrosoftUsageCost(capability, runtimeAttestation = null) {
  if (DETERMINISTIC.has(capability)) return "deterministic-zero";
  if (STUDIO_BILLING_UNKNOWN.has(capability)) {
    if (runtimeAttestation === "license-included") return "license-included";
    if (runtimeAttestation === "metered") return "metered";
    return "unknown";
  }
  return "unknown";
}

export function isZeroMarginalCreditEligible(billingClass) {
  if (!BILLING_CLASSES.has(billingClass)) return false;
  return billingClass === "deterministic-zero" || billingClass === "license-included";
}

export function validateMicrosoftBillingClass(value) {
  if (!BILLING_CLASSES.has(value)) throw new TypeError("microsoft-billing-class-invalid");
  return value;
}

export function resolveMicrosoftBillingClass(capability, declaredClass, runtimeAttestation = null) {
  validateMicrosoftBillingClass(declaredClass);
  if (declaredClass === "deterministic-zero" || declaredClass === "metered") return declaredClass;
  if (declaredClass === "license-included") return runtimeAttestation === "license-included" ? "license-included" : "unknown";
  return classifyMicrosoftUsageCost(capability, runtimeAttestation);
}

export function microsoftBillingAttestationFromEnv(env = process.env) {
  const value = typeof env.MAHORAGA_COPILOT_STUDIO_DELEGATE_BILLING_CLASS === "string"
    ? env.MAHORAGA_COPILOT_STUDIO_DELEGATE_BILLING_CLASS.trim()
    : "";
  if (!new Set(["license-included", "metered"]).has(value)) return Object.freeze({});
  return Object.freeze({
    "copilot-studio": Object.freeze({ "studio.delegate": value }),
  });
}
