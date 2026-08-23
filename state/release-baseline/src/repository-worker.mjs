import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config.mjs";

const GIT = process.env.MAHORAGA_GIT_EXECUTABLE || "git";

export async function executeRepositoryCapability(capability) {
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
    const validation = await run(process.execPath, ["src/cli.mjs", "validate"], 30000, ROOT);
    const tests = await run(process.execPath, ["--test", "--test-isolation=none"], 120000, ROOT);
    return {
      verified: true,
      summary: singleLine(tail(`${validation.stdout}\n${tests.stdout}`, 1800)) || "Repository verification passed.",
      exitCode: tests.exitCode,
    };
  }
  throw new Error("unsupported-capability");
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
