import { validateCopilotHarnessDescriptor } from "./copilot-harness-descriptor.mjs";

const POLICY_KEYS = new Set([
  "alias", "requiredCapabilityClasses", "requiredKnowledgeCategories", "requiredToolKinds",
  "requiredSkillNames", "requiredConnectedAgentAliases", "requireProductionModel", "requireMemory",
  "minimumEvaluationScore", "minimumMonitoringSuccessRate", "maximumEvidenceAgeMs",
]);
const SLUG = /^[a-z0-9][a-z0-9.-]{0,95}$/;
const SURFACE_BY_REASON = Object.freeze({
  "capability-missing": "instructions",
  "connected-agent-missing": "connected-agents",
  "evaluation-failing": "evaluate",
  "evaluation-stale": "evaluate",
  "knowledge-missing": "knowledge",
  "memory-required": "memory",
  "model-not-production": "model",
  "monitoring-below-threshold": "monitor",
  "monitoring-stale": "monitor",
  "skill-missing": "skills",
  "tool-missing": "tools",
});
const BLOCKING_REASONS = new Set([
  "capability-missing", "connected-agent-missing", "evaluation-failing", "evaluation-stale",
  "model-not-production", "monitoring-below-threshold", "monitoring-stale",
]);

export function compileCopilotStudioImprovementCandidates(descriptors, policies, { now = new Date().toISOString() } = {}) {
  if (!Array.isArray(descriptors) || descriptors.length > 32 || !Array.isArray(policies) || policies.length > 32) fail("copilot-studio-improvement-input-invalid");
  const generatedAt = timestamp(now, "copilot-studio-improvement-time-invalid");
  const byAlias = new Map(descriptors.map((item) => {
    const descriptor = validateCopilotHarnessDescriptor(item);
    if (byDuplicate(descriptors, descriptor.alias)) fail("copilot-studio-improvement-descriptor-duplicate");
    return [descriptor.alias, descriptor];
  }));
  const normalizedPolicies = policies.map(normalizePolicy).sort((a, b) => a.alias.localeCompare(b.alias));
  if (new Set(normalizedPolicies.map((item) => item.alias)).size !== normalizedPolicies.length) fail("copilot-studio-improvement-policy-duplicate");
  const candidates = [];
  for (const policy of normalizedPolicies) {
    const descriptor = byAlias.get(policy.alias);
    if (!descriptor) fail("copilot-studio-improvement-policy-unmatched");
    const reasonCodes = evaluate(descriptor, policy, generatedAt);
    if (reasonCodes.length === 0) continue;
    const surfaces = [...new Set(reasonCodes.map((reason) => SURFACE_BY_REASON[reason]))].sort();
    candidates.push(deepFreeze({
      alias: descriptor.alias,
      descriptorId: descriptor.descriptorId,
      severity: reasonCodes.some((reason) => BLOCKING_REASONS.has(reason)) ? "blocking" : "advisory",
      reasonCodes: Object.freeze(reasonCodes),
      surfaces: Object.freeze(surfaces),
      verificationSteps: Object.freeze(verificationSteps(surfaces)),
    }));
  }
  return deepFreeze({ schemaVersion: 1, generatedAt, candidates: Object.freeze(candidates) });
}

function evaluate(descriptor, policy, now) {
  const reasons = [];
  if (!containsAll(descriptor.capabilityClasses, policy.requiredCapabilityClasses)) reasons.push("capability-missing");
  if (!containsAll(descriptor.connectedAgentAliases, policy.requiredConnectedAgentAliases)) reasons.push("connected-agent-missing");
  if (descriptor.evaluation.state !== "passing" || descriptor.evaluation.score < policy.minimumEvaluationScore) reasons.push("evaluation-failing");
  if (stale(descriptor.evaluation.observedAt, now, policy.maximumEvidenceAgeMs)) reasons.push("evaluation-stale");
  if (!containsAll(descriptor.knowledgeCategories, policy.requiredKnowledgeCategories)) reasons.push("knowledge-missing");
  if (policy.requireMemory && descriptor.memoryEnabled !== true) reasons.push("memory-required");
  if (policy.requireProductionModel && descriptor.modelStatus !== "production") reasons.push("model-not-production");
  if (descriptor.monitoring.successRate < policy.minimumMonitoringSuccessRate) reasons.push("monitoring-below-threshold");
  if (stale(descriptor.monitoring.observedAt, now, policy.maximumEvidenceAgeMs)) reasons.push("monitoring-stale");
  if (!containsAll(descriptor.skillNames, policy.requiredSkillNames)) reasons.push("skill-missing");
  if (!containsAll(descriptor.toolKinds, policy.requiredToolKinds)) reasons.push("tool-missing");
  return reasons.sort();
}

function normalizePolicy(value) {
  exact(value, POLICY_KEYS, "copilot-studio-improvement-policy-invalid");
  return deepFreeze({
    alias: slug(value.alias),
    requiredCapabilityClasses: tokenList(value.requiredCapabilityClasses),
    requiredKnowledgeCategories: tokenList(value.requiredKnowledgeCategories),
    requiredToolKinds: tokenList(value.requiredToolKinds),
    requiredSkillNames: tokenList(value.requiredSkillNames),
    requiredConnectedAgentAliases: tokenList(value.requiredConnectedAgentAliases),
    requireProductionModel: bool(value.requireProductionModel),
    requireMemory: bool(value.requireMemory),
    minimumEvaluationScore: ratio(value.minimumEvaluationScore),
    minimumMonitoringSuccessRate: ratio(value.minimumMonitoringSuccessRate),
    maximumEvidenceAgeMs: age(value.maximumEvidenceAgeMs),
  });
}

function verificationSteps(surfaces) {
  const steps = ["re-discover-provider-metadata"];
  if (surfaces.includes("evaluate")) steps.push("confirm-existing-evaluation-evidence");
  if (surfaces.includes("monitor")) steps.push("confirm-monitoring-evidence");
  steps.push("verify-zero-credit-admission-before-mutation");
  return steps;
}
function containsAll(actual, required) { const set = new Set(actual); return required.every((item) => set.has(item)); }
function stale(observedAt, now, maximumAgeMs) { const delta = Date.parse(now) - Date.parse(observedAt); return delta < 0 || delta > maximumAgeMs; }
function byDuplicate(items, alias) { return items.filter((item) => item?.alias === alias).length > 1; }
function exact(value, keys, code) { if (!value || typeof value !== "object" || Array.isArray(value)) fail(code); const actual = Object.keys(value).sort(); const expected = [...keys].sort(); if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) fail(code); }
function tokenList(value) { if (!Array.isArray(value) || value.length > 16 || new Set(value).size !== value.length) fail("copilot-studio-improvement-policy-invalid"); return Object.freeze(value.map(slug).sort()); }
function slug(value) { if (typeof value !== "string" || !SLUG.test(value)) fail("copilot-studio-improvement-policy-invalid"); return value; }
function bool(value) { if (typeof value !== "boolean") fail("copilot-studio-improvement-policy-invalid"); return value; }
function ratio(value) { if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) fail("copilot-studio-improvement-policy-invalid"); return value; }
function age(value) { if (!Number.isSafeInteger(value) || value < 60_000 || value > 90 * 24 * 60 * 60 * 1000) fail("copilot-studio-improvement-policy-invalid"); return value; }
function timestamp(value, code) { if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code); return value; }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const item of Object.values(value)) deepFreeze(item); Object.freeze(value); } return value; }
function fail(code) { throw new TypeError(code); }
