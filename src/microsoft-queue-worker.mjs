import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./config.mjs";

const DEFAULT_PYTHON = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");
const AUTH_DIAGNOSE_ARGS = Object.freeze([path.join("scripts", "auth.py"), "--diagnose"]);
const QUEUE_POLL_ARGS = Object.freeze([path.join("scripts", "microsoft_queue_worker.py")]);

export async function executeMicrosoftQueueCapability(capability, {
  readFileImpl = readFile,
  statImpl = stat,
  runPythonImpl = runPython,
} = {}) {
  if (capability === "queue.status") {
    const env = await readOptional(path.join(ROOT, ".env"), readFileImpl);
    const prefixReady = /^PUBLISHER_PREFIX=[a-z]{2,8}$/m.test(env);
    const dataverseUrlConfigured = /^DATAVERSE_URL=https:\/\/[a-z0-9-]+\.crm\.dynamics\.com\/?$/im.test(env);
    const tenantConfigured = /^TENANT_ID=[a-z0-9-]{8,80}$/im.test(env);
    const queueScriptReady = await exists(path.join(ROOT, "scripts", "microsoft_queue_worker.py"), statImpl);
    const authScriptReady = await exists(path.join(ROOT, "scripts", "auth.py"), statImpl);
    const scriptsReady = queueScriptReady && authScriptReady;
    const configurationReady = prefixReady && dataverseUrlConfigured && tenantConfigured && scriptsReady;

    let auth = Object.freeze({ silentAuthAvailable: false, diagnosis: "not-probed" });
    if (configurationReady) {
      try {
        const result = await runPythonImpl([...AUTH_DIAGNOSE_ARGS], 20000);
        auth = parseAuthDiagnosis(result.stdout);
      } catch {
        auth = Object.freeze({ silentAuthAvailable: false, diagnosis: "probe-unavailable" });
      }
    }

    const verified = configurationReady && auth.silentAuthAvailable;
    return {
      verified,
      summary: verified
        ? "Microsoft queue worker is ready for unattended authenticated polling through an existing silent Dataverse credential tier."
        : configurationReady
          ? "Microsoft queue worker configuration is present, but unattended polling is blocked until a silent Dataverse credential is available."
          : "Microsoft queue worker is awaiting its bounded Dataverse configuration or runtime scripts.",
      prefixReady,
      scriptsReady,
      receiptMetadata: {
        prefixReady,
        dataverseUrlConfigured,
        tenantConfigured,
        queueScriptReady,
        authScriptReady,
        silentAuthAvailable: auth.silentAuthAvailable,
        authDiagnosis: auth.diagnosis,
      },
    };
  }

  if (capability === "queue.poll") {
    const result = await runPythonImpl([...QUEUE_POLL_ARGS], 55000);
    const receipt = sanitizeQueuePollReceipt(parseJsonLine(result.stdout, "microsoft-queue-invalid-receipt"));
    return {
      verified: receipt.verified,
      summary: `Microsoft queue poll verified: ${receipt.claimed} claimed, ${receipt.completed} completed, ${receipt.requeued} requeued.`,
      receiptMetadata: receipt,
    };
  }

  throw new Error("unsupported-capability");
}

export function parseAuthDiagnosis(source) {
  const text = String(source ?? "").replaceAll("\r\n", "\n");
  if (/Result: a silent tier is available -- normal calls will not prompt\./.test(text)) {
    return Object.freeze({ silentAuthAvailable: true, diagnosis: "silent-tier-available" });
  }
  if (/Result: no silent tier -- the next call uses the '.+' interactive tier\./.test(text)) {
    return Object.freeze({ silentAuthAvailable: false, diagnosis: "interactive-required" });
  }
  return Object.freeze({ silentAuthAvailable: false, diagnosis: "indeterminate" });
}

export function sanitizeQueuePollReceipt(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.verified !== true || value.relay !== "primary-windows") {
    throw new Error("microsoft-queue-invalid-receipt");
  }
  return Object.freeze({
    verified: true,
    claimed: boundedCount(value.claimed),
    completed: boundedCount(value.completed),
    requeued: boundedCount(value.requeued),
    relay: "primary-windows",
  });
}

function runPython(args, timeoutMs) {
  const executable = process.env.MAHORAGA_PYTHON_PATH || DEFAULT_PYTHON;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: ROOT,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = ""; let stderr = ""; let settled = false;
    const timer = setTimeout(() => { child.kill(); reject(new Error("microsoft-queue-timeout")); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-16000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.once("error", (error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    child.once("exit", (code) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (code !== 0) return reject(new Error(`microsoft-queue-failed:${safeError(stderr)}`));
      resolve({ stdout, stderr });
    });
  });
}

async function readOptional(file, reader) {
  try { return await reader(file, "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return ""; throw error; }
}

async function exists(file, statImpl) {
  try { return (await statImpl(file)).isFile(); }
  catch { return false; }
}

function parseJsonLine(source, errorCode) {
  const line = String(source ?? "").trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!line || line.length > 8192) throw new Error(errorCode);
  try { return JSON.parse(line); }
  catch { throw new Error(errorCode); }
}

function boundedCount(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100000) throw new Error("microsoft-queue-invalid-receipt");
  return number;
}

function safeError(value) {
  return String(value ?? "unknown")
    .replace(/[\r\n\0]+/g, " ")
    .replace(/(?:bearer|token|secret|password|client_secret)\s*[:=]\s*\S+/gi, "credential=[redacted]")
    .trim()
    .slice(-240) || "unknown";
}
