const INTENT_KINDS = new Set(["attachment", "microsoft-work", "browser-targets", "browser-navigation", "browser-health", "update-scan", "capability-describe", "configuration-describe", "repository-inspect", "repair", "system-health", "unsupported"]);
const CAPABILITIES = new Set(["artifact.inspect", "m365.reason", "provider.gap", "browser.targets", "browser.navigate", "browser.status", "browser.smoke", "update.scan", "system.capabilities.describe", "manifest.describe", "repository.inspect", "repair.scan", "system.health"]);
const KEYS = new Set(["schemaVersion", "intentKind", "capability", "confidence", "requiredEvidenceIds", "targetId", "limitations", "reasonCode"]);
const PAIRS = new Map([["attachment", "artifact.inspect"], ["microsoft-work", ["m365.reason", "provider.gap"]], ["browser-targets", "browser.targets"], ["browser-navigation", "browser.navigate"], ["browser-health", ["browser.status", "browser.smoke"]], ["update-scan", "update.scan"], ["capability-describe", "system.capabilities.describe"], ["configuration-describe", "manifest.describe"], ["repository-inspect", "repository.inspect"], ["repair", "repair.scan"], ["system-health", "system.health"]]);
const EVIDENCE = new Set(["request.repository", "evidence.attachment", "evidence.microsoft-work", "evidence.youtube", "evidence.external-destination", "evidence.browser-targets", "evidence.browser-health", "evidence.update-scan", "evidence.capability-description", "evidence.configuration-description", "evidence.repository-inspection", "evidence.repair", "evidence.system-health", "evidence.unsupported"]);
const LIMITATIONS = new Set(["no-registered-capability"]);

export function classifyTaskIntent({ content = "", attachmentCount = 0, availableCapabilities = [] } = {}) {
  const text = typeof content === "string" ? content.trim().toLowerCase() : "";
  const available = new Set(Array.isArray(availableCapabilities) ? availableCapabilities : []);
  let result;
  if (Number.isSafeInteger(attachmentCount) && attachmentCount > 0) result = route("attachment", choose(available, "artifact.inspect"), "attachment-present", "evidence.attachment");
  else if (isMicrosoftWork(text)) result = route("microsoft-work", choose(available, "m365.reason", "provider.gap"), "microsoft-work-url", "evidence.microsoft-work");
  else if (matches(text, /\b(list|show|available)\b.*\b(browser targets|targets)\b|\bbrowser targets\b/)) result = route("browser-targets", choose(available, "browser.targets"), "browser-target-list", "evidence.browser-targets");
  else if (isYouTube(text)) result = route("browser-navigation", choose(available, "browser.navigate"), "registered-target", "evidence.youtube", "public.youtube");
  else if (isExternalNavigation(text)) result = route("unsupported", null, "unregistered-destination", "evidence.external-destination");
  else if (matches(text, /browser.*\b(smoke|test|verify)\b|\b(smoke|test|verify)\b.*browser/)) result = route("browser-health", choose(available, "browser.smoke", "browser.status"), "browser-smoke-check", "evidence.browser-health");
  else if (matches(text, /browser.*\b(health|status)\b|\b(health|status)\b.*browser|\bbrowser\b/)) result = route("browser-health", choose(available, "browser.status", "browser.smoke"), "browser-health-check", "evidence.browser-health");
  else if (matches(text, /\b(scan|check|look)\b.*\b(update|updates)\b|\bupdate scan\b/)) result = route("update-scan", choose(available, "update.scan"), "update-scan-request", "evidence.update-scan");
  else if (matches(text, /\b(describe|list|show)\b.*\b(capability|capabilities|skills)\b/)) result = route("capability-describe", choose(available, "system.capabilities.describe"), "capability-description", "evidence.capability-description");
  else if (matches(text, /\b(describe|show|inspect)\b.*\b(configuration|config|manifest)\b/)) result = route("configuration-describe", choose(available, "manifest.describe"), "configuration-description", "evidence.configuration-description");
  else if (matches(text, /\b(inspect|review|examine)\b.*\b(repository|repo|codebase)\b/)) result = route("repository-inspect", choose(available, "repository.inspect"), "repository-inspection", "evidence.repository-inspection");
  else if (matches(text, /\brepair\b|\bfix\b.*\b(worker|system|failure)\b/)) result = route("repair", choose(available, "repair.scan"), "repair-request", "evidence.repair");
  else if (matches(text, /\b(system|service)\b.*\bhealth\b|\bhealth\b.*\b(system|service)\b/)) result = route("system-health", choose(available, "system.health"), "system-health-check", "evidence.system-health");
  else result = route("unsupported", null, "answer-provider-unavailable", "evidence.unsupported");
  return validateIntentDecision(result);
}
export function validateIntentDecision(value) {
  exact(value, KEYS, "intent decision");
  if (value.schemaVersion !== 1 || !INTENT_KINDS.has(value.intentKind)) throw new TypeError("Intent identity is invalid.");
  if (value.capability !== null && (!CAPABILITIES.has(value.capability) || !pairAllows(value.intentKind, value.capability))) throw new TypeError("Intent capability is invalid.");
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) throw new TypeError("Intent confidence is invalid.");
  list(value.requiredEvidenceIds, EVIDENCE, "evidence ID"); list(value.limitations, LIMITATIONS, "limitation");
  if (value.targetId !== null && value.targetId !== "public.youtube") throw new TypeError("Intent target is not registered.");
  if (value.intentKind === "browser-navigation" && value.targetId !== "public.youtube") throw new TypeError("Browser target is required.");
  if (value.intentKind === "unsupported" && value.capability !== null) throw new TypeError("Unsupported intent cannot route.");
  stringCode(value.reasonCode, "reason code");
  return deepFreeze(structuredClone(value));
}

function route(intentKind, capability, reasonCode, evidence, targetId = null) {
  return { schemaVersion: 1, intentKind, capability, confidence: 1, requiredEvidenceIds: [evidence], targetId, limitations: capability ? [] : ["no-registered-capability"], reasonCode };
}
function choose(available, ...ids) { return ids.find((id) => available.has(id)) ?? null; }
function isMicrosoftWork(text) { return /https?:\/\/[^\s/]+(?:\.sharepoint\.com|\.onedrive\.com|onedrive\.live\.com|\.crm\.dynamics\.com|teams\.microsoft\.com)\b/.test(text); }
function isYouTube(text) { return /\b(youtube(?:\.com)?|youtu\.be)\b/.test(text) && /\b(open|go|navigate|visit|browse|watch)\b/.test(text); }
function isExternalNavigation(text) { return /https?:\/\/\S+/.test(text) && /\b(open|go|navigate|visit|browse)\b/.test(text); }
function matches(text, expression) { return expression.test(text); }
function pairAllows(intentKind, capability) { const expected = PAIRS.get(intentKind); return Array.isArray(expected) ? expected.includes(capability) : expected === capability; }
function exact(value, keys, label) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`); for (const key of Object.keys(value)) if (!keys.has(key)) throw new TypeError(`${label} field is not allowed: ${key}`); for (const key of keys) if (!Object.hasOwn(value, key)) throw new TypeError(`${label} field is missing: ${key}`); }
function list(value, allowed, label) { if (!Array.isArray(value) || value.length > 20 || value.some((item) => typeof item !== "string" || !allowed.has(item))) throw new TypeError(`${label} list is invalid.`); }
function stringCode(value, label) { if (typeof value !== "string" || !/^[a-z][a-z0-9.-]{0,63}$/.test(value)) throw new TypeError(`${label} is invalid.`); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
