import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST_PATH = path.join(ROOT, "mahoraga.manifest.json");
export const MANIFEST_BACKUP_PATH = path.join(ROOT, "state", "last-known-good.manifest.json");

const DATA_CLASSES = new Set(["synthetic", "personal", "enterprise", "local-only"]);
const COST_CLASSES = new Set(["deterministic", "local-model", "licensed-cloud", "metered-cloud"]);
const INTERFACE_TYPES = new Set(["native-api", "connector", "mcp-cli", "application-extension", "deterministic-worker", "desktop-automation", "vision-automation"]);
const AVAILABILITY_STATES = new Set(["healthy", "busy", "starting", "configured", "disabled"]);

export async function loadManifest(file = MANIFEST_PATH) {
  const canonical = path.resolve(file) === path.resolve(MANIFEST_PATH);
  try {
    const source = await readFile(file, "utf8");
    const manifest = validateManifest(JSON.parse(source));
    if (canonical) {
      await mkdir(path.dirname(MANIFEST_BACKUP_PATH), { recursive: true });
      await writeFile(MANIFEST_BACKUP_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    }
    return manifest;
  } catch (error) {
    if (!canonical) throw error;
    const backupSource = await readFile(MANIFEST_BACKUP_PATH, "utf8");
    const backup = validateManifest(JSON.parse(backupSource));
    await writeFile(MANIFEST_PATH, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
    return backup;
  }
}

export function validateManifest(value) {
  if (!isRecord(value) || value.schemaVersion !== 2 || value.product !== "Mahoraga") {
    throw new TypeError("Manifest identity is invalid.");
  }
  bounded(value.version, 40, "version");
  bounded(value.phase, 60, "phase");
  bounded(value.environment, 30, "environment");
  if (!isRecord(value.versions)) throw new TypeError("Version registry is missing.");
  for (const [component, version] of Object.entries(value.versions)) {
    bounded(component, 40, "version component");
    bounded(version, 40, `${component} version`);
  }
  if (value.updateAuthority !== "user-only") throw new TypeError("Update authority must remain user-only.");
  if (!isRecord(value.runtime)) throw new TypeError("Runtime configuration is missing.");
  if (value.runtime.host !== "127.0.0.1") throw new TypeError("Runtime must remain localhost-only.");
  integer(value.runtime.port, 1024, 65535, "port");
  integer(value.runtime.heartbeatIntervalMs, 500, 60000, "heartbeatIntervalMs");
  integer(value.runtime.heartbeatTimeoutMs, value.runtime.heartbeatIntervalMs * 2, 300000, "heartbeatTimeoutMs");
  integer(value.runtime.taskLeaseMs, 5000, 3600000, "taskLeaseMs");
  integer(value.runtime.maximumWorkerRestarts, 0, 20, "maximumWorkerRestarts");
  integer(value.runtime.workerQuarantineMs, 5000, 3600000, "workerQuarantineMs");
  if (!isRecord(value.queue)) throw new TypeError("Queue configuration is missing.");
  bounded(value.queue.provider, 40, "queue provider");
  bounded(value.queue.state, 80, "queue state");
  bounded(value.queue.environmentName, 100, "queue environment name");
  bounded(value.queue.environmentId, 80, "queue environment id");
  if (!/^https:\/\/[a-z0-9-]+\.crm\.dynamics\.com\/$/i.test(value.queue.environmentUrl)) throw new TypeError("Queue environment URL is invalid.");
  slug(value.queue.solutionName.toLowerCase(), "queue solution name");
  bounded(value.queue.relayId, 64, "queue relay id");
  integer(value.queue.pollIntervalMs, 1000, 300000, "queue pollIntervalMs");
  integer(value.queue.leaseMs, 5000, 3600000, "queue leaseMs");
  integer(value.queue.maximumAttempts, 1, 20, "queue maximumAttempts");
  if (value.queue.outboundOnly !== true || value.queue.exactlyOnce !== true) throw new TypeError("Queue must remain outbound-only and idempotent.");
  if (!isRecord(value.featureFlags)) throw new TypeError("Feature flags are missing.");
  for (const [flag, enabled] of Object.entries(value.featureFlags)) {
    bounded(flag, 64, "feature flag");
    if (typeof enabled !== "boolean") throw new TypeError(`Feature flag ${flag} is invalid.`);
  }
  if (!isRecord(value.repair) || value.repair.enabled !== true) throw new TypeError("Automatic operational repair must be enabled.");
  if (value.repair.coreUpdateAuthority !== "user-only") throw new TypeError("Core update authority must remain user-only.");
  integer(value.repair.scanIntervalMs, 5000, 3600000, "repair scanIntervalMs");
  if (!Array.isArray(value.repair.automaticRiskClasses) || value.repair.automaticRiskClasses.join(",") !== "operational") {
    throw new TypeError("Only operational repairs may auto-activate.");
  }
  if (!/^state\/[a-z0-9._/-]+$/i.test(value.repair.baselineDirectory) || value.repair.baselineDirectory.includes("..")) {
    throw new TypeError("Repair baseline must stay inside state/.");
  }
  if (!isRecord(value.routingPolicy)) throw new TypeError("Routing policy is missing.");
  if (!Array.isArray(value.routingPolicy.interfaceOrder) || value.routingPolicy.interfaceOrder.length !== INTERFACE_TYPES.size ||
      new Set(value.routingPolicy.interfaceOrder).size !== INTERFACE_TYPES.size || value.routingPolicy.interfaceOrder.some((item) => !INTERFACE_TYPES.has(item))) {
    throw new TypeError("Routing interface order is invalid.");
  }
  if (!Array.isArray(value.routingPolicy.availabilityOrder) || value.routingPolicy.availabilityOrder.length !== AVAILABILITY_STATES.size ||
      new Set(value.routingPolicy.availabilityOrder).size !== AVAILABILITY_STATES.size || value.routingPolicy.availabilityOrder.some((item) => !AVAILABILITY_STATES.has(item))) {
    throw new TypeError("Routing availability order is invalid.");
  }
  integer(value.routingPolicy.minimumReliability, 0, 100, "routing minimumReliability");
  if (!/^state\/[a-z0-9._-]+\.sqlite$/i.test(value.runtime.database)) throw new TypeError("Database path must stay inside state/.");
  if (!isRecord(value.costModes) || !Array.isArray(value.costModes[value.defaultAutonomyMode])) {
    throw new TypeError("Default autonomy mode is invalid.");
  }
  for (const [mode, classes] of Object.entries(value.costModes)) {
    bounded(mode, 30, "cost mode");
    if (!Array.isArray(classes) || classes.length === 0 || classes.some((item) => !COST_CLASSES.has(item))) {
      throw new TypeError(`Cost mode ${mode} is invalid.`);
    }
  }
  if (!Array.isArray(value.workers) || value.workers.length === 0 || value.workers.length > 32) {
    throw new TypeError("Worker registry is invalid.");
  }
  const ids = new Set();
  for (const worker of value.workers) {
    if (!isRecord(worker)) throw new TypeError("Worker entry must be an object.");
    slug(worker.id, "worker id");
    if (ids.has(worker.id)) throw new TypeError(`Duplicate worker: ${worker.id}`);
    ids.add(worker.id);
    bounded(worker.label, 80, "worker label");
    bounded(worker.version, 40, "worker version");
    if (typeof worker.enabled !== "boolean") throw new TypeError("Worker enabled must be boolean.");
    if (!COST_CLASSES.has(worker.costClass)) throw new TypeError("Worker cost class is invalid.");
    if (!Array.isArray(worker.dataClasses) || worker.dataClasses.length === 0 || worker.dataClasses.some((item) => !DATA_CLASSES.has(item))) {
      throw new TypeError(`Worker ${worker.id} data classes are invalid.`);
    }
    if (!Array.isArray(worker.capabilities) || worker.capabilities.length === 0 || worker.capabilities.length > 32) {
      throw new TypeError(`Worker ${worker.id} capabilities are invalid.`);
    }
    worker.capabilities.forEach((item) => capability(item));
    if (!Array.isArray(worker.acceptedTaskTypes) || worker.acceptedTaskTypes.length === 0) throw new TypeError(`Worker ${worker.id} task types are invalid.`);
    worker.acceptedTaskTypes.forEach((item) => slug(item, "accepted task type"));
    integer(worker.timeoutMs, 1000, 3600000, "worker timeoutMs");
    integer(worker.concurrency, 1, 16, "worker concurrency");
    capability(worker.healthProbe);
    bounded(worker.executionPlane, 40, "worker execution plane");
    if (!isRecord(worker.routing) || !INTERFACE_TYPES.has(worker.routing.interfaceType)) throw new TypeError(`Worker ${worker.id} interface type is invalid.`);
    slug(worker.routing.permissionClass, "worker permission class");
    integer(worker.routing.reliability, 0, 100, `worker ${worker.id} reliability`);
    if (typeof worker.routing.requiresAttendedDesktop !== "boolean") throw new TypeError(`Worker ${worker.id} attended desktop flag is invalid.`);
    if (!Array.isArray(worker.routing.fallbackWorkerIds) || worker.routing.fallbackWorkerIds.length > 8) throw new TypeError(`Worker ${worker.id} fallbacks are invalid.`);
    worker.routing.fallbackWorkerIds.forEach((item) => slug(item, "fallback worker id"));
  }
  for (const worker of value.workers) {
    if (worker.routing.fallbackWorkerIds.includes(worker.id) || worker.routing.fallbackWorkerIds.some((item) => !ids.has(item))) {
      throw new TypeError(`Worker ${worker.id} fallback references are invalid.`);
    }
  }
  if (!Array.isArray(value.connections)) throw new TypeError("Connections must be an array.");
  for (const connection of value.connections) {
    slug(connection.id, "connection id");
    bounded(connection.state, 100, "connection state");
    bounded(connection.endpointClass, 60, "endpoint class");
    bounded(connection.authenticationState, 80, "authentication state");
    if (!Array.isArray(connection.capabilities)) throw new TypeError(`Connection ${connection.id} capabilities are invalid.`);
    connection.capabilities.forEach((item) => capability(item));
    if (connection.lastSuccessfulCheck !== null) bounded(connection.lastSuccessfulCheck, 40, "connection check");
    if (connection.latencyMs !== null) integer(connection.latencyMs, 0, 3600000, "connection latencyMs");
    if (connection.error !== null) bounded(connection.error, 160, "connection error");
  }
  return Object.freeze(structuredClone(value));
}

function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function bounded(value, max, name) {
  if (typeof value !== "string" || value.length < 1 || value.length > max || /[\r\n]/.test(value)) throw new TypeError(`${name} is invalid.`);
}
function slug(value, name) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) throw new TypeError(`${name} is invalid.`);
}
function capability(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,31}\.[a-z][a-z0-9-]{0,31}$/.test(value)) throw new TypeError("Worker capability is invalid.");
}
function integer(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) throw new TypeError(`${name} is invalid.`);
}
