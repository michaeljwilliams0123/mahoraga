import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadProductIdentity } from "./product-identity.mjs";
import { applyGoogleCapabilityManifest, validateGoogleCapabilityWorkers } from "./google-capability-manifest.mjs";
import { validateCapabilityAuthorityScopes, validateOwnerAuthorityGrant } from "./owner-authority.mjs";
import { validateBillingClass } from "./resource-economy.mjs";
import * as legacy from "./config-legacy.mjs";

export const ROOT = legacy.ROOT;
export const MANIFEST_PATH = legacy.MANIFEST_PATH;
export const MANIFEST_BACKUP_PATH = legacy.MANIFEST_BACKUP_PATH;

export const CORE_OWNED_CLOUD_WORKERS = Object.freeze(["codespaces-open-weight", "native-cloud-model", "cloud-browser"]);

const ZERO_CREDIT_ANSWER_WORKERS = Object.freeze([
  Object.freeze({ id: "codespaces-open-weight", label: "Zero-Credit Cloud Answer", costClass: "cloud-open-weight", executionPlane: "cloud-open-weight", executionType: "remote-provider", reliability: 92, latencyMs: 750 }),
  Object.freeze({ id: "local-open-weight", label: "Zero-Credit Local Answer", costClass: "local-model", executionPlane: "local", executionType: "local-provider", reliability: 96, latencyMs: 250 }),
]);
const ZERO_CREDIT_ANSWER_WORKER_IDS = new Set(ZERO_CREDIT_ANSWER_WORKERS.map((worker) => worker.id));
const PROTOCOL_KEYS = new Set(["apiProtocol", "taskSchema", "workerContract", "relayProtocol", "capabilityRegistrySchema"]);
const PROTOCOL_REVISION = /^[0-9A-Za-z][0-9A-Za-z.-]{0,31}$/;

