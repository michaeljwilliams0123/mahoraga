const GRANT_FIELDS = new Set([
  "schemaVersion", "kind", "grantId", "ownerPrincipal", "grantee", "state",
  "scopes", "deploymentTargets", "confirmationRequiredScopes", "revokedScopes",
]);

export const OWNER_AUTHORITY_SCOPES = Object.freeze([
  "build.execute",
  "self.update",
  "repo.write",
  "pr.manage",
  "workflow.dispatch",
  "artifact.manage",
  "connector.invoke",
  "copilot.invoke",
  "copilot.configure",
  "copilot.provision",
  "deployment.request",
  "deployment.execute",
  "governance.manage",
  "accessibility.manage",
]);

const AUTHORITY_SCOPE_SET = new Set(OWNER_AUTHORITY_SCOPES);
const DEPLOYMENT_TARGETS = new Set(["dev", "test", "prod"]);
const GRANT_STATES = new Set(["active", "revoked"]);
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const OWNER_PRINCIPAL = /^github:[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

export function validateOwnerAuthorityGrant(value) {
  if (!isRecord(value)) fail("Owner authority grant is missing.");
  const fields = Object.keys(value);
  if (fields.length !== GRANT_FIELDS.size || fields.some((field) => !GRANT_FIELDS.has(field))) fail("Owner authority grant field is invalid.");
  if (value.schemaVersion !== 1 || value.kind !== "owner-authority-grant") fail("Owner authority grant identity is invalid.");
  if (typeof value.grantId !== "string" || !SLUG.test(value.grantId)) fail("Owner authority grant ID is invalid.");
  if (typeof value.ownerPrincipal !== "string" || !OWNER_PRINCIPAL.test(value.ownerPrincipal)) fail("Owner authority principal is invalid.");
  if (value.grantee !== "mahoraga-core") fail("Owner authority grantee is invalid.");
  if (!GRANT_STATES.has(value.state)) fail("Owner authority grant state is invalid.");

  const scopes = scopeList(value.scopes, "Owner authority scope", true);
  const deploymentTargets = tokenList(value.deploymentTargets, DEPLOYMENT_TARGETS, "Owner authority deployment target");
  const confirmationRequiredScopes = scopeList(value.confirmationRequiredScopes, "Owner authority confirmation scope", false);
  const revokedScopes = scopeList(value.revokedScopes, "Owner authority revoked scope", false);
  if (confirmationRequiredScopes.some((scope) => !scopes.includes(scope))) fail("Owner authority confirmation scope is not granted.");
  if (revokedScopes.some((scope) => !scopes.includes(scope))) fail("Owner authority revoked scope is not granted.");

  return deepFreeze({ ...structuredClone(value), scopes, deploymentTargets, confirmationRequiredScopes, revokedScopes });
}

export function validateCapabilityAuthorityScopes(value, capabilities) {
  if (value === undefined) return Object.freeze({});
  if (!isRecord(value) || !Array.isArray(capabilities)) fail("Capability authority map is invalid.");
  const declared = new Set(capabilities);
  const result = {};
  for (const [capability, scopes] of Object.entries(value)) {
    if (!declared.has(capability)) fail("Capability authority references undeclared capability.");
    result[capability] = scopeList(scopes, `Capability ${capability} authority scope`, false);
  }
  return deepFreeze(result);
}

export function resolveEffectiveAuthority({
  grant,
  requestedScope,
  requestedTarget = null,
  platformScopes = [],
  capabilityScopes = [],
} = {}) {
  const validated = validateOwnerAuthorityGrant(grant);
  assertScope(requestedScope, "Requested authority scope");
  const platform = scopeList(platformScopes, "Platform authority scope", false);
  const capability = scopeList(capabilityScopes, "Capability authority scope", false);

  if (validated.state !== "active") return deny("owner-grant-inactive", requestedScope, requestedTarget);
  if (validated.revokedScopes.includes(requestedScope)) return deny("owner-scope-revoked", requestedScope, requestedTarget);
  if (!validated.scopes.includes(requestedScope)) return deny("owner-authority-missing", requestedScope, requestedTarget);
  if (!platform.includes(requestedScope)) return deny("platform-authority-missing", requestedScope, requestedTarget);
  if (!capability.includes(requestedScope)) return deny("capability-authority-missing", requestedScope, requestedTarget);
  if (requestedScope === "deployment.execute") {
    if (!DEPLOYMENT_TARGETS.has(requestedTarget)) return deny("deployment-target-invalid", requestedScope, requestedTarget);
    if (!validated.deploymentTargets.includes(requestedTarget)) return deny("deployment-target-not-granted", requestedScope, requestedTarget);
  }
  return Object.freeze({
    authorized: true,
    reason: null,
    requestedScope,
    requestedTarget,
    confirmationRequired: validated.confirmationRequiredScopes.includes(requestedScope),
  });
}

export function resolveCapabilityAuthority({
  grant,
  requestedScope = null,
  requestedTarget = null,
  platformScopes = [],
  capabilityScopes = [],
} = {}) {
  const requiredScopes = scopeList(capabilityScopes, "Capability authority scope", false);
  if (requestedScope !== null) {
    assertScope(requestedScope, "Requested authority scope");
    if (!requiredScopes.includes(requestedScope)) {
      return capabilityDeny("capability-authority-missing", requestedScope, requestedTarget, requiredScopes);
    }
  }
  if (requiredScopes.length === 0) {
    return Object.freeze({ authorized: true, reason: null, requestedScope, requestedTarget, requiredScopes: Object.freeze([]), confirmationRequired: false });
  }
  const evaluationScopes = requestedScope === null
    ? requiredScopes
    : [requestedScope, ...requiredScopes.filter((scope) => scope !== requestedScope)];
  const decisions = evaluationScopes.map((scope) => resolveEffectiveAuthority({
    grant,
    requestedScope: scope,
    requestedTarget: scope === "deployment.execute" ? requestedTarget : null,
    platformScopes,
    capabilityScopes: requiredScopes,
  }));
  const denied = decisions.find((decision) => !decision.authorized);
  if (denied) return capabilityDeny(denied.reason, requestedScope, requestedTarget, requiredScopes);
  return Object.freeze({
    authorized: true,
    reason: null,
    requestedScope,
    requestedTarget,
    requiredScopes: Object.freeze([...requiredScopes]),
    confirmationRequired: decisions.some((decision) => decision.confirmationRequired),
  });
}

function capabilityDeny(reason, requestedScope, requestedTarget, requiredScopes) {
  return Object.freeze({
    authorized: false, reason, requestedScope, requestedTarget,
    requiredScopes: Object.freeze([...requiredScopes]), confirmationRequired: false,
  });
}

function deny(reason, requestedScope, requestedTarget) {
  return Object.freeze({
    authorized: false,
    reason,
    requestedScope,
    requestedTarget,
    confirmationRequired: false,
  });
}

function scopeList(value, label, requireOne) {
  if (!Array.isArray(value) || (requireOne && value.length < 1) || value.length > OWNER_AUTHORITY_SCOPES.length) fail(`${label} list is invalid.`);
  if (new Set(value).size !== value.length) fail(`${label} list contains duplicate scope.`);
  value.forEach((scope) => assertScope(scope, label));
  return [...value];
}

function tokenList(value, allowed, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > allowed.size) fail(`${label} list is invalid.`);
  if (new Set(value).size !== value.length) fail(`${label} list contains duplicate target.`);
  if (value.some((item) => !allowed.has(item))) fail(`${label} is invalid.`);
  return [...value];
}

function assertScope(value, label) {
  if (typeof value !== "string" || !AUTHORITY_SCOPE_SET.has(value)) fail(`${label} is invalid.`);
}

function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function fail(message) { throw new TypeError(message); }
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
