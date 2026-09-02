import path from "node:path";
import { inspectGeneratedExtension } from "./generated-code-safety.mjs";

const TERMINAL_STATES = new Set(["activated", "failed", "rolled-back"]);

export function createEvolutionController({ database, repository, verifier, deployer, updater, safetyInspector = inspectGeneratedExtension }) {
  if (!database || typeof database.createEvolutionCandidate !== "function" || typeof database.updateEvolutionCandidate !== "function") fail("evolution-database-invalid");
  adapter(repository, ["build"], "evolution-repository-invalid");
  adapter(verifier, ["verify"], "evolution-verifier-invalid");
  adapter(deployer, ["deploy", "canary"], "evolution-deployer-invalid");
  adapter(updater, ["activate", "rollback"], "evolution-updater-invalid");
  if (typeof safetyInspector !== "function") fail("evolution-safety-inspector-invalid");

  return Object.freeze({
    request(input) {
      validateRequest(input);
      if (path.resolve(input.candidateRoot) === path.resolve(input.activeRoot)) fail("candidate-active-root-forbidden");
      return database.createEvolutionCandidate({
        conversationId: input.conversationId,
        requestSha256: input.requestSha256.toLowerCase(),
        baseSha: input.baseSha.toLowerCase(),
        branch: input.branch,
        allowedPaths: normalizePaths(input.allowedPaths),
      });
    },
    async advance(id) {
      const candidate = requireCandidate(database, id);
      if (TERMINAL_STATES.has(candidate.state)) return candidate;
      try {
        if (candidate.state === "planned") {
          const result = await repository.build({
            candidateId: candidate.id, baseSha: candidate.baseSha, branch: candidate.branch, allowedPaths: candidate.allowedPaths,
            args: ["build", "--base", candidate.baseSha, "--branch", candidate.branch],
          });
          inspectGeneratedExtensions(result, safetyInspector);
          sha(result?.headSha, "candidate-head-invalid");
          if (result.headSha === candidate.baseSha) fail("candidate-head-unchanged");
          const changedPaths = normalizePaths(result.changedPaths);
          if (changedPaths.length < 1 || changedPaths.some((changed) => !pathAllowed(changed, candidate.allowedPaths))) fail("candidate-path-forbidden");
          return database.updateEvolutionCandidate(id, { state: "candidate-created", headSha: result.headSha.toLowerCase() });
        }
        if (candidate.state === "candidate-created") {
          const result = await verifier.verify({ candidateId: id, baseSha: candidate.baseSha, headSha: candidate.headSha, args: ["verify", "--head", candidate.headSha] });
          if (result?.headSha !== candidate.headSha) fail("verification-head-mismatch");
          if (result?.conclusion !== "success") fail("verification-not-successful");
          identifier(result.workflowId, "verification-workflow-invalid");
          if (!Number.isSafeInteger(result.pullRequestNumber) || result.pullRequestNumber < 1) fail("pull-request-invalid");
          return database.updateEvolutionCandidate(id, { state: "verified", workflowId: result.workflowId, pullRequestNumber: result.pullRequestNumber });
        }
        if (candidate.state === "verified") {
          const result = await deployer.deploy({ candidateId: id, headSha: candidate.headSha, pullRequestNumber: candidate.pullRequestNumber, args: ["deploy", "--head", candidate.headSha] });
          if (result?.immutable !== true) fail("artifact-not-immutable");
          identifier(result.artifactId, "artifact-id-invalid"); sha64(result.artifactSha256, "artifact-digest-invalid"); identifier(result.deploymentId, "deployment-id-invalid");
          return database.updateEvolutionCandidate(id, { state: "deployed", artifactId: result.artifactId, artifactSha256: result.artifactSha256, deploymentId: result.deploymentId });
        }
        if (candidate.state === "deployed") {
          const result = await deployer.canary({ candidateId: id, headSha: candidate.headSha, artifactId: candidate.artifactId, artifactSha256: candidate.artifactSha256, args: ["canary", "--artifact", candidate.artifactId] });
          identifier(result?.canaryId, "canary-id-invalid");
          if (result.state !== "passed") {
            database.updateEvolutionCandidate(id, { canaryId: result.canaryId });
            fail("canary-failed");
          }
          return database.updateEvolutionCandidate(id, { state: "canary-passed", canaryId: result.canaryId });
        }
        if (candidate.state === "canary-passed") {
          const result = await updater.activate({ candidateId: id, headSha: candidate.headSha, artifactId: candidate.artifactId, artifactSha256: candidate.artifactSha256, canaryId: candidate.canaryId, args: ["activate", "--artifact", candidate.artifactId, "--head", candidate.headSha] });
          if (result?.activated !== true) fail("activation-failed");
          identifier(result.activationId, "activation-id-invalid");
          return database.updateEvolutionCandidate(id, { state: "activated", activationId: result.activationId });
        }
        fail("evolution-state-invalid");
      } catch (error) {
        const code = publicCode(error);
        const latest = requireCandidate(database, id);
        if (new Set(["deployed", "canary-passed"]).has(latest.state)) {
          try {
            const rollback = await updater.rollback({ candidateId: id, headSha: latest.headSha, artifactId: latest.artifactId, reasonCode: code, args: ["rollback", "--artifact", latest.artifactId] });
            if (rollback?.rolledBack !== true) fail("rollback-failed");
            identifier(rollback.rollbackId, "rollback-id-invalid");
            database.updateEvolutionCandidate(id, { state: "rolled-back", rollbackId: rollback.rollbackId, lastErrorCode: code });
          } catch (rollbackError) {
            database.updateEvolutionCandidate(id, { state: "failed", lastErrorCode: publicCode(rollbackError) });
          }
        } else {
          database.updateEvolutionCandidate(id, { state: "failed", lastErrorCode: code });
        }
        throw error;
      }
    },
    status(id) { return requireCandidate(database, id); },
    receipt(id) {
      const item = requireCandidate(database, id);
      return Object.freeze({
        schemaVersion: 1, candidateId: item.id, requestSha256: item.requestSha256, baseSha: item.baseSha, headSha: item.headSha,
        state: item.state, pullRequestNumber: item.pullRequestNumber, workflowId: item.workflowId, artifactId: item.artifactId,
        artifactSha256: item.artifactSha256, deploymentId: item.deploymentId, canaryId: item.canaryId,
        activationId: item.activationId, rollbackId: item.rollbackId, lastErrorCode: item.lastErrorCode,
      });
    },
  });
}

