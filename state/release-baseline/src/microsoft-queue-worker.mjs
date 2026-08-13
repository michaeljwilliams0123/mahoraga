import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./config.mjs";

const DEFAULT_PYTHON = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");

export async function executeMicrosoftQueueCapability(capability) {
  if (capability === "queue.status") {
    const env = await readFile(path.join(ROOT, ".env"), "utf8");
    const prefixReady = /^PUBLISHER_PREFIX=[a-z]{2,8}$/m.test(env);
    const scriptsReady = await exists(path.join(ROOT, "scripts", "microsoft_queue_worker.py"));
    return {
      verified: prefixReady && scriptsReady,
      summary: prefixReady && scriptsReady
        ? "Microsoft queue worker configuration is ready for authenticated polling."
        : "Microsoft queue worker is awaiting publisher prefix or runtime scripts.",
      prefixReady,
      scriptsReady,
    };
  }
  if (capability === "queue.poll") {
    const result = await runPython([path.join("scripts", "microsoft_queue_worker.py")], 55000);
    const receipt = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
    return { ...receipt, summary: `Microsoft queue poll verified: ${receipt.claimed} claimed, ${receipt.completed} completed.` };
  }
  throw new Error("unsupported-capability");
}

function runPython(args, timeoutMs) {
  const executable = process.env.MAHORAGA_PYTHON_PATH || DEFAULT_PYTHON;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let settled = false;
    const timer = setTimeout(() => { child.kill(); reject(new Error("microsoft-queue-timeout")); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-8000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.once("error", (error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    child.once("exit", (code) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (code !== 0) return reject(new Error(`microsoft-queue-failed:${stderr.slice(-240)}`));
      resolve({ stdout, stderr });
    });
  });
}

async function exists(file) { try { return (await stat(file)).isFile(); } catch { return false; } }
