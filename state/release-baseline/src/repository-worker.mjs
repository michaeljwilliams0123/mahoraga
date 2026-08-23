import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config.mjs";
import { validateManifest } from "./config.mjs";

const GIT = process.env.MAHORAGA_GIT_EXECUTABLE || "git";

export async function executeRepositoryCapability(capability, task = {}) {
  if (capability === "repository.inspect") {
    const packageJson = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
    const info = await stat(ROOT);
    return { verified: info.isDirectory(), summary: `Repository ${packageJson.name} is readable and self-contained.`, version: packageJson.version, directory: info.isDirectory() };
  }
  if (capability === "repository.status") {
    const result = await run(GIT, ["-C", ROOT, "status", "--short", "--branch"], 15000);
    return { verified: true, summary: result.stdout.trim() || "Repository is clean.", exitCode: result.exitCode };
  }
  if (capability === "repository.history") {
    const result = await run(GIT, ["-C", ROOT, "log", "-5", "--date=iso-strict", "--pretty=format:%h %ad %s"], 15000);
    return { verified: true, summary: result.stdout.trim() || "Repository has no commits yet.", exitCode: result.exitCode };
  }
  if (capability === "repository.remote") {
    const [head, branch, remote, commit] = await Promise.all([
      run(GIT, ["-C", ROOT, "rev-parse", "HEAD"], 15000),
      run(GIT, ["-C", ROOT, "branch", "--show-current"], 15000),
      run(GIT, ["-C", ROOT, "remote", "-v"], 15000),
      run(GIT, ["-C", ROOT, "log", "-1", "--pretty=format:%H%x00%s"], 15000),
    ]);
    const remotes = remote.stdout.trim() ? remote.stdout.trim().split(/\r?\n/) : [];
    const [commitId, subject = ""] = commit.stdout.split("\u0000");
    const attribution = subject.match(/^\[(PRIMARY|COPILOT|SECONDARY)\]/)?.[1] ?? "UNATTRIBUTED";
    let remoteHeads = {};
    if (remotes.length) {
      const remoteState = await run(GIT, ["-C", ROOT, "ls-remote", "--heads", "origin"], 30000);
      remoteHeads = Object.fromEntries(remoteState.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => { const [sha, ref] = line.split(/\s+/); return [ref, sha]; }));
    }
    const localHead = head.stdout.trim(); const mainHead = remoteHeads["refs/heads/main"] ?? null;
    const sync = mainHead === null ? "unpublished" : mainHead === localHead ? "synchronized" : "diverged-or-branch-specific";
    return { verified: true, summary: remotes.length ? `Repository remote state captured for ${branch.stdout.trim()}; main is ${sync}.` : `Repository ${branch.stdout.trim()} has no configured remote.`, head: localHead, branch: branch.stdout.trim(), remotes, remoteHeads, mainHead, sync, commit: { id: commitId, subject, attribution } };
  }
  if (capability === "repository.verify") {
    const secondary = secondaryValidationContext(task);
    if (secondary) return validateSecondaryReturn(secondary);
    const validation = await run(process.execPath, ["src/cli.mjs", "validate"], 30000, ROOT);
    const tests = await run(process.execPath, ["--test", "--test-isolation=none"], 120000, ROOT);
    return {
      verified: true,
      summary: singleLine(tail(`${validation.stdout}\n${tests.stdout}`, 1800)) || "Repository verification passed.",
      exitCode: tests.exitCode,
    };
  }
  if (capability === "repository.secondary-monitor") {
    const assignmentId = secondaryAssignmentId(task, "secondary-monitor");
    if (!assignmentId) throw new Error("secondary-assignment-missing");
    try {
      await run(GIT, ["-C", ROOT, "remote", "get-url", "origin"], 15000);
    } catch {
      return { verified: true, summary: `Secondary Codex mailbox ${assignmentId} remains READY: GitHub remote is not configured.`, secondaryMonitor: { assignmentId, remoteAvailable: false, returnCommit: null } };
    }
    const branch = `refs/heads/secondary/${assignmentId}`;
    const returned = await run(GIT, ["-C", ROOT, "ls-remote", "--heads", "origin", branch], 30000);
    const returnCommit = returned.stdout.trim().split(/\s+/)[0] || null;
    return { verified: true, summary: returnCommit ? `Secondary Codex return commit ${returnCommit.slice(0, 12)} detected for ${assignmentId}.` : `Secondary Codex mailbox ${assignmentId} remains READY; expected return branch has not appeared.`, secondaryMonitor: { assignmentId, remoteAvailable: true, returnCommit } };
  }
  throw new Error("unsupported-capability");
}

