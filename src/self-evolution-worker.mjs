import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { executeSelfExtensionCapability } from "./self-extension-worker.mjs";
import { createGitHubNativeCandidatePublisher } from "./sovereign-candidate-producer.mjs";

const EVOLUTION_CAPABILITIES = new Set(["self.patch", "self.enhance"]);
const PATCH_TYPES = new Set(["REFACTOR", "OPTIMIZATION", "REPAIR"]);
const MODIFICATION_ACTIONS = new Set(["REPLACE", "PREPEND", "APPEND"]);
const DEFAULT_EVOLUTION_SETTINGS = Object.freeze({
  defaultLineChangeLimit: 100,
  maxLineChangeThreshold: 300,
  targetDirectories: ["src"],
  enforceStrictSchemaMatch: true,
});

export function loadEvolutionEnvelope({
  repositoryRoot = process.cwd(),
  envelopePath = path.join(repositoryRoot, "config", "autonomy-envelope.json"),
  environment = process.env,
} = {}) {
  let parsed = {};
  if (fs.existsSync(envelopePath)) parsed = JSON.parse(fs.readFileSync(envelopePath, "utf8"));
  const configured = parsed.evolutionSettings ?? {};
  const hardLimit = positiveInteger(configured.maxLineChangeThreshold, DEFAULT_EVOLUTION_SETTINGS.maxLineChangeThreshold);
  const defaultLimit = positiveInteger(configured.defaultLineChangeLimit, DEFAULT_EVOLUTION_SETTINGS.defaultLineChangeLimit);
  const requestedLimit = environment.MAHORAGA_MAX_LINE_CHANGES === undefined
    ? defaultLimit
    : positiveInteger(Number(environment.MAHORAGA_MAX_LINE_CHANGES), NaN);
  if (!Number.isSafeInteger(requestedLimit)) fail("self-evolution-line-limit-invalid");
  const activeLineChangeLimit = Math.min(requestedLimit, hardLimit);
  const targetDirectories = normalizeTargetDirectories(configured.targetDirectories ?? DEFAULT_EVOLUTION_SETTINGS.targetDirectories);
  const payloadMappingSchema = parsed.payloadMappingSchema;
  if (!payloadMappingSchema || typeof payloadMappingSchema !== "object" || Array.isArray(payloadMappingSchema)) {
    fail("self-evolution-schema-invalid");
  }
  return Object.freeze({
    evolutionSettings: Object.freeze({
      defaultLineChangeLimit: defaultLimit,
      maxLineChangeThreshold: hardLimit,
      activeLineChangeLimit,
      targetDirectories: Object.freeze(targetDirectories),
      enforceStrictSchemaMatch: configured.enforceStrictSchemaMatch !== false,
    }),
    payloadMappingSchema: Object.freeze(structuredClone(payloadMappingSchema)),
  });
}

export function createEvolutionModelInstruction(envelope) {
  if (!envelope?.payloadMappingSchema) fail("self-evolution-schema-invalid");
  return [
    "Produce one bounded Mahoraga evolution payload.",
    "Return JSON only, without markdown or commentary.",
    "The response must satisfy this JSON Schema:",
    JSON.stringify(envelope.payloadMappingSchema, null, 2),
  ].join("\n");
}

export function calculatePayloadLineChanges(payload) {
  if (!Array.isArray(payload?.modifications)) return 0;
  return payload.modifications.reduce((total, modification) => {
    if (typeof modification?.content !== "string" || modification.content.length === 0) return total;
    return total + modification.content.split(/\r\n|\r|\n/).length;
  }, 0);
}

