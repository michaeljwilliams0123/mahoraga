const KEYS = new Set([
  "baseline", "conversationActivation", "structuredDebate", "automaticIntegration",
  "maximumImplementationLanes", "eligibleBranchPrefixes", "protectedPaths",
  "requiredVerification", "automaticRelease", "canaryRequired", "rollbackRequired",
]);

const REQUIRED_PROTECTED_PATHS = Object.freeze([
  ".github/workflows",
  "AGENTS.md",
  "scripts/autonomous-integration.mjs",
  "src/autonomy-policy.mjs",
  "src/autonomous-integration.mjs",
  "src/config.mjs",
  "src/github-audit.mjs",
  "src/update-contract.mjs",
]);

export function validateAutonomyPolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Autonomy policy is missing.");
  const fields = Object.keys(value);
  if (fields.length !== KEYS.size || fields.some((field) => !KEYS.has(field))) fail("Autonomy policy field is invalid.");
  if (value.baseline !== "ultron") fail("Autonomy baseline must be ultron.");
  for (const field of ["conversationActivation", "structuredDebate", "automaticIntegration", "automaticRelease", "canaryRequired", "rollbackRequired"]) {
    if (value[field] !== true) fail(`Autonomy ${field} must remain enabled.`);
  }
  if (!Number.isInteger(value.maximumImplementationLanes) || value.maximumImplementationLanes < 1 || value.maximumImplementationLanes > 2) fail("Autonomy implementation lane limit is invalid.");
  const eligibleBranchPrefixes = stringList(value.eligibleBranchPrefixes, "Autonomy branch prefix", 8);
  if (eligibleBranchPrefixes.some((prefix) => !/^[a-z][a-z0-9-]*\/$/.test(prefix))) fail("Autonomy branch prefix is invalid.");
  const protectedPaths = stringList(value.protectedPaths, "Autonomy protected path", 32);
  if (protectedPaths.join("|") !== REQUIRED_PROTECTED_PATHS.join("|")) fail("Autonomy protected path set is invalid.");
  if (value.requiredVerification !== "npm run verify") fail("Autonomy verification command is invalid.");
  return deepFreeze({ ...structuredClone(value), eligibleBranchPrefixes, protectedPaths });
}

export function autonomyPolicySnapshot(manifest) { return validateAutonomyPolicy(manifest?.autonomy); }

function stringList(value, label, maximum) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum || new Set(value).size !== value.length) fail(`${label} list is invalid.`);
  return value.map((item) => {
    if (typeof item !== "string" || item.length < 1 || item.length > 160 || item.startsWith("/") || item.includes("\\") || item.split("/").includes("..")) fail(`${label} is invalid.`);
    return item;
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function fail(message) { throw new TypeError(message); }
