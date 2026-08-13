import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config.mjs";

const GIT = process.env.MAHORAGA_GIT_EXECUTABLE || "git";
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

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
  if (capability === "repository.verify") {
    const result = await run(NPM, ["run", "verify"], 120000, ROOT);
    return { verified: true, summary: tail(result.stdout, 1800) || "Repository verification passed.", exitCode: result.exitCode };
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