export function validateEvolutionPayload(payload, envelope) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("self-evolution-payload-invalid");
  const settings = envelope?.evolutionSettings;
  if (!settings) fail("self-evolution-envelope-invalid");
  const allowedRootKeys = new Set(["componentTarget", "patchType", "modifications"]);
  if (settings.enforceStrictSchemaMatch && !hasOnlyKeys(payload, allowedRootKeys)) fail("self-evolution-payload-schema-mismatch");
  if (typeof payload.componentTarget !== "string" || !isAllowedComponentTarget(payload.componentTarget, settings.targetDirectories)) {
    fail("self-evolution-target-outside-envelope");
  }
  if (!PATCH_TYPES.has(payload.patchType)) fail("self-evolution-patch-type-invalid");
  if (!Array.isArray(payload.modifications) || payload.modifications.length < 1 || payload.modifications.length > 128) {
    fail("self-evolution-modifications-invalid");
  }
  for (const modification of payload.modifications) validateModification(modification, settings.enforceStrictSchemaMatch);
  const lineChanges = calculatePayloadLineChanges(payload);
  if (lineChanges > settings.activeLineChangeLimit || lineChanges > settings.maxLineChangeThreshold) {
    fail("self-evolution-line-change-limit-exceeded");
  }
  return Object.freeze({
    componentTarget: payload.componentTarget,
    patchType: payload.patchType,
    lineChanges,
    activeLineChangeLimit: settings.activeLineChangeLimit,
    hardLineChangeThreshold: settings.maxLineChangeThreshold,
  });
}

export async function executeSelfEvolutionCapability(capability, task, worker, dependencies = {}) {
  if (capability !== "self.evolve") fail("unsupported-capability");
  if (!task || typeof task !== "object" || Array.isArray(task)) fail("self-evolution-task-invalid");
  const evolutionCapability = resolveEvolutionCapability(task);
  const envelope = dependencies.evolutionEnvelope
    ?? loadEvolutionEnvelope({ repositoryRoot: dependencies.repositoryRoot, environment: dependencies.environment });
  const payloadValidation = task.evolutionPayload === undefined
    ? null
    : validateEvolutionPayload(task.evolutionPayload, envelope);
  const extensionTask = { ...task };
  delete extensionTask.evolutionCapability;
  const executeExtension = dependencies.executeSelfExtension
    ?? ((nextCapability, nextTask, nextWorker) => executeSelfExtensionCapability(nextCapability, nextTask, nextWorker, dependencies.extensionDependencies ?? dependencies));
  const candidate = await executeExtension(evolutionCapability, extensionTask, worker);
  const evidence = validateContainedCandidate(candidate, extensionTask);

  const branchName = evolutionBranch(extensionTask, evidence);
  const publishCandidate = dependencies.publishCandidate
    ?? createGitHubNativeCandidatePublisher({
      root: dependencies.repositoryRoot,
      runCommand: dependencies.runCommand,
    });
  const publication = await publishCandidate({
    baseSha: evidence.baseCommit,
    headSha: evidence.headCommit,
    branchName,
    changedFiles: evidence.changedPaths,
    title: "feat: publish Mahoraga self-evolution candidate",
    summary: "Mahoraga self-evolution candidate produced from an objective-scoped contained execution cell.",
  });
  validatePublication(publication, { baseSha: evidence.baseCommit, headSha: evidence.headCommit, branchName });

  return {
    ...candidate,
    verified: true,
    summary: `Mahoraga published contained self-evolution candidate ${evidence.headCommit.slice(0, 12)} for exact-head verification.`,
    selfEvolution: Object.freeze({
      schemaVersion: 1,
      evolutionCapability,
      baseSha: publication.baseSha,
      headSha: publication.headSha,
      branch: publication.branch,
      pullRequestNumber: publication.pullRequestNumber,
      changedFilesDigest: publication.changedFilesDigest,
      ...(payloadValidation === null ? {} : { payloadValidation }),
    }),
  };
}
function resolveEvolutionCapability(task) {
  if (task.evolutionCapability !== undefined && task.evolutionCapability !== null) {
    if (!EVOLUTION_CAPABILITIES.has(task.evolutionCapability)) fail("self-evolution-capability-invalid");
    return task.evolutionCapability;
  }
  const outcome = String(task.requestedOutcome ?? "");
  return /\b(?:fix|patch|repair|bug|defect|regression)\b/i.test(outcome) ? "self.patch" : "self.enhance";
}
function validateContainedCandidate(candidate, task) {
  const evidence = candidate?.providerReceipt;
  if (candidate?.verified !== true || !evidence || typeof evidence !== "object" || Array.isArray(evidence)) fail("self-evolution-candidate-unverified");
  if (evidence.executionMode !== "candidate-worktree" || evidence.validationState !== "passed" || evidence.quarantineState !== "clear") {
    fail("self-evolution-candidate-unverified");
  }
  if (evidence.networkAccess !== false || evidence.ephemeral !== true || evidence.finalResponseStored !== false) {
    fail("self-evolution-containment-invalid");
  }
  if (evidence.baseCommit !== task.baseCommit || !/^[a-f0-9]{40}$/.test(evidence.baseCommit ?? "")) {
    fail("self-evolution-base-mismatch");
  }
  if (!/^[a-f0-9]{40}$/.test(evidence.headCommit ?? "") || evidence.headCommit === evidence.baseCommit) {
    fail("self-evolution-head-invalid");
  }
  if (!Array.isArray(evidence.changedPaths) || evidence.changedPaths.length < 1 || evidence.changedPaths.length > 16) {
    fail("self-evolution-changed-paths-invalid");
  }
  if (!Array.isArray(task.allowedPaths) || evidence.changedPaths.some((changed) => !task.allowedPaths.some((allowed) => changed === allowed || changed.startsWith(`${allowed}/`)))) {
    fail("self-evolution-path-outside-authority");
  }
  return evidence;
}
function evolutionBranch(task, evidence) {
  const seed = `${task.id ?? "self-evolution"}:${evidence.baseCommit}:${evidence.headCommit}`;
  const suffix = createHash("sha256").update(seed).digest("hex").slice(0, 24);
  return `feature/sovereign-evolution-${suffix}`;
}

