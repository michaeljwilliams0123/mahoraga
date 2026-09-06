import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadProductIdentity } from "./product-identity.mjs";
import * as legacy from "./config-legacy.mjs";

export const ROOT = legacy.ROOT;
export const MANIFEST_PATH = legacy.MANIFEST_PATH;
export const MANIFEST_BACKUP_PATH = legacy.MANIFEST_BACKUP_PATH;

const PROTOCOL_KEYS = new Set(["apiProtocol", "taskSchema", "workerContract", "relayProtocol", "capabilityRegistrySchema"]);
const PROTOCOL_REVISION = /^[0-9A-Za-z][0-9A-Za-z.-]{0,31}$/;

export async function loadManifest(file = MANIFEST_PATH) {
  const canonical = path.resolve(file) === path.resolve(MANIFEST_PATH);
  const identity = canonical ? await loadProductIdentity() : null;
  let manifest;
  try {
    const source = JSON.parse(await readFile(file, "utf8"));
    manifest = validateManifest(normalizeManifestCompatibility(source, identity));
  } catch (error) {
    if (!canonical) throw error;
    const backupSource = JSON.parse(await readFile(MANIFEST_BACKUP_PATH, "utf8"));
    manifest = validateManifest(normalizeManifestCompatibility(backupSource, identity));
    await stageManifestRecoveryCandidate(error);
    return manifest;
  }

  if (canonical) {
    try {
      await mkdir(path.dirname(MANIFEST_BACKUP_PATH), { recursive: true });
      await writeFile(MANIFEST_BACKUP_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    } catch {
      // A valid live manifest remains authoritative when operational backup storage is unavailable.
    }
  }
  return manifest;
}

export function validateManifest(value) {
  if (!isRecord(value)) throw new TypeError("Manifest identity is invalid.");
  if (value.versions !== undefined) throw new TypeError("Legacy version registry is not allowed; use protocol revisions.");
  validateProtocols(value.protocols);
  if (!Array.isArray(value.workers)) throw new TypeError("Worker registry is invalid.");
  for (const worker of value.workers) {
    if (!isRecord(worker)) throw new TypeError("Worker entry must be an object.");
    if (worker.version !== undefined) throw new TypeError("Legacy worker version is not allowed; use implementation revision.");
    boundedRevision(worker.implementationRevision, "worker implementation revision");
  }

  const shadow = structuredClone(value);
  const protocols = shadow.protocols;
  delete shadow.protocols;
  shadow.versions = {
    runtime: shadow.version,
    controlCenter: shadow.version,
    api: shadow.version,
    cloudControlPlane: `protocol-${protocols.apiProtocol}`,
    cloudWorkspace: `relay-${protocols.relayProtocol}`,
    capabilityRegistry: `schema-${protocols.capabilityRegistrySchema}`,
    taskSchema: protocols.taskSchema,
    workerContract: protocols.workerContract,
  };
  for (const worker of shadow.workers) {
    worker.version = worker.implementationRevision;
    delete worker.implementationRevision;
  }
  const validated = legacy.validateManifest(shadow);
  return Object.freeze(normalizeManifestCompatibility(validated));
}

export function normalizeManifestCompatibility(value, identity = null) {
  if (!isRecord(value)) return value;
  const next = structuredClone(value);
  if (identity) {
    next.product = identity.product;
    next.version = identity.version;
  }

  if (next.versions !== undefined) {
    if (!isRecord(next.versions) || next.protocols !== undefined) throw new TypeError("Manifest compatibility registry is ambiguous.");
    next.protocols = {
      apiProtocol: "2",
      taskSchema: String(next.versions.taskSchema ?? "3"),
      workerContract: String(next.versions.workerContract ?? "2"),
      relayProtocol: "1",
      capabilityRegistrySchema: "1",
    };
    delete next.versions;
  }

  if (Array.isArray(next.workers)) {
    for (const worker of next.workers) {
      if (!isRecord(worker)) continue;
      if (worker.version !== undefined) {
        if (worker.implementationRevision !== undefined) throw new TypeError("Worker compatibility revision is ambiguous.");
        worker.implementationRevision = worker.version;
        delete worker.version;
      }
    }
  }
  return next;
}

function validateProtocols(value) {
  if (!isRecord(value)) throw new TypeError("Protocol revision registry is missing.");
  const keys = Object.keys(value);
  if (keys.length !== PROTOCOL_KEYS.size || keys.some((key) => !PROTOCOL_KEYS.has(key))) throw new TypeError("Protocol revision registry is invalid.");
  for (const key of PROTOCOL_KEYS) boundedRevision(value[key], `${key} protocol revision`);
}

function boundedRevision(value, name) {
  if (typeof value !== "string" || !PROTOCOL_REVISION.test(value)) throw new TypeError(`${name} is invalid.`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function stageManifestRecoveryCandidate(error) {
  try {
    const directory = path.join(ROOT, "state", "repairs");
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `manifest-recovery-${Date.now()}-${process.pid}.json`);
    const candidate = {
      kind: "core-source-repair",
      relative: "mahoraga.manifest.json",
      baseline: path.relative(ROOT, MANIFEST_BACKUP_PATH),
      stagedAt: new Date().toISOString(),
      verificationRequired: true,
      activationAuthority: "mahoraga-verified-automatic",
      rollbackRequired: true,
      reason: String(error?.code ?? error?.name ?? "manifest-invalid").slice(0, 80),
    };
    await writeFile(file, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
  } catch {
    // Recovery remains read-only if candidate storage is unavailable.
  }
}
