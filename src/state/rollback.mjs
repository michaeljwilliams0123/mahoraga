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