function inspectGeneratedExtensions(result, safetyInspector) {
  const extensions = result?.generatedExtensions ?? result?.extensions ?? [];
  if (!Array.isArray(extensions) || extensions.length > 32) fail("generated-extensions-invalid");
  const changedPaths = Array.isArray(result?.changedPaths) ? result.changedPaths : [];
  const generatedPaths = changedPaths.filter((value) => typeof value === "string" && /(?:^|\/)extensions\/[^/]+\.(?:mjs|js|py)$/.test(value));
  const declaredPaths = new Set(extensions.map((extension) => extension?.manifest?.entrypoint).filter((value) => typeof value === "string"));
  if (generatedPaths.some((value) => !declaredPaths.has(value)) || [...declaredPaths].some((value) => !changedPaths.includes(value))) fail("generated-extension-metadata-required");
  for (const extension of extensions) {
    if (!extension || typeof extension !== "object" || typeof extension.language !== "string" || typeof extension.source !== "string" || !extension.manifest) fail("generated-extension-invalid");
    const decision = safetyInspector({
      language: extension.language,
      source: extension.source,
      manifest: extension.manifest,
      candidateRoot: extension.candidateRoot ?? result.candidateRoot ?? path.resolve("."),
    });
    if (!decision || decision.safe !== true) fail("generated-extension-unsafe");
  }
}

function validateRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("evolution-request-invalid");
  identifier(value.conversationId, "evolution-conversation-invalid"); sha64(value.requestSha256, "evolution-request-digest-invalid"); sha(value.baseSha, "evolution-base-invalid");
  if (typeof value.branch !== "string" || !/^(?:codex|destiny|feature|upgrade)\/[A-Za-z0-9._/-]{1,180}$/.test(value.branch) || value.branch.includes("..")) fail("evolution-branch-invalid");
  normalizePaths(value.allowedPaths);
  for (const field of ["candidateRoot", "activeRoot"]) if (typeof value[field] !== "string" || !path.isAbsolute(value[field]) || path.resolve(value[field]) !== value[field]) fail("evolution-root-invalid");
}
function normalizePaths(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64 || new Set(value).size !== value.length) fail("candidate-path-invalid");
  return value.map((item) => { if (typeof item !== "string" || item.length < 1 || item.length > 240 || item.startsWith("/") || item.includes("\\") || item.split("/").some((part) => part === "" || part === "." || part === "..")) fail("candidate-path-invalid"); return item.replace(/\/$/, ""); }).sort();
}
function pathAllowed(candidate, allowed) { return allowed.some((root) => candidate === root || candidate.startsWith(`${root}/`)); }
function requireCandidate(database, id) { identifier(id, "evolution-candidate-id-invalid"); const item = database.getEvolutionCandidate(id); if (!item) fail("evolution-candidate-missing"); return item; }
function adapter(value, methods, code) { if (!value || methods.some((method) => typeof value[method] !== "function")) fail(code); }
function identifier(value, code) { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/.test(value)) fail(code); }
function sha(value, code) { if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) fail(code); }
function sha64(value, code) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(code); }
function publicCode(error) { return typeof error?.code === "string" && /^[a-z][a-z0-9:-]{0,79}$/.test(error.code) ? error.code : "evolution-adapter-failed"; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
