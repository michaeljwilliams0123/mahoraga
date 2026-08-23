import { spawn } from "node:child_process";
import { ROOT } from "./config.mjs";

const CODEX_COMMAND = "codex";

export function buildCodexBuilderEnvelope({ task, worker, session }) {
  if (worker?.id !== "primary-codex-builder" || worker?.adapter?.kind !== "codex-desktop-builder" || worker.adapter.executable !== CODEX_COMMAND) {
    throw new Error("codex-builder-adapter-not-configured");
  }
  const taskId = bounded(task?.id, 100, "task id");
  const correlationId = bounded(task?.correlationId, 120, "correlation id");
  const executionSessionId = bounded(session?.executionSessionId, 100, "execution session id");
  return Object.freeze({
    provider: "primary-codex-builder",
    taskId,
    correlationId,
    executionSessionId,
    authoritySessionId: session.authoritySessionId ?? null,
    executionMode: "task-scoped",
    interactiveAuthority: false,
    directExecutionEnabled: false,
    apiKeyRequired: false,
  });
}

export async function executeCodexBuilderCapability(capability, task, worker, { run = runCodexProbe } = {}) {
  if (capability === "codex.health") {
    const probe = await run();
    if (probe.errorCode === "EACCES" || /access is denied/i.test(probe.stderr ?? "")) {
      return { verified: false, summary: "Codex Desktop is installed, but its AppX executable is not directly callable from this worker (Access denied).", providerHealth: { availability: "unavailable", invocation: "desktop-appx-access-denied", authentication: "not-probed" } };
    }
    if (probe.errorCode || probe.exitCode !== 0) {
      return { verified: false, summary: `Codex Builder direct invocation is unavailable (${probe.errorCode ?? probe.exitCode ?? "probe-failed"}).`, providerHealth: { availability: "unavailable", invocation: "not-callable", authentication: "not-probed" } };
    }
    return { verified: false, summary: "Codex command responded, but direct task-scoped Builder execution remains disabled pending a supported local invocation contract.", providerHealth: { availability: "configured", invocation: "disabled-by-policy", authentication: "not-probed" } };
  }
  if (capability !== "codex.execute") throw new Error("unsupported-capability");
  if (worker?.adapter?.directExecutionEnabled !== false) throw new Error("codex-builder-boundary-invalid");
  return { waitingForUser: true, prompt: `Codex Builder task ${task?.id ?? "unknown"} remains staged: this machine's Desktop AppX executable is not directly callable, and no API key or alternate execution surface is configured.` };
}

function runCodexProbe() {
  return new Promise((resolve) => {
    let stderr = "";
    let settled = false;
    const child = spawn(CODEX_COMMAND, ["--version"], { cwd: ROOT, shell: false, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    const timer = setTimeout(() => child.kill(), 10000);
    const finish = (result) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ stderr, ...result }); };
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(0, 2000); });
    child.once("error", (error) => finish({ exitCode: null, errorCode: error.code ?? "process-start-failed" }));
    child.once("close", (exitCode) => finish({ exitCode, errorCode: null }));
  });
}

function bounded(value, maximum, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\r\n\u0000]/.test(value)) throw new TypeError(`${label} is invalid.`);
  return value;
}
