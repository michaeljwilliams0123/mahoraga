import { createHash } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ROOT } from "./config.mjs";

const execFileAsync = promisify(execFile);
const CODEX_EXECUTABLE = "user-codex-cli";
const VENDOR_PATH = path.join("node_modules", "@openai", "codex", "vendor", "x86_64-pc-windows-msvc", "bin", "codex.exe");

export function buildCodexBuilderEnvelope({ task, worker, session = {} }) {
  const adapter = requireAdapter(worker);
  const taskId = bounded(task?.id, 100, "task id");
  const correlationId = bounded(task?.correlationId, 120, "correlation id");
  const requestedOutcome = boundedMultiline(task?.requestedOutcome, adapter.maximumPromptBytes, "requested outcome");
  const prompt = [
    "You are the task-scoped Primary Codex Builder operating inside Mahoraga.",
    `Task: ${taskId}`,
    `Correlation: ${correlationId}`,
    "Work directly in the current Mahoraga Git repository. Follow AGENTS.md and the existing architecture.",
    "Implement, diagnose, test, and repair as needed. Do not expose credentials, conversation history, browser history, or unrelated personal context.",
    "Do not force-push, rewrite Git history, or change repository visibility. Submit core changes through Mahoraga's verified local activation and rollback path.",
    `Requested outcome: ${requestedOutcome}`,
  ].join("\n");
  if (Buffer.byteLength(prompt, "utf8") > adapter.maximumPromptBytes) throw new TypeError("Codex Builder prompt is too large.");
  return Object.freeze({
    provider: "primary-codex-builder",
    taskId,
    correlationId,
    executionSessionId: bounded(session.executionSessionId ?? `builder-${taskId}`, 120, "execution session id"),
    authoritySessionId: session.authoritySessionId ?? null,
    executionMode: "task-scoped",
    interactiveAuthority: false,
    directExecutionEnabled: true,
    apiKeyRequired: false,
    prompt,
  });
}

export async function executeCodexBuilderCapability(capability, task, worker, dependencies = {}) {
  const adapter = requireAdapter(worker);
  if (capability === "codex.health") {
    const probe = dependencies.run ? await dependencies.run() : await probeCodexCli(dependencies);
    if (probe.errorCode === "EACCES" || /access is denied/i.test(probe.stderr ?? "")) {
      return { verified: false, summary: "The detected Codex executable is not callable from the Builder worker.", providerHealth: { availability: "unavailable", invocation: "access-denied", authentication: "unverified" } };
    }
    if (probe.errorCode || probe.exitCode !== 0) {
      return { verified: false, summary: `Codex Builder invocation is unavailable (${probe.errorCode ?? probe.exitCode ?? "probe-failed"}).`, providerHealth: { availability: "unavailable", invocation: "not-callable", authentication: "unverified" } };
    }
    return {
      verified: probe.authenticationConfigured !== false,
      summary: probe.authenticationConfigured === false
        ? "The user-level Codex CLI is callable, but saved Codex account authentication is not configured."
        : "The user-level Codex CLI is callable for task-scoped, account-authenticated, non-interactive execution.",
      providerHealth: { availability: "healthy", invocation: "non-interactive-cli", authentication: probe.authenticationConfigured === false ? "unverified" : "verified", version: safeVersion(probe.stdout) },
    };
  }
  if (capability !== "codex.execute") throw new Error("unsupported-capability");
  const envelope = buildCodexBuilderEnvelope({ task, worker, session: dependencies.session });
  const execution = dependencies.runTask ? await dependencies.runTask(envelope) : await runCodexTask(envelope, adapter, dependencies);
  if (execution.exitCode !== 0 || execution.completed !== true) throw new Error(`codex-builder-exit-${execution.exitCode ?? "failed"}`);
  return {
    verified: true,
    summary: `Codex Builder completed task ${envelope.taskId}; ${execution.changedPaths.length} repository path(s) require validator or integrator review.`,
    providerReceipt: {
      executionMode: "task-scoped",
      sandbox: adapter.sandbox,
      ephemeral: true,
      threadId: optionalIdentifier(execution.threadId),
      outputSha256: execution.outputSha256,
      changedPaths: execution.changedPaths,
      usage: sanitizeUsage(execution.usage),
      finalResponseStored: false,
    },
  };
}

export async function findInstalledCodexCli({ env = process.env, list = readdir, canAccess = access } = {}) {
  const candidates = [];
  if (env.LOCALAPPDATA) {
    const store = path.join(env.LOCALAPPDATA, "Programs", "CodexCLI", "node_modules", ".pnpm");
    try {
      const entries = await list(store, { withFileTypes: true });
      for (const item of entries.filter((entry) => entry.isDirectory() && /^@openai\+codex@.+-win32-x64$/i.test(entry.name)).map((entry) => entry.name).sort().reverse()) candidates.push(path.join(store, item, VENDOR_PATH));
    } catch { /* optional user-level package store */ }
  }
  if (env.USERPROFILE) candidates.push(path.join(env.USERPROFILE, ".codex", ".sandbox-bin", "codex.exe"));
  for (const candidate of candidates) {
    try { await canAccess(candidate); return candidate; } catch { /* try next fixed path */ }
  }
  throw Object.assign(new Error("codex-builder-cli-not-found"), { code: "ENOENT" });
}

