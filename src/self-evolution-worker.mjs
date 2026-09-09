import { createHash } from "node:crypto";
import { executeSelfExtensionCapability } from "./self-extension-worker.mjs";
import { createGitHubNativeCandidatePublisher } from "./sovereign-candidate-producer.mjs";

const EVOLUTION_CAPABILITIES = new Set(["self.patch", "self.enhance"]);

export async function executeSelfEvolutionCapability(capability, task, worker, dependencies = {}) {
  if (capability !== "self.evolve") fail("unsupported-capability");
  if (!task || typeof task !== "object" || Array.isArray(task)) fail("self-evolution-task-invalid");
  const evolutionCapability = resolveEvolutionCapability(task);
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

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
