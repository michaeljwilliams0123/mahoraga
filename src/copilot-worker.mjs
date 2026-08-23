import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { ROOT } from "./config.mjs";

const COPILOT_COMMAND = "copilot";

export function buildCopilotInvocation({ task, worker }) {
  const adapter = worker?.adapter;
  if (worker?.id !== "github-copilot" || adapter?.kind !== "github-copilot-cli" || adapter.executable !== COPILOT_COMMAND) {
    throw new Error("copilot-adapter-not-configured");
  }
  const requestedOutcome = boundedText(task?.requestedOutcome, 1000, "requested outcome");
  const correlationId = boundedText(task?.correlationId, 120, "correlation id");
  const taskId = boundedText(task?.id, 100, "task id");
  const taskArea = boundedText(task?.taskArea ?? "general", 64, "task area");
  const cwd = path.resolve(ROOT, adapter.workingDirectory);
  if (cwd !== ROOT) throw new Error("copilot-working-directory-invalid");

  const args = [
    "-C", cwd,
    "--prompt", buildTaskPrompt({ requestedOutcome, correlationId, taskId, taskArea, allowedPaths: adapter.allowedPaths }),
    "--output-format", "json",
    "--no-remote",
    "--no-remote-export",
    "--no-custom-instructions",
    "--no-ask-user",
    "--disable-builtin-mcps",
    "--disallow-temp-dir",
  ];
  for (const tool of adapter.allowedTools) args.push(`--allow-tool=${tool}`);
  return { command: COPILOT_COMMAND, args, cwd, timeoutMs: worker.timeoutMs, maxOutputBytes: adapter.maxOutputBytes };
}

export async function executeCopilotCapability(capability, task, worker, { run = runBoundedCommand } = {}) {
  if (capability === "copilot.health") {
    const probe = await run({ command: COPILOT_COMMAND, args: ["--version"], cwd: ROOT, timeoutMs: Math.min(worker.timeoutMs, 15000), maxOutputBytes: 4096 });
    if (probe.errorCode || probe.timedOut || probe.exitCode !== 0 || !/GitHub Copilot CLI/i.test(probe.stdout)) {
      return { verified: false, summary: `GitHub Copilot CLI is unavailable (${probe.errorCode ?? probe.exitCode ?? "probe-failed"}).` };
    }
    const version = probe.stdout.match(/GitHub Copilot CLI\s+([^\s.]+(?:\.[^\s.]+)*)/i)?.[1] ?? "detected";
    return {
      verified: true,
      summary: `GitHub Copilot CLI ${version} is installed; authentication and quota remain unverified without an AI request.`,
      providerHealth: { availability: "configured", authentication: "unverified", quota: "unverified", version },
    };
  }
  if (capability !== "copilot.execute") throw new Error("unsupported-capability");
  const invocation = buildCopilotInvocation({ task, worker });
  const result = await run(invocation);
  const outcome = summarizeRun(result);
  return {
    verified: result.exitCode === 0 && !result.timedOut && !result.errorCode,
    summary: outcome.summary,
    providerReceipt: outcome.receipt,
  };
}

export function runBoundedCommand({ command, args, cwd, timeoutMs, maxOutputBytes }) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const append = (current, chunk) => current.length >= maxOutputBytes ? current : `${current}${chunk}`.slice(0, maxOutputBytes);
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    const complete = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, timedOut, ...result });
    };
    child.once("error", (error) => complete({ exitCode: null, errorCode: error.code ?? "process-start-failed" }));
    child.once("close", (exitCode) => complete({ exitCode, errorCode: null }));
  });
}

function buildTaskPrompt({ requestedOutcome, correlationId, taskId, taskArea, allowedPaths }) {
  return [
    "You are the bounded GitHub Copilot execution lane for Mahoraga.",
    `Task ${taskId}; correlation ${correlationId}; area ${taskArea}.`,
    `Work only in this repository and only within these declared paths: ${allowedPaths.join(", ")}.`,
    "Use only the explicitly granted tools. Do not access the network, export a session, use GitHub MCP tools, access temporary directories, change credentials, push, force-push, or create a pull request.",
    "Make the smallest coherent implementation. Run a relevant allowed verification command when appropriate.",
    "Return a concise summary of changed files, verification performed, and any blocker. Do not include secrets or source document contents.",
    `Requested outcome: ${requestedOutcome}`,
  ].join("\n");
}

function summarizeRun(result) {
  const receipt = {
    exitCode: result.exitCode,
    timedOut: Boolean(result.timedOut),
    errorCode: result.errorCode ?? null,
    stdoutBytes: Buffer.byteLength(result.stdout ?? ""),
    stderrBytes: Buffer.byteLength(result.stderr ?? ""),
    stdoutSha256: digest(result.stdout),
    stderrSha256: digest(result.stderr),
  };
  const state = receipt.timedOut ? "timed out" : receipt.errorCode ? "could not start" : receipt.exitCode === 0 ? "completed" : `exited ${receipt.exitCode}`;
  return { receipt, summary: `GitHub Copilot CLI ${state}; stdout ${receipt.stdoutBytes} bytes and stderr ${receipt.stderrBytes} bytes captured in the bounded provider receipt.` };
}

function digest(value) { return createHash("sha256").update(value ?? "", "utf8").digest("hex").slice(0, 16); }
function boundedText(value, maximum, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\u0000]/.test(value)) throw new TypeError(`${label} is invalid.`);
  return value;
}
