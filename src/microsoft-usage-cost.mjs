const BILLING_CLASSES = Object.freeze(new Set(["deterministic-zero", "license-included", "metered", "metered-copilot-credit", "unknown"]));
const DETERMINISTIC = Object.freeze(new Set(["powerplatform.health", "powerplatform.discover", "studio.health"]));
const STUDIO_BILLING_UNKNOWN = Object.freeze(new Set(["studio.delegate", "studio.configure", "studio.provision", "studio.deploy"]));
const HARNESS_TYPES = Object.freeze(new Set(["standard-harness", "copilot-chat-harness", "github-copilot-harness", "unknown"]));
const HARNESS_METADATA_OPERATIONS = Object.freeze(new Set(["discover", "inspect-metadata", "project-topology"]));
const HARNESS_MODEL_OPERATIONS = Object.freeze(new Set(["execute", "build", "test", "evaluate"]));

export function classifyMicrosoftUsageCost(capability, runtimeAttestation = null) {
  if (DETERMINISTIC.has(capability)) return "deterministic-zero";
  if (STUDIO_BILLING_UNKNOWN.has(capability)) {
    if (runtimeAttestation === "license-included") return "license-included";
    if (runtimeAttestation === "metered") return "metered";
    if (runtimeAttestation === "metered-copilot-credit") return "metered-copilot-credit";
    return "unknown";
  }
  return "unknown";
}

export function classifyCopilotHarnessUsage({ harnessType, operation, runtimeAttestation = null } = {}) {
  if (!HARNESS_TYPES.has(harnessType)) throw new TypeError("copilot-harness-type-invalid");
  if (!HARNESS_METADATA_OPERATIONS.has(operation) && !HARNESS_MODEL_OPERATIONS.has(operation)) throw new TypeError("copilot-harness-operation-invalid");
  if (HARNESS_METADATA_OPERATIONS.has(operation)) return "deterministic-zero";
  if (harnessType === "github-copilot-harness") return "metered-copilot-credit";
  if (harnessType === "unknown") return "unknown";
  if (runtimeAttestation === "license-included") return "license-included";
  if (runtimeAttestation === "metered-copilot-credit") return "metered-copilot-credit";
  if (runtimeAttestation === "metered") return "metered";
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
  if (declaredClass === "deterministic-zero" || declaredClass === "metered" || declaredClass === "metered-copilot-credit") return declaredClass;
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
