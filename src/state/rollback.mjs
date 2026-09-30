import path from "node:path";
import { spawn } from "node:child_process";

export function createEmergencyRollback({
  root,
  candidateStateDirectory,
  candidateWorktree = process.env.MAHORAGA_CANDIDATE_WORKTREE ?? "",
  candidateBaseSha = process.env.MAHORAGA_CANDIDATE_BASE_SHA ?? "",
  spawnImpl = spawn,
} = {}) {
  if (typeof root !== "string" || !root) throw new TypeError("rollback-root-required");
  if (typeof candidateStateDirectory !== "string" || !candidateStateDirectory) throw new TypeError("rollback-candidate-state-required");
  const scriptPath = path.join(root, "scripts", "emergency-rollback.ps1");

  return async ({ port = 4783, reason = "candidate-containment-canary-failed" } = {}) => {
    if (port !== 4783) throw new TypeError("rollback-candidate-port-required");
    const args = [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", scriptPath,
      "-CandidatePort", "4783",
      "-CandidateStateDirectory", candidateStateDirectory,
    ];
    if (candidateWorktree || candidateBaseSha) {
      if (!candidateWorktree || !candidateBaseSha) throw new TypeError("rollback-worktree-and-base-required-together");
      args.push("-CandidateWorktree", candidateWorktree, "-CandidateBaseSha", candidateBaseSha);
    }
    const child = spawnImpl("powershell.exe", args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, MAHORAGA_CONTAINMENT_REASON: String(reason) },
    });
    child.unref?.();
    return { requested: true, port: 4783, reason, pid: child.pid ?? null };
  };
}

const SHA_PATTERN = /^[0-9a-f]{40}$/;

export function createEvolutionRollback({ patchStore, deployBaseline, now = () => Date.now() } = {}) {
  if (!patchStore || typeof patchStore.recordPatch !== "function" || typeof patchStore.activePatch !== "function") {
    throw new TypeError("evolution-rollback-store-required");
  }
  if (typeof deployBaseline !== "function") throw new TypeError("evolution-rollback-deployer-required");
  return async ({ compromisedSha, reason = "live-runtime-threshold-exceeded" } = {}) => {
    if (typeof compromisedSha !== "string" || !SHA_PATTERN.test(compromisedSha)) throw new TypeError("evolution-rollback-sha-invalid");
    const active = patchStore.activePatch();
    if (!active || active.patchSha !== compromisedSha) throw new TypeError("evolution-rollback-active-patch-mismatch");
    if (!SHA_PATTERN.test(active.predecessorSha)) throw new TypeError("evolution-rollback-predecessor-invalid");
    const deployment = await deployBaseline({
      targetSha: active.predecessorSha,
      compromisedSha,
      reason,
    });
    if (!deployment || deployment.accepted !== true || deployment.targetSha !== active.predecessorSha) {
      throw new Error("evolution-rollback-deployment-unverified");
    }
    const record = patchStore.recordPatch({
      ...active,
      verificationStatus: "ROLLED_BACK",
      rollbackReason: String(reason),
      updatedAt: now(),
      isActive: false,
    });
    return Object.freeze({
      rolledBack: true,
      compromisedSha,
      restoredSha: active.predecessorSha,
      record,
    });
  };
}
