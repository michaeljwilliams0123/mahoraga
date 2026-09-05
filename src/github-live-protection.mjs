export const MAIN_PROTECTION_CONTRACT_PATH = "config/main-protection.contract.json";
export const LIVE_PROTECTION_PROBE = "node scripts/github-live-protection.mjs";

const REQUIRED_CONTEXTS = Object.freeze([
  "Verify (ubuntu-latest)",
  "Verify (windows-latest)",
]);

export function parseMainProtectionContract(source) {
  const value = typeof source === "string" ? JSON.parse(source) : source;
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("main-protection-contract-invalid");
  if (value.schemaVersion !== 1) fail("main-protection-contract-invalid");
  if (value.targetRef !== "refs/heads/main") fail("main-protection-target-invalid");
  if (!Array.isArray(value.requiredContexts) || value.requiredContexts.length !== REQUIRED_CONTEXTS.length) {
    fail("main-protection-contexts-invalid");
  }
  for (const context of REQUIRED_CONTEXTS) {
    if (!value.requiredContexts.includes(context)) fail("main-protection-contexts-invalid");
  }
  if (value.strictExactHead !== true) fail("main-protection-strict-required");
  if (value.deletionAllowed !== false) fail("main-protection-deletion-forbidden");
  if (value.forcePushAllowed !== false) fail("main-protection-force-push-forbidden");
  if (value.requirePullRequest !== true) fail("main-protection-pull-request-required");
  return Object.freeze({
    schemaVersion: 1,
    targetRef: "refs/heads/main",
    requiredContexts: Object.freeze([...REQUIRED_CONTEXTS]),
    strictExactHead: true,
    deletionAllowed: false,
    forcePushAllowed: false,
    requirePullRequest: true,
  });
}

export function evaluateLiveMainProtection({ rulesets = [], contract } = {}) {
  let expected;
  try { expected = parseMainProtectionContract(contract); }
  catch (error) {
    return blocked(error?.code ?? "main-protection-contract-invalid");
  }
  if (!Array.isArray(rulesets)) return blocked("live-rulesets-invalid");

  const covering = rulesets.filter((ruleset) => isActiveMainRuleset(ruleset));
  if (covering.length === 0) return blocked("main-unprotected");

  const merged = mergeRules(covering);
  if (merged.deletionAllowed !== false) return blocked("main-deletion-not-blocked");
  if (merged.forcePushAllowed !== false) return blocked("main-force-push-not-blocked");
  if (merged.requirePullRequest !== true) return blocked("main-pull-request-not-required");
  if (merged.strictExactHead !== true) return blocked("main-exact-head-not-required");
  const missing = expected.requiredContexts.filter((context) => !merged.requiredContexts.includes(context));
  if (missing.length > 0) {
    return blocked("main-required-checks-missing", { missing: Object.freeze(missing) });
  }
  return Object.freeze({
    ok: true,
    status: "protected",
    reason: "live-main-protection-attested",
    rulesetIds: Object.freeze(covering.map((ruleset) => ruleset.id).filter((id) => Number.isInteger(id))),
    requiredContexts: expected.requiredContexts,
    creditCost: 0,
    paidFallback: false,
  });
}

function isActiveMainRuleset(ruleset) {
  if (!ruleset || typeof ruleset !== "object" || Array.isArray(ruleset)) return false;
  if (ruleset.enforcement !== "active") return false;
  if (ruleset.target != null && ruleset.target !== "branch") return false;
  const include = ruleset.conditions?.ref_name?.include;
  if (!Array.isArray(include)) return false;
  return include.includes("refs/heads/main") || include.includes("~DEFAULT_BRANCH");
}

function mergeRules(rulesets) {
  const requiredContexts = new Set();
  let deletionAllowed = true;
  let forcePushAllowed = true;
  let requirePullRequest = false;
  let strictExactHead = false;
  for (const ruleset of rulesets) {
    const rules = Array.isArray(ruleset.rules) ? ruleset.rules : [];
    for (const rule of rules) {
      if (rule?.type === "deletion") deletionAllowed = false;
      if (rule?.type === "non_fast_forward") forcePushAllowed = false;
      if (rule?.type === "pull_request") requirePullRequest = true;
      if (rule?.type === "required_status_checks") {
        if (rule.parameters?.strict_required_status_checks_policy === true) strictExactHead = true;
        const checks = Array.isArray(rule.parameters?.required_status_checks) ? rule.parameters.required_status_checks : [];
        for (const check of checks) {
          if (typeof check?.context === "string" && check.context.length > 0) requiredContexts.add(check.context);
        }
      }
    }
  }
  return {
    deletionAllowed,
    forcePushAllowed,
    requirePullRequest,
    strictExactHead,
    requiredContexts: [...requiredContexts],
  };
}

function blocked(reason, extra = {}) {
  return Object.freeze({
    ok: false,
    status: "unprotected",
    reason,
    rulesetIds: Object.freeze([]),
    requiredContexts: Object.freeze([]),
    creditCost: 0,
    paidFallback: false,
    ...extra,
  });
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
