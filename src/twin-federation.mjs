const REPOSITORY = "michaeljwilliams0123/mahoraga";
const DESCRIPTOR_KEYS = new Set([
  "schemaVersion",
  "federationId",
  "peerId",
  "parentPeerId",
  "generation",
  "repository",
  "commit",
  "capabilities",
  "createdAt",
]);

export function createTwinDescriptor(input, { createdAt = new Date().toISOString() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("twin-descriptor-invalid");
  const value = {
    schemaVersion: 1,
    federationId: input.federationId,
    peerId: input.peerId,
    parentPeerId: input.parentPeerId ?? null,
    generation: input.generation ?? 0,
    repository: input.repository,
    commit: input.commit,
    capabilities: normalizeCapabilities(input.capabilities ?? []),
    createdAt,
  };
  return validateTwinDescriptor(value);
}

export function cloneTwinDescriptor(parent, input, { createdAt = new Date().toISOString() } = {}) {
  const source = validateTwinDescriptor(parent);
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "peerId")) {
    fail("twin-clone-invalid");
  }
  peerId(input.peerId);
  if (input.peerId === source.peerId) fail("twin-peer-collision");
  return createTwinDescriptor({
    federationId: source.federationId,
    peerId: input.peerId,
    parentPeerId: source.peerId,
    generation: source.generation + 1,
    repository: source.repository,
    commit: source.commit,
    capabilities: source.capabilities,
  }, { createdAt });
}

export function validateTwinDescriptor(value) {
  exactObject(value, DESCRIPTOR_KEYS, "twin-descriptor-invalid");
  if (value.schemaVersion !== 1) fail("twin-descriptor-invalid");
  slug(value.federationId, "twin-federation-invalid");
  peerId(value.peerId);
  if (value.parentPeerId !== null) peerId(value.parentPeerId);
  if (!Number.isSafeInteger(value.generation) || value.generation < 0 || value.generation > 1024) fail("twin-generation-invalid");
  if (value.repository !== REPOSITORY) fail("twin-repository-invalid");
  sha(value.commit, "twin-commit-invalid");
  const capabilities = normalizeCapabilities(value.capabilities);
  timestamp(value.createdAt, "twin-created-at-invalid");
  return deepFreeze({
    schemaVersion: 1,
    federationId: value.federationId,
    peerId: value.peerId,
    parentPeerId: value.parentPeerId,
    generation: value.generation,
    repository: value.repository,
    commit: value.commit,
    capabilities,
    createdAt: value.createdAt,
  });
}

function normalizeCapabilities(value) {
  if (!Array.isArray(value) || value.length > 64 || new Set(value).size !== value.length) fail("twin-capabilities-invalid");
  return value.map((item) => capability(item)).sort();
}

function capability(value) {
  if (typeof value !== "string" || !/^twin\.[a-z][a-z0-9.-]{1,63}$/.test(value)) fail("twin-capability-invalid");
  return value;
}

function peerId(value) {
  slug(value, "twin-peer-invalid");
  return value;
}

function slug(value, code) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail(code);
  return value;
}

function sha(value, code) {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) fail(code);
  return value;
}

function timestamp(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code);
  return value;
}

function exactObject(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail(code);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