function validatePublication(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("self-evolution-publication-invalid");
  if (value.baseSha !== expected.baseSha || value.headSha !== expected.headSha || value.branch !== expected.branchName) {
    fail("self-evolution-publication-mismatch");
  }
  if (!Number.isSafeInteger(value.pullRequestNumber) || value.pullRequestNumber < 1) fail("self-evolution-publication-invalid");
  if (!/^[a-f0-9]{64}$/.test(value.changedFilesDigest ?? "")) fail("self-evolution-publication-invalid");
}

function validateModification(value, strict) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("self-evolution-modification-invalid");
  if (strict && !hasOnlyKeys(value, new Set(["action", "targetLineStart", "targetLineEnd", "content"]))) {
    fail("self-evolution-payload-schema-mismatch");
  }
  if (!MODIFICATION_ACTIONS.has(value.action) || typeof value.content !== "string") fail("self-evolution-modification-invalid");
  const hasStart = value.targetLineStart !== undefined;
  const hasEnd = value.targetLineEnd !== undefined;
  if (value.action === "REPLACE" && (!hasStart || !hasEnd)) fail("self-evolution-line-range-required");
  if ((hasStart && (!Number.isSafeInteger(value.targetLineStart) || value.targetLineStart < 1))
    || (hasEnd && (!Number.isSafeInteger(value.targetLineEnd) || value.targetLineEnd < 1))
    || (hasStart && hasEnd && value.targetLineEnd < value.targetLineStart)) {
    fail("self-evolution-line-range-invalid");
  }
}

function isAllowedComponentTarget(value, targetDirectories) {
  if (value.includes("\\") || path.posix.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value);
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) return false;
  return targetDirectories.some((directory) => normalized === directory || normalized.startsWith(`${directory}/`));
}

function normalizeTargetDirectories(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) fail("self-evolution-target-directories-invalid");
  const normalized = value.map((entry) => {
    if (typeof entry !== "string" || !entry.trim()) fail("self-evolution-target-directories-invalid");
    const candidate = path.posix.normalize(entry.trim().replaceAll("\\", "/")).replace(/\/$/, "");
    if (candidate === "." || candidate.startsWith("../") || path.posix.isAbsolute(candidate)) fail("self-evolution-target-directories-invalid");
    return candidate;
  });
  return [...new Set(normalized)];
}

function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