export async function loadManifest(file = MANIFEST_PATH, { env = process.env } = {}) {
  const canonical = path.resolve(file) === path.resolve(MANIFEST_PATH);
  const identity = canonical ? await loadProductIdentity() : null;
  let manifest;
  try {
    const source = JSON.parse(await readFile(file, "utf8"));
    manifest = validateManifest(normalizeManifestCompatibility(source, identity), { env });
  } catch (error) {
    if (!canonical || error?.code === "local-ai-production-config-forbidden") throw error;
    const backupSource = JSON.parse(await readFile(MANIFEST_BACKUP_PATH, "utf8"));
    manifest = validateManifest(normalizeManifestCompatibility(backupSource, identity), { env });
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

export function validateManifest(input, { env = process.env } = {}) {
  assertLocalAiConfigurationAllowed(input, env);
  const value = stripZeroCreditAnswerRuntime(input);
  if (!isRecord(value)) throw new TypeError("Manifest identity is invalid.");
  if (value.versions !== undefined) throw new TypeError("Legacy version registry is not allowed; use protocol revisions.");
  validateProtocols(value.protocols);
  validateOwnerAuthorityGrant(value.ownerAuthority);
  if (!Array.isArray(value.workers)) throw new TypeError("Worker registry is invalid.");
  for (const worker of value.workers) {
    if (!isRecord(worker)) throw new TypeError("Worker entry must be an object.");
    if (worker.version !== undefined) throw new TypeError("Legacy worker version is not allowed; use implementation revision.");
    boundedRevision(worker.implementationRevision, "worker implementation revision");
    validateCapabilityAuthorityScopes(worker.authorityScopesByCapability, worker.capabilities);
    validateBillingClassMap(worker.billingClassByCapability, worker.capabilities);
  }
  validateGoogleCapabilityWorkers(value);

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
  return Object.freeze(applyZeroCreditAnswerRuntime(normalizeManifestCompatibility(validated), env));
}

export function isLocalAiDevelopmentEnabled(env = process.env) {
  return env?.NODE_ENV === "development" && env?.ALLOW_LOCAL_AI_DEV === "true";
}

export function assertLocalAiConfigurationAllowed(manifest, env = process.env) {
  if (isLocalAiDevelopmentEnabled(env)) return;
  const localWorker = (Array.isArray(manifest?.workers) ? manifest.workers : []).find((worker) => worker?.enabled === true && (
    worker.costClass === "local-model"
    || worker.executionPlane === "local-model"
    || worker.executionType === "local-provider"
    || /^(?:local-(?:reasoner|open-weight|model|embedding)|ollama|lm-studio)/i.test(String(worker.id ?? ""))
  ));
  const localEnvironment = Object.entries(env ?? {}).find(([key, value]) =>
    key !== "ALLOW_LOCAL_AI_DEV" && value !== undefined && value !== null && String(value).trim() !== ""
    && (isLocalAdapterEnvironmentKey(key, value) || isLocalAdapterValue(key, value)));
  if (localWorker || localEnvironment) {
    const adapter = localWorker?.id ?? localEnvironment?.[0] ?? "configured-adapter";
    const error = new TypeError(`Local AI adapter "${adapter}" is development-only; set NODE_ENV=development and ALLOW_LOCAL_AI_DEV=true to enable it.`);
    error.code = "local-ai-production-config-forbidden";
    throw error;
  }
}

export function normalizeManifestCompatibility(value, identity = null) {
  if (!isRecord(value)) return value;
  const next = structuredClone(value);
  if (identity) {
    next.product = identity.product;
    next.version = identity.buildVersion;
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
  return applyGoogleCapabilityManifest(next);
}

function applyZeroCreditAnswerRuntime(value, env) {
  const next = structuredClone(value);
  const localAiEnabled = isLocalAiDevelopmentEnabled(env);
  if (!localAiEnabled) {
    for (const [mode, classes] of Object.entries(next.costModes ?? {})) {
      if (Array.isArray(classes)) next.costModes[mode] = classes.filter((costClass) => costClass !== "local-model");
    }
  }
  next.costModes = { ...next.costModes, "zero-credit": ["deterministic", ...(localAiEnabled ? ["local-model"] : []), "cloud-open-weight"] };
  for (const descriptor of ZERO_CREDIT_ANSWER_WORKERS) {
    if (descriptor.costClass === "local-model" && !localAiEnabled) continue;
    if (next.workers.some((worker) => worker.id === descriptor.id)) continue;
    next.workers.push({
      id: descriptor.id,
      label: descriptor.label,
      implementationRevision: "open-weight-adapter-1",
      enabled: true,
      costClass: descriptor.costClass,
      dataClasses: ["synthetic", "personal", "local-only"],
      capabilities: ["assistant.health", "assistant.respond"],
      acceptedTaskTypes: ["assistant"],
      timeoutMs: 120000,
      concurrency: 1,
      healthProbe: "assistant.health",
      capabilityCanaries: { "assistant.health": "health", "assistant.respond": "provider-derived" },
      billingClassByCapability: { "assistant.health": "deterministic-zero", "assistant.respond": "deterministic-zero" },
      executionPlane: descriptor.executionPlane,
      routing: {
        interfaceType: "native-api",
        permissionClass: "bounded-zero-credit-model",
        reliability: descriptor.reliability,
        requiresAttendedDesktop: false,
        executionType: descriptor.executionType,
        latencyMs: descriptor.latencyMs,
        maximumWorkload: 1,
        fallbackWorkerIds: [],
      },
    });
  }
  return next;
}

function isLocalAdapterEnvironmentKey(key, value) {
  if (/^(?:false|0|off|disabled|none)$/i.test(String(value).trim())) return false;
  return /(?:LOCAL_(?:AI|MODEL|EMBEDDING|REASONER|OPEN_WEIGHT)|OLLAMA|LM[_-]?STUDIO)/i.test(key);
}

function isLocalAdapterValue(key, value) {
  if (!/(?:AI|MODEL|EMBEDDING|GENERATION|PROVIDER|ADAPTER|ENDPOINT|URL)/i.test(key)) return false;
  const normalized = String(value).trim().toLowerCase();
  if (/^(?:local|local-model|local-provider|local-open-weight|local-reasoner|ollama|lm[-_ ]?studio)(?:$|[:/@])/i.test(normalized)) return true;
  try {
    const hostname = new URL(normalized).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function stripZeroCreditAnswerRuntime(value) {
  if (!isRecord(value)) return value;
  const next = structuredClone(value);
  if (isRecord(next.costModes)) delete next.costModes["zero-credit"];
  if (Array.isArray(next.workers)) next.workers = next.workers.filter((worker) => !ZERO_CREDIT_ANSWER_WORKER_IDS.has(worker?.id));
  return next;
}

function validateBillingClassMap(value, capabilities) {
  if (value === undefined) return;
  if (!isRecord(value)) throw new TypeError("Worker billing class map is invalid.");
  const keys = Object.keys(value).sort();
  const declared = [...capabilities].sort();
  if (keys.length !== declared.length || keys.some((key, index) => key !== declared[index])) throw new TypeError("Worker billing class map must cover every capability exactly.");
  for (const billingClass of Object.values(value)) {
    try { validateBillingClass(billingClass); }
    catch { throw new TypeError("Worker billing class is invalid."); }
  }
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

function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

async function stageManifestRecoveryCandidate(error) {
  try {
    const directory = path.join(ROOT, "state", "repairs");
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `manifest-recovery-${Date.now()}-${process.pid}.json`);
    const candidate = {
      kind: "core-source-repair", relative: "mahoraga.manifest.json", baseline: path.relative(ROOT, MANIFEST_BACKUP_PATH),
      stagedAt: new Date().toISOString(), verificationRequired: true, activationAuthority: "mahoraga-verified-automatic", rollbackRequired: true,
      reason: String(error?.code ?? error?.name ?? "manifest-invalid").slice(0, 80),
    };
    await writeFile(file, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
  } catch {
    // Recovery remains read-only if candidate storage is unavailable.
  }
}
