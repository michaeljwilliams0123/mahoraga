import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAutonomyPolicy } from "./autonomy-policy.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST_PATH = path.join(ROOT, "mahoraga.manifest.json");
export const MANIFEST_BACKUP_PATH = path.join(ROOT, "state", "last-known-good.manifest.json");

const DATA_CLASSES = new Set(["synthetic", "personal", "enterprise", "local-only"]);
const COST_CLASSES = new Set(["deterministic", "local-model", "licensed-cloud", "metered-cloud"]);
const AVAILABILITY_STATES = new Set(["healthy", "busy", "starting", "configured", "disabled", "stale", "offline", "unhealthy", "unavailable"]);

export async function loadManifest(file = MANIFEST_PATH) {
  const canonical = path.resolve(file) === path.resolve(MANIFEST_PATH);
  if (!canonical) return validateManifest(JSON.parse(await readFile(file, "utf8")));

  let manifest;
  try {
    const source = await readFile(file, "utf8");
    manifest = validateManifest(JSON.parse(source));
  } catch (error) {
    const backupSource = await readFile(MANIFEST_BACKUP_PATH, "utf8");
    const backup = validateManifest(JSON.parse(backupSource));
    await stageManifestRecoveryCandidate(error);
    return backup;
  }

  try {
    await mkdir(path.dirname(MANIFEST_BACKUP_PATH), { recursive: true });
    await writeFile(MANIFEST_BACKUP_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  } catch {
    // A valid live manifest remains authoritative when operational backup storage is unavailable.
  }
  return manifest;
}

async function stageManifestRecoveryCandidate(error) {
  try {
    const directory = path.join(ROOT, "state", "repairs");
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `manifest-recovery-${Date.now()}-${process.pid}.json`);
    const candidate = { kind: "core-source-repair", relative: "mahoraga.manifest.json", baseline: path.relative(ROOT, MANIFEST_BACKUP_PATH), stagedAt: new Date().toISOString(), verificationRequired: true, activationAuthority: "mahoraga-verified-automatic", rollbackRequired: true, reason: String(error?.code ?? error?.name ?? "manifest-invalid").slice(0, 80) };
    await writeFile(file, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
  } catch {
    // Recovery remains read-only if candidate storage is unavailable.
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
  if (value.updateAuthority !== "mahoraga-verified-automatic") throw new TypeError("Update authority must use verified automatic activation.");
  validateAutonomyPolicy(value.autonomy);
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
  if (value.repair.coreUpdateAuthority !== "mahoraga-verified-automatic") throw new TypeError("Core update authority must use verified automatic activation.");
  integer(value.repair.scanIntervalMs, 5000, 3600000, "repair scanIntervalMs");
  if (!Array.isArray(value.repair.automaticRiskClasses) || value.repair.automaticRiskClasses.join(",") !== "operational,core") {
    throw new TypeError("Operational and verified core repairs must auto-activate.");
  }
  if (!/^state\/[a-z0-9._/-]+$/i.test(value.repair.baselineDirectory) || value.repair.baselineDirectory.includes("..")) {
    throw new TypeError("Repair baseline must stay inside state/.");
  }
  validateTruthContracts(value.truthContracts);
  validateBrowserPolicy(value.browser);
  validateMcpProviders(value.mcpProviders);
  validateExecutionBudgets(value.executionBudgets);
  validateObservationMemory(value.observationMemory);
  if (!isRecord(value.routingPolicy)) throw new TypeError("Routing policy is missing.");
  if (!Array.isArray(value.routingPolicy.interfaceOrder) || value.routingPolicy.interfaceOrder.length < 1 ||
      new Set(value.routingPolicy.interfaceOrder).size !== value.routingPolicy.interfaceOrder.length || value.routingPolicy.interfaceOrder.some((item) => !validRoutingValue(item))) {
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
    if (worker.enabled) {
      if (!isRecord(worker.capabilityCanaries)) throw new TypeError(`Worker ${worker.id} capability canaries are invalid.`);
      const canaryCapabilities = Object.keys(worker.capabilityCanaries).sort();
      const declaredCapabilities = [...worker.capabilities].sort();
      if (canaryCapabilities.length !== declaredCapabilities.length || canaryCapabilities.some((item, index) => item !== declaredCapabilities[index])) throw new TypeError(`Worker ${worker.id} capability canaries must cover every capability exactly.`);
      if (worker.capabilityCanaries[worker.healthProbe] !== "health") throw new TypeError(`Worker ${worker.id} health probe canary is invalid.`);
      for (const [canaryCapability, mode] of Object.entries(worker.capabilityCanaries)) {
        if (!new Set(["health", "direct", "provider-derived"]).has(mode) || (mode === "health") !== (canaryCapability === worker.healthProbe)) throw new TypeError(`Worker ${worker.id} capability canary mode is invalid.`);
      }
    }
    bounded(worker.executionPlane, 40, "worker execution plane");
    if (!isRecord(worker.routing) || !validRoutingValue(worker.routing.interfaceType)) throw new TypeError(`Worker ${worker.id} interface type is invalid.`);
    slug(worker.routing.permissionClass, "worker permission class");
    integer(worker.routing.reliability, 0, 100, `worker ${worker.id} reliability`);
    if (typeof worker.routing.requiresAttendedDesktop !== "boolean") throw new TypeError(`Worker ${worker.id} attended desktop flag is invalid.`);
    slug(worker.routing.executionType, `worker ${worker.id} execution type`);
    integer(worker.routing.latencyMs, 0, 3600000, `worker ${worker.id} latency`);
    integer(worker.routing.maximumWorkload, 1, 16, `worker ${worker.id} workload`);
    if (!Array.isArray(worker.routing.fallbackWorkerIds) || worker.routing.fallbackWorkerIds.length > 8) throw new TypeError(`Worker ${worker.id} fallbacks are invalid.`);
    worker.routing.fallbackWorkerIds.forEach((item) => slug(item, "fallback worker id"));
    if (worker.adapter !== undefined) validateAdapter(worker.adapter, worker.id);
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
function validRoutingValue(value) { return typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value); }
function validateAdapter(adapter, workerId) {
  if (!isRecord(adapter)) {
    throw new TypeError(`Worker ${workerId} adapter is invalid.`);
  }
  if (workerId === "primary-codex-builder") return validateCodexBuilderAdapter(adapter);
  if (workerId === "workspace-agent-cloud") return validateWorkspaceAgentAdapter(adapter);
  if (workerId === "microsoft365") return validateMicrosoft365Adapter(adapter);
  if (workerId !== "github-copilot" || adapter.kind !== "github-copilot-cli" || adapter.executable !== "copilot") throw new TypeError(`Worker ${workerId} adapter is invalid.`);
  if (adapter.workingDirectory !== "." || adapter.remoteSession !== false || adapter.remoteExport !== false || adapter.disableBuiltinMcps !== true || adapter.disallowTempDir !== true) {
    throw new TypeError("Copilot adapter boundary is invalid.");
  }
  if (!Array.isArray(adapter.allowedPaths) || adapter.allowedPaths.length < 1 || adapter.allowedPaths.length > 16 || adapter.allowedPaths.some((item) => typeof item !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,119}$/.test(item) || item.includes("..") || item.startsWith("/"))) {
    throw new TypeError("Copilot adapter paths are invalid.");
  }
  const allowedTools = new Set(["read", "search", "write", "shell(git status)", "shell(git diff)", "shell(git add)", "shell(git commit)", "shell(npm run verify)", "shell(npm test)"]);
  if (!Array.isArray(adapter.allowedTools) || adapter.allowedTools.length < 1 || adapter.allowedTools.length > allowedTools.size || new Set(adapter.allowedTools).size !== adapter.allowedTools.length || adapter.allowedTools.some((item) => !allowedTools.has(item))) {
    throw new TypeError("Copilot adapter tools are invalid.");
  }
  integer(adapter.maxOutputBytes, 1024, 131072, "Copilot adapter output limit");
}
function validateCodexBuilderAdapter(adapter) {
  if (adapter.kind !== "codex-cli-builder" || adapter.executable !== "user-codex-cli" || adapter.workingDirectory !== "candidate-worktree" || adapter.taskScoped !== true || adapter.interactiveAuthority !== false || adapter.directExecutionEnabled !== true || adapter.apiKeyRequired !== false || adapter.sandbox !== "workspace-write" || adapter.approvalPolicy !== "never" || adapter.networkAccess !== false || adapter.ephemeral !== true || adapter.ignoreUserConfig !== true) {
    throw new TypeError("Codex Builder adapter boundary is invalid.");
  }
  integer(adapter.maximumPromptBytes, 1024, 32768, "Codex Builder prompt limit");
  integer(adapter.maximumEventBytes, 32768, 1048576, "Codex Builder event limit");
  integer(adapter.executionTimeoutMs, 30000, 900000, "Codex Builder execution timeout");
}
function validateMicrosoft365Adapter(adapter) {
  const exactHosts = ["sharepoint.com", "microsoft365.com", "office.com", "outlook.office.com", "teams.microsoft.com", "onedrive.live.com", "1drv.ms"];
  if (adapter.kind !== "microsoft365-signed-app" || adapter.attendedSessionRequired !== true || adapter.directGraphAuthentication !== false || !Array.isArray(adapter.allowedHostSuffixes) || adapter.allowedHostSuffixes.join("|") !== exactHosts.join("|")) {
    throw new TypeError("Microsoft 365 adapter boundary is invalid.");
  }
}
function validateWorkspaceAgentAdapter(adapter) {
  if (adapter.kind !== "chatgpt-workspace-agent" || adapter.apiOrigin !== "https://api.chatgpt.com" || adapter.credentialClass !== "workspace-agent-access-token" || adapter.platformApiKeyAccepted !== false || adapter.chatGptSubscriptionAuthenticationAccepted !== false || adapter.accessTokenEnvironmentVariable !== "AGENT_ACCESS_TOKEN" || adapter.triggerIdEnvironmentVariable !== "WORKSPACE_AGENT_TRIGGER_ID" || adapter.repository !== "https://github.com/michaeljwilliams0123/mahoraga.git" || adapter.assignmentDirectory !== "coordination/assignments" || adapter.resultDirectory !== "coordination/results" || adapter.branchPrefix !== "secondary/" || adapter.responseRetrieval !== false || adapter.runStatusBeta !== true || adapter.statusMetadataOnly !== true) {
    throw new TypeError("Workspace Agent adapter boundary is invalid.");
  }
  for (const field of ["accessTokenEnvironmentVariable", "triggerIdEnvironmentVariable"]) {
    if (typeof adapter[field] !== "string" || !/^[A-Z][A-Z0-9_]{2,63}$/.test(adapter[field])) throw new TypeError("Workspace Agent credential binding is invalid.");
  }
  integer(adapter.maximumInputBytes, 1024, 16384, "Workspace Agent input limit");
  integer(adapter.requestTimeoutMs, 1000, 120000, "Workspace Agent request timeout");
}
function validateTruthContracts(contracts) {
  if (!isRecord(contracts) || !isRecord(contracts.controlSession) || !isRecord(contracts.capabilityReadiness) || !isRecord(contracts.contentVault) || !isRecord(contracts.executionCells) || !isRecord(contracts.receipts)) throw new TypeError("Truth contracts are missing.");
  if (contracts.controlSession.idleTtlMs !== 28_800_000 || contracts.controlSession.bootstrapNonceTtlMs !== 30_000) throw new TypeError("Control session contract is invalid.");
  if (contracts.capabilityReadiness.deterministicReadCanaryTtlMs !== 86_400_000 || contracts.capabilityReadiness.writeCanaryTtlMs !== 900_000) throw new TypeError("Capability readiness contract is invalid.");
  if (contracts.contentVault.root !== "state/content-vault") throw new TypeError("Content vault root is invalid.");
  if (contracts.executionCells.root !== "state/execution-cells/codex") throw new TypeError("Execution cell root is invalid.");
  if (contracts.receipts.schemaVersion !== 1) throw new TypeError("Receipt schema contract is invalid.");
  for (const root of [contracts.contentVault.root, contracts.executionCells.root]) {
    if (!/^state\/[a-z0-9._/-]+$/i.test(root) || root.includes("..")) throw new TypeError("Truth contract root must stay inside state/.");
  }
}

function validateBrowserPolicy(browser) {
  if (!isRecord(browser)) throw new TypeError("Browser policy is missing.");
  if (browser.controlCenterUrl !== "http://127.0.0.1:4782/") throw new TypeError("Browser policy must remain loopback-only.");
  for (const field of ["profileDirectory", "artifactDirectory"]) {
    if (!/^state\/[a-z0-9._/-]+$/i.test(browser[field]) || browser[field].includes("..")) throw new TypeError(`Browser ${field} is invalid.`);
  }
  integer(browser.artifactRetentionMs, 60000, 7 * 24 * 60 * 60 * 1000, "Browser artifact retention");
  if (browser.signedSessionEnabled !== false) throw new TypeError("Signed browser session must remain disabled pending user approval.");
}
function validateMcpProviders(providers) {
  if (!Array.isArray(providers) || providers.length > 32) throw new TypeError("MCP provider registry is invalid.");
  const ids = new Set();
  const fields = new Set(["id", "enabled", "transportKind", "executableIdentity", "toolAllowlist", "resourceAllowlist", "dataClasses", "permissionClass", "spendingClass", "credentialReference", "readinessProbe", "canary", "maximumRequestBytes", "maximumResponseBytes", "timeoutMs"]);
  for (const provider of providers) {
    if (!isRecord(provider) || Object.keys(provider).length !== fields.size || Object.keys(provider).some((key) => !fields.has(key))) throw new TypeError("MCP provider fields are invalid.");
    slug(provider.id, "MCP provider id"); if (ids.has(provider.id)) throw new TypeError("MCP provider ID is duplicated."); ids.add(provider.id);
    if (typeof provider.enabled !== "boolean" || provider.transportKind !== "local-process") throw new TypeError("MCP provider transport is invalid.");
    if (typeof provider.executableIdentity !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/.test(provider.executableIdentity)) throw new TypeError("MCP executable identity is invalid.");
    for (const [field, maximum] of [["toolAllowlist", 64], ["resourceAllowlist", 64]]) {
      if (!Array.isArray(provider[field]) || provider[field].length > maximum || new Set(provider[field]).size !== provider[field].length || provider[field].some((item) => typeof item !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/.test(item))) throw new TypeError(`MCP provider ${field} is invalid.`);
    }
    if (!Array.isArray(provider.dataClasses) || provider.dataClasses.length < 1 || provider.dataClasses.some((item) => !DATA_CLASSES.has(item))) throw new TypeError("MCP provider data classes are invalid.");
    slug(provider.permissionClass, "MCP permission class"); if (!COST_CLASSES.has(provider.spendingClass)) throw new TypeError("MCP spending class is invalid.");
    if (typeof provider.credentialReference !== "string" || !/^(?:env|os-keychain|secret-store):[A-Z][A-Z0-9_]{2,63}$/.test(provider.credentialReference)) throw new TypeError("MCP credential reference is invalid.");
    if (!provider.toolAllowlist.includes(provider.readinessProbe) || !provider.toolAllowlist.includes(provider.canary)) throw new TypeError("MCP provider probes are invalid.");
    integer(provider.maximumRequestBytes, 256, 1048576, "MCP request limit"); integer(provider.maximumResponseBytes, 256, 4194304, "MCP response limit"); integer(provider.timeoutMs, 100, 300000, "MCP timeout");
  }
}
function validateExecutionBudgets(value) {
  if (!isRecord(value)) throw new TypeError("Execution budgets are missing.");
  integer(value.maximumDepth, 0, 32, "execution maximumDepth");
  integer(value.maximumChildWorkers, 0, 16, "execution maximumChildWorkers");
  integer(value.maximumCycles, 1, 10000, "execution maximumCycles");
  integer(value.maximumTokens, 1, 10000000, "execution maximumTokens");
  if (!COST_CLASSES.has(value.spendingClass)) throw new TypeError("Execution spending class is invalid.");
  for (const field of ["inheritedDenyRules", "childAllowRules"]) {
    if (!Array.isArray(value[field]) || value[field].length > 64 || new Set(value[field]).size !== value[field].length || value[field].some((rule) => typeof rule !== "string" || !/^[a-z][a-z0-9-]{0,31}\.[a-z][a-z0-9-]{0,31}$/.test(rule))) throw new TypeError(`Execution ${field} is invalid.`);
  }
  if (value.childAllowRules.some((rule) => value.inheritedDenyRules.includes(rule))) throw new TypeError("Execution rules conflict.");
}
function validateObservationMemory(value) {
  if (!isRecord(value)) throw new TypeError("Observation memory is missing.");
  integer(value.rawTurnLimit, 0, 1000, "observation rawTurnLimit");
  integer(value.observationLimit, 0, 10000, "observation observationLimit");
  integer(value.maximumBytes, 512, 16777216, "observation maximumBytes");
}
function integer(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) throw new TypeError(`${name} is invalid.`);
}
