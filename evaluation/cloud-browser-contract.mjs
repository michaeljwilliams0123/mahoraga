const HIGH_IMPACT = new Set(["purchase", "submit", "delete", "permission-change", "credential-entry"]);
const KNOWN_DATA_CLASSES = new Set(["synthetic", "personal", "enterprise", "local-only"]);
const CLOUD_DATA_CLASSES = new Set(["synthetic", "personal"]);

export function validateCloudBrowserConnection(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new TypeError("cloud-browser-config-required");
  const allowed = new Set(["provider", "executionPlane", "dataClass", "isolated", "extensionsEnabled", "localFileAccess", "domains", "humanApproval"]);
  for (const key of Object.keys(config)) if (!allowed.has(key)) throw new TypeError("cloud-browser-config-field-invalid");
  if (config.provider !== "openai-computer-use") throw new Error("cloud-browser-provider-invalid");
  if (!KNOWN_DATA_CLASSES.has(config.dataClass)) throw new Error("cloud-browser-data-class-invalid");
  if (!CLOUD_DATA_CLASSES.has(config.dataClass)) throw new Error("cloud-browser-data-class-boundary");
  if (config.executionPlane !== "cloud" || config.isolated !== true) throw new Error("cloud-browser-isolation-required");
  if (config.extensionsEnabled !== false || config.localFileAccess !== false) throw new Error("cloud-browser-local-boundary-required");
  if (!Array.isArray(config.domains) || config.domains.length < 1 || config.domains.length > 50) throw new Error("cloud-browser-domains-required");
  for (const domain of config.domains) if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain)) throw new Error("cloud-browser-domain-invalid");
  if (!Array.isArray(config.humanApproval) || [...HIGH_IMPACT].some((action) => !config.humanApproval.includes(action))) throw new Error("cloud-browser-approval-policy-required");
  return Object.freeze({
    ready: true,
    provider: config.provider,
    executionPlane: "cloud",
    dataClass: config.dataClass,
    domainCount: new Set(config.domains).size,
    localExtensionRequired: false,
    localDeviceMutationAllowed: false,
    pageContentTrusted: false,
  });
}
