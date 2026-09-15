export const PLATFORM_LIFECYCLE_SCHEMA_VERSION = 1;

const REGISTRY_KEYS = new Set(['schemaVersion', 'kind', 'resources']);
const RESOURCE_KEYS = new Set([
  'logicalId', 'provider', 'providerProjectId', 'providerResourceId', 'displayName',
  'lifecycle', 'authorityRole', 'canonical', 'routingEligible', 'environment',
]);
const LIFECYCLES = new Set(['active', 'standby', 'staged', 'retired']);
const AUTHORITY_ROLES = new Set(['source', 'ci', 'runtime', 'edge', 'assurance', 'device', 'hosting']);

export function validatePlatformLifecycle(value) {
  exact(value, REGISTRY_KEYS, 'platform-lifecycle-invalid');
  if (value.schemaVersion !== PLATFORM_LIFECYCLE_SCHEMA_VERSION || value.kind !== 'platform-lifecycle') {
    fail('platform-lifecycle-invalid');
  }
  if (!Array.isArray(value.resources) || value.resources.length < 1 || value.resources.length > 256) {
    fail('platform-lifecycle-invalid');
  }
  const resources = value.resources.map(validateResource).sort((a, b) => a.logicalId.localeCompare(b.logicalId));
  const logicalIds = new Set();
  const canonicalRoles = new Set();
  for (const resource of resources) {
    if (logicalIds.has(resource.logicalId)) fail('platform-lifecycle-logical-id-conflict');
    logicalIds.add(resource.logicalId);
    if (resource.canonical) {
      if (canonicalRoles.has(resource.authorityRole)) fail('platform-lifecycle-canonical-conflict');
      canonicalRoles.add(resource.authorityRole);
    }
  }
  return deepFreeze({ schemaVersion: PLATFORM_LIFECYCLE_SCHEMA_VERSION, kind: 'platform-lifecycle', resources });
}
export function canonicalResource(registry, logicalId) {
  const value = validatePlatformLifecycle(registry);
  const resource = value.resources.find((item) => item.logicalId === logicalId);
  if (!resource || resource.canonical !== true) fail('platform-lifecycle-canonical-resource-missing');
  return resource;
}

export function routablePlatformResources(registry) {
  const value = validatePlatformLifecycle(registry);
  return deepFreeze(value.resources.filter((item) => item.routingEligible));
}

function validateResource(value) {
  exact(value, RESOURCE_KEYS, 'platform-lifecycle-resource-invalid');
  const resource = {
    logicalId: token(value.logicalId, 96, 'platform-lifecycle-resource-invalid'),
    provider: token(value.provider, 64, 'platform-lifecycle-resource-invalid'),
    providerProjectId: nullableToken(value.providerProjectId, 160, 'platform-lifecycle-resource-invalid'),
    providerResourceId: nullableToken(value.providerResourceId, 160, 'platform-lifecycle-resource-invalid'),
    displayName: text(value.displayName, 200, 'platform-lifecycle-resource-invalid'),
    lifecycle: allowed(value.lifecycle, LIFECYCLES, 'platform-lifecycle-resource-invalid'),
    authorityRole: allowed(value.authorityRole, AUTHORITY_ROLES, 'platform-lifecycle-resource-invalid'),
    canonical: boolean(value.canonical, 'platform-lifecycle-resource-invalid'),
    routingEligible: boolean(value.routingEligible, 'platform-lifecycle-resource-invalid'),
    environment: nullableToken(value.environment, 96, 'platform-lifecycle-resource-invalid'),
  };
  if (resource.lifecycle === 'retired' && (resource.canonical || resource.routingEligible)) fail('platform-lifecycle-retired-authority');
  if (resource.canonical && (resource.lifecycle !== 'active' || !resource.providerResourceId)) fail('platform-lifecycle-canonical-invalid');
  return deepFreeze(resource);
}
function exact(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail(code);
}
function token(value, maximum, code) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || /[\0\r\n]/.test(value)) fail(code);
  return value;
}
function nullableToken(value, maximum, code) { return value === null ? null : token(value, maximum, code); }
function text(value, maximum, code) {
  if (typeof value !== 'string') fail(code);
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > maximum || /\0/.test(value)) fail(code);
  return normalized;
}
function allowed(value, set, code) { if (!set.has(value)) fail(code); return value; }
function boolean(value, code) { if (typeof value !== 'boolean') fail(code); return value; }
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
