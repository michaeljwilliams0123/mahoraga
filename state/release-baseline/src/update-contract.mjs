const KEYS = new Set(["schemaVersion", "product", "version", "channel", "repository", "tag", "commit", "artifact", "activation", "createdAt"]);
const ARTIFACT_KEYS = new Set(["name", "sizeBytes", "sha256"]);
const ACTIVATION_KEYS = new Set(["automatic", "mode", "authority", "rollbackRequired"]);
const CHANNELS = new Set(["stable", "beta"]);

export function createUpdateManifest(input, { now = new Date().toISOString() } = {}) {
  return validateUpdateManifest({
    schemaVersion: 1,
    product: "Mahoraga",
    version: input.version,
    channel: input.channel,
    repository: "michaeljwilliams0123/mahoraga",
    tag: input.tag,
    commit: String(input.commit ?? "").toLowerCase(),
    artifact: { name: input.artifactName, sizeBytes: input.sizeBytes, sha256: String(input.sha256 ?? "").toLowerCase() },
    activation: { automatic: false, mode: "stage-only", authority: "user-only", rollbackRequired: true },
    createdAt: now,
  });
}

export function validateUpdateManifest(record) {
  exact(record, KEYS, "update manifest");
  if (record.schemaVersion !== 1 || record.product !== "Mahoraga") throw new TypeError("Update manifest identity is invalid.");
  version(record.version);
  if (!CHANNELS.has(record.channel)) throw new TypeError("Update channel is invalid.");
  if (record.repository !== "michaeljwilliams0123/mahoraga") throw new TypeError("Update repository is invalid.");
  if (record.tag !== `v${record.version}`) throw new TypeError("Update tag is invalid.");
  if (!/^[a-f0-9]{40}$/.test(record.commit)) throw new TypeError("Update commit is invalid.");
  exact(record.artifact, ARTIFACT_KEYS, "update artifact");
  if (record.artifact.name !== `mahoraga-${record.version}.zip`) throw new TypeError("Update artifact name is invalid.");
  if (!Number.isSafeInteger(record.artifact.sizeBytes) || record.artifact.sizeBytes < 1 || record.artifact.sizeBytes > 100_000_000) throw new TypeError("Update artifact size is invalid.");
  if (!/^[a-f0-9]{64}$/.test(record.artifact.sha256)) throw new TypeError("Update artifact digest is invalid.");
  exact(record.activation, ACTIVATION_KEYS, "update activation policy");
  if (record.activation.automatic !== false || record.activation.mode !== "stage-only" || record.activation.authority !== "user-only" || record.activation.rollbackRequired !== true) {
    throw new TypeError("Update activation policy is invalid.");
  }
  if (typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))) throw new TypeError("Update creation time is invalid.");
  return Object.freeze(structuredClone(record));
}

function version(value) {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(value)) throw new TypeError("Update version is invalid.");
}
function exact(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  for (const key of Object.keys(value)) if (!keys.has(key)) throw new TypeError(`${label} field is not allowed: ${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new TypeError(`${label} field is missing: ${key}`);
}
