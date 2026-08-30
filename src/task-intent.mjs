const INTENT_KINDS = new Set(["attachment", "microsoft-work", "browser-targets", "browser-navigation", "browser-health", "update-scan", "capability-describe", "configuration-describe", "repository-inspect", "repair", "system-health", "unsupported"]);
const CAPABILITIES = new Set(["artifact.inspect", "m365.reason", "provider.gap", "browser.targets", "browser.navigate", "browser.status", "browser.smoke", "update.scan", "system.capabilities.describe", "manifest.describe", "repository.inspect", "repair.scan", "system.health"]);
const KEYS = new Set(["schemaVersion", "intentKind", "capability", "confidence", "requiredEvidenceIds", "targetId", "limitations", "reasonCode"]);
const LIMITATIONS = new Set(["no-registered-capability"]);
const INTENT_CONTRACTS = new Map([
  ["attachment", contract(["artifact.inspect"], ["evidence.attachment"])],
  ["microsoft-work", contract(["m365.reason", "provider.gap"], ["evidence.microsoft-work"])],
  ["browser-targets", contract(["browser.targets"], ["evidence.browser-targets"])],
  ["browser-navigation", contract(["browser.navigate"], ["evidence.youtube"], "public.youtube")],
  ["browser-health", contract(["browser.status", "browser.smoke"], ["evidence.browser-health"])],
  ["update-scan", contract(["update.scan"], ["evidence.update-scan"])],
  ["capability-describe", contract(["system.capabilities.describe"], ["evidence.capability-description"])],
  ["configuration-describe", contract(["manifest.describe"], ["evidence.configuration-description"])],
  ["repository-inspect", contract(["repository.inspect"], ["request.repository", "evidence.repository-inspection"])],
  ["repair", contract(["repair.scan"], ["evidence.repair"])],
  ["system-health", contract(["system.health"], ["evidence.system-health"])],
  ["unsupported", contract([], ["evidence.external-destination", "evidence.unsupported"])]
]);

export function classifyTaskIntent({ content = "", attachmentCount = 0, availableCapabilities = [] } = {}) {
  const text = typeof content === "string" ? content.trim().toLowerCase() : "";
  const available = new Set(Array.isArray(availableCapabilities) ? availableCapabilities : []);
  let result;
  if (Number.isSafeInteger(attachmentCount) && attachmentCount > 0) result = route("attachment", choose(available, "artifact.inspect"), "attachment-present", "evidence.attachment");
  else if (isMicrosoftWork(text)) result = route("microsoft-work", choose(available, "m365.reason", "provider.gap"), "microsoft-work-url", "evidence.microsoft-work");
  else if (matches(text, /\bbrowser\s+targets?\b/)) result = route("browser-targets", choose(available, "browser.targets"), "browser-target-list", "evidence.browser-targets");
  else if (isYouTube(text)) result = route("browser-navigation", choose(available, "browser.navigate"), "registered-target", "evidence.youtube", "public.youtube");
  else if (isExternalNavigation(text)) result = route("unsupported", null, "unregistered-destination", "evidence.external-destination");
  else if (matches(text, /browser.*\b(smoke|test|verify)\b|\b(smoke|test|verify)\b.*browser/)) result = route("browser-health", choose(available, "browser.smoke", "browser.status"), "browser-smoke-check", "evidence.browser-health");
  else if (matches(text, /browser.*\b(health|status)\b|\b(health|status)\b.*browser/)) result = route("browser-health", choose(available, "browser.status", "browser.smoke"), "browser-health-check", "evidence.browser-health");
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
  const contract = INTENT_CONTRACTS.get(value.intentKind);
  if (!contract.capabilities.has(value.capability)) throw new TypeError("Intent capability is invalid.");
  if (value.capability !== null && !CAPABILITIES.has(value.capability)) throw new TypeError("Intent capability is invalid.");
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) throw new TypeError("Intent confidence is invalid.");
  if (!Array.isArray(value.requiredEvidenceIds) || value.requiredEvidenceIds.length !== 1 || !contract.evidence.has(value.requiredEvidenceIds[0])) throw new TypeError("Evidence ID is invalid for intent.");
  list(value.requiredEvidenceIds, contract.evidence, "evidence ID");
  if (value.targetId !== contract.targetId) throw new TypeError("Intent target is invalid for intent.");
  const expectedLimitations = isUnavailable(value.capability) ? ["no-registered-capability"] : [];
  if (!sameList(value.limitations, expectedLimitations)) throw new TypeError("Intent limitations are invalid for route.");
  list(value.limitations, LIMITATIONS, "limitation");
  stringCode(value.reasonCode, "reason code");
  return deepFreeze(structuredClone(value));
}

function route(intentKind, capability, reasonCode, evidence, targetId = null) {
  return { schemaVersion: 1, intentKind, capability, confidence: 1, requiredEvidenceIds: [evidence], targetId, limitations: isUnavailable(capability) ? ["no-registered-capability"] : [], reasonCode };
}
function choose(available, ...ids) { return ids.find((id) => available.has(id)) ?? null; }
function isMicrosoftWork(text) { return extractUrls(text).some((raw) => { try { const url = new URL(raw); const host = url.hostname.toLowerCase(); return url.protocol === "https:" && (host === "teams.microsoft.com" || host === "onedrive.live.com" || host.endsWith(".sharepoint.com") || host.endsWith(".sharepoint.us") || isDynamicsTenant(host)); } catch { return false; } }); }
function extractUrls(text) { return text.match(/https?:\/\/[^\s<>]+/g) ?? []; }
function isDynamicsTenant(host) { return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.crm(?:[0-9]+)?\.dynamics\.com$/.test(host); }
function isYouTube(text) {
  if (!/\b(open|go|navigate|visit|browse|watch)\b/.test(text)) return false;
  const urls = extractUrls(text);
  if (urls.length > 0) return urls.some(isApprovedYouTubeUrl);
  return /\b(youtube(?:\.com)?|youtu\.be)\b/.test(text);
}
function isApprovedYouTubeUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]).has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
function isExternalNavigation(text) { return /https?:\/\/\S+/.test(text) && /\b(open|go|navigate|visit|browse)\b/.test(text); }
function matches(text, expression) { return expression.test(text); }
function exact(value, keys, label) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`); for (const key of Object.keys(value)) if (!keys.has(key)) throw new TypeError(`${label} field is not allowed: ${key}`); for (const key of keys) if (!Object.hasOwn(value, key)) throw new TypeError(`${label} field is missing: ${key}`); }
function list(value, allowed, label) { if (!Array.isArray(value) || value.length > 20 || value.some((item) => typeof item !== "string" || !allowed.has(item))) throw new TypeError(`${label} list is invalid.`); }
function stringCode(value, label) { if (typeof value !== "string" || !/^[a-z][a-z0-9.-]{0,63}$/.test(value)) throw new TypeError(`${label} is invalid.`); }
function contract(capabilities, evidence, targetId = null) { return { capabilities: new Set([...capabilities, null]), evidence: new Set(evidence), targetId }; }
function isUnavailable(capability) { return capability === null || capability === "provider.gap"; }
function sameList(actual, expected) { return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