async function probeCodexCli(dependencies) {
  try {
    const executable = await (dependencies.resolveExecutable ?? findInstalledCodexCli)(dependencies);
    const result = await execFileAsync(executable, ["--version"], { cwd: ROOT, windowsHide: true, timeout: 15000, maxBuffer: 32 * 1024, env: codexEnvironment(dependencies.env) });
    return { exitCode: 0, errorCode: null, stdout: result.stdout, stderr: result.stderr, authenticationConfigured: await authenticationConfigured(dependencies.env) };
  } catch (error) {
    return { exitCode: Number.isInteger(error?.code) ? error.code : null, errorCode: typeof error?.code === "string" ? error.code : "probe-failed", stdout: error?.stdout ?? "", stderr: error?.stderr ?? error?.message ?? "" };
  }
}

async function runCodexTask(envelope, adapter, dependencies) {
  const executable = await (dependencies.resolveExecutable ?? findInstalledCodexCli)(dependencies);
  const result = await spawnCodex(executable, ["exec", "--ephemeral", "--sandbox", adapter.sandbox, "--ignore-user-config", "--json", "-C", ROOT, "-"], envelope.prompt, adapter, dependencies);
  const events = parseEvents(result.stdout);
  return { exitCode: result.exitCode, completed: events.completed, threadId: events.threadId, usage: events.usage, changedPaths: [...await snapshotWorkingTree()].slice(0, 128), outputSha256: digest(events.finalText) };
}

function spawnCodex(executable, args, prompt, adapter, dependencies) {
  const launch = dependencies.spawn ?? spawn;
  return new Promise((resolve, reject) => {
    let stdout = ""; let stderr = ""; let settled = false;
    const child = launch(executable, args, { cwd: ROOT, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: codexEnvironment(dependencies.env) });
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(new Error("codex-builder-timeout")); }, adapter.executionTimeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; if (Buffer.byteLength(stdout, "utf8") > adapter.maximumEventBytes) { child.kill(); finish(new Error("codex-builder-output-limit")); } });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8192); });
    child.once("error", (error) => finish(error));
    child.once("close", (exitCode) => finish(null, { exitCode, stdout, stderr }));
    child.stdin.end(prompt, "utf8");
  });
}

async function snapshotWorkingTree() {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: ROOT, windowsHide: true, timeout: 15000, maxBuffer: 512 * 1024 });
    return new Set(String(stdout).split("\0").filter(Boolean).map((row) => row.slice(3).split(" -> ").at(-1)).filter((item) => item && !item.includes("..") && !path.isAbsolute(item)));
  } catch { return new Set(); }
}

function parseEvents(source) {
  let threadId = null; let completed = false; let usage = null; let finalText = "";
  for (const line of String(source ?? "").split(/\r?\n/).filter(Boolean)) {
    let event; try { event = JSON.parse(line); } catch { continue; }
    if (event?.type === "thread.started") threadId = event.thread_id;
    if (event?.type === "item.completed" && event?.item?.type === "agent_message") finalText = String(event.item.text ?? "").slice(0, 32768);
    if (event?.type === "turn.completed") { completed = true; usage = event.usage; }
    if (event?.type === "turn.failed") completed = false;
  }
  return { threadId, completed, usage, finalText };
}

function codexEnvironment(source = process.env) {
  const profile = source.USERPROFILE;
  return Object.fromEntries(Object.entries({ SystemRoot: source.SystemRoot, WINDIR: source.WINDIR, PATH: source.PATH, USERPROFILE: profile, LOCALAPPDATA: source.LOCALAPPDATA, APPDATA: source.APPDATA, TEMP: source.TEMP, TMP: source.TMP, CODEX_HOME: source.CODEX_HOME ?? (profile ? path.join(profile, ".codex") : undefined) }).filter(([, value]) => typeof value === "string" && value.length > 0));
}

async function authenticationConfigured(env = process.env) {
  if (!env.USERPROFILE) return false;
  try { await access(path.join(env.CODEX_HOME ?? path.join(env.USERPROFILE, ".codex"), "auth.json")); return true; } catch { return false; }
}

function requireAdapter(worker) {
  const adapter = worker?.adapter;
  if (worker?.id !== "primary-codex-builder" || adapter?.kind !== "codex-cli-builder" || adapter.executable !== CODEX_EXECUTABLE || adapter.workingDirectory !== "." || adapter.taskScoped !== true || adapter.interactiveAuthority !== false || adapter.directExecutionEnabled !== true || adapter.apiKeyRequired !== false || adapter.sandbox !== "workspace-write" || adapter.ephemeral !== true || adapter.ignoreUserConfig !== true) throw new Error("codex-builder-adapter-not-configured");
  return adapter;
}

function sanitizeUsage(value) { const number = (item) => Number.isInteger(Number(item)) && Number(item) >= 0 ? Number(item) : 0; return { inputTokens: number(value?.input_tokens), cachedInputTokens: number(value?.cached_input_tokens), outputTokens: number(value?.output_tokens), reasoningOutputTokens: number(value?.reasoning_output_tokens) }; }
function safeVersion(value) { return String(value ?? "").match(/codex-cli\s+([0-9.]+)/i)?.[1] ?? "detected"; }
function optionalIdentifier(value) { return typeof value === "string" && /^[A-Za-z0-9-]{8,128}$/.test(value) ? value : null; }
function digest(value) { return createHash("sha256").update(value ?? "", "utf8").digest("hex"); }
function bounded(value, maximum, label) { if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\r\n\u0000]/.test(value)) throw new TypeError(`${label} is invalid.`); return value; }
function boundedMultiline(value, maximum, label) { if (typeof value !== "string" || value.trim().length < 1 || Buffer.byteLength(value, "utf8") > maximum || /\u0000/.test(value)) throw new TypeError(`${label} is invalid.`); return value.trim(); }