async function validateSecondaryReturn({ assignmentId, expectedBaseCommit, returnCommit }) {
  try {
    const remoteHead = await run(GIT, ["-C", ROOT, "ls-remote", "--heads", "origin", `refs/heads/secondary/${assignmentId}`], 30000);
    if (remoteHead.stdout.trim().split(/\s+/)[0]?.toLowerCase() !== returnCommit) throw new Error("secondary-return-head-changed");
    await run(GIT, ["-C", ROOT, "fetch", "--no-tags", "--no-write-fetch-head", "origin", `refs/heads/secondary/${assignmentId}`], 30000);
    await run(GIT, ["-C", ROOT, "cat-file", "-e", `${returnCommit}^{commit}`], 15000);
    await run(GIT, ["-C", ROOT, "merge-base", "--is-ancestor", expectedBaseCommit, returnCommit], 15000);
    await run(GIT, ["-C", ROOT, "diff", "--check", `${expectedBaseCommit}..${returnCommit}`], 30000);
    const changed = await run(GIT, ["-C", ROOT, "diff", "--name-only", `${expectedBaseCommit}..${returnCommit}`], 30000);
    const changedFiles = changed.stdout.split(/\r?\n/).filter(Boolean);
    if (changedFiles.length > 128) throw new Error("secondary-changed-file-limit-exceeded");
    const manifestSource = await run(GIT, ["-C", ROOT, "show", `${returnCommit}:mahoraga.manifest.json`], 30000);
    validateManifest(JSON.parse(manifestSource.stdout));
    return {
      verified: true,
      summary: `Secondary return ${returnCommit.slice(0, 12)} verified against base ${expectedBaseCommit.slice(0, 12)}; ${changedFiles.length} changed file(s).`,
      secondaryValidation: assignmentId,
      changedFiles: changedFiles.slice(0, 128),
    };
  } catch {
    return {
      verified: false,
      summary: `Secondary return ${returnCommit.slice(0, 12)} failed deterministic commit validation against base ${expectedBaseCommit.slice(0, 12)}.`,
      secondaryValidation: assignmentId,
    };
  }
}

export function secondaryValidationContext(task) {
  const match = String(task?.idempotencyKey ?? "").match(/^secondary-validate:(sec-[a-f0-9-]+):([a-f0-9]{7,64}):([a-f0-9]{7,64})$/i);
  return match ? { assignmentId: match[1], expectedBaseCommit: match[2].toLowerCase(), returnCommit: match[3].toLowerCase() } : null;
}

function secondaryAssignmentId(task, prefix) {
  const match = String(task?.idempotencyKey ?? "").match(new RegExp(`^${prefix}:(sec-[a-f0-9-]+):`));
  return match?.[1] ?? null;
}

function run(executable, args, timeoutMs, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let settled = false;
    const timer = setTimeout(() => { child.kill(); reject(new Error("repository-command-timeout")); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = tail(stdout + chunk, 8000); });
    child.stderr.on("data", (chunk) => { stderr = tail(stderr + chunk, 4000); });
    child.once("error", (error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    child.once("exit", (exitCode) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (exitCode !== 0) return reject(new Error(`repository-command-failed:${tail(stderr || stdout, 240)}`));
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function tail(value, limit) { return String(value).slice(-limit); }
function singleLine(value) { return String(value).replace(/\s+/g, " ").trim(); }
