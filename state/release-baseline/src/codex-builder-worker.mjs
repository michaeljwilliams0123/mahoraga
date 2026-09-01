import { createHash } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { access, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ROOT } from "./config.mjs";
import { createExecutionCell, inspectExecutionCell, probeExecutionCellEnvironment, quarantineExecutionCell } from "./execution-cell.mjs";

const execFileAsync = promisify(execFile);
const CODEX_EXECUTABLE = "user-codex-cli";
const VENDOR_PATH = path.join("node_modules", "@openai", "codex", "vendor", "x86_64-pc-windows-msvc", "bin", "codex.exe");
const BUNDLED_CODEX_EXECUTABLE = path.join(ROOT, VENDOR_PATH);

export function buildCodexBuilderEnvelope({ task, worker, session = {}, cell }) {
  const adapter = requireAdapter(worker);
  const taskId = bounded(task?.id, 100, "task id");
  const correlationId = bounded(task?.correlationId, 120, "correlation id");
  const requestedOutcome = boundedMultiline(task?.requestedOutcome, adapter.maximumPromptBytes, "requested outcome");
  if (!cell || cell.taskId !== taskId || !Array.isArray(cell.allowedPaths)) throw new TypeError("Codex Builder execution cell is invalid.");
  const workingDirectory = trustedExecutionCellDirectory(cell);
  const prompt = [
    "You are the task-scoped Primary Codex Builder operating inside a disposable Mahoraga candidate worktree.",
    `Task: ${taskId}`,
    `Correlation: ${correlationId}`,
    `Base commit: ${cell.baseCommit}`,
    `Allowed paths: ${cell.allowedPaths.join(", ")}`,
    "Follow AGENTS.md and the existing architecture. Work only in the current candidate worktree and only within the allowed paths.",
    "Do not merge, push, deploy, alter remotes, rewrite history, change repository visibility, or write to the authoritative checkout.",
    "Implement, diagnose, validate, and commit the bounded candidate on the current task branch. Do not expose credentials, conversation history, browser history, or unrelated personal context.",
    `Requested outcome: ${requestedOutcome}`,
  ].join("\n");
  if (Buffer.byteLength(prompt, "utf8") > adapter.maximumPromptBytes) throw new TypeError("Codex Builder prompt is too large.");
  return Object.freeze({
    provider: "primary-codex-builder",
    taskId,
    correlationId,
    executionSessionId: bounded(session.executionSessionId ?? task.executionSessionId ?? `builder-${taskId}`, 120, "execution session id"),
    authoritySessionId: session.authoritySessionId ?? task.authoritySessionId ?? null,
    executionMode: "candidate-worktree",
    interactiveAuthority: false,
    directExecutionEnabled: true,
    apiKeyRequired: false,
    workingDirectory,
    executionCellRoot: path.resolve(cell.cellsRoot),
    prompt,
  });
}

export async function executeCodexBuilderCapability(capability, task, worker, dependencies = {}) {
  const adapter = requireAdapter(worker);
  if (capability === "codex.health") {
    const probe = dependencies.run ? await dependencies.run() : await probeCodexCli(dependencies);
    if (probe.errorCode === "EACCES" || /access is denied/i.test(probe.stderr ?? "")) {
      return { verified: false, summary: "The detected Codex executable is not callable from the Builder worker.", providerHealth: { availability: "unavailable", invocation: "access-denied", authentication: "unverified", executionCellCanary: "failed" } };
    }
    if (probe.errorCode || probe.exitCode !== 0) {
      return { verified: false, summary: `Codex Builder invocation is unavailable (${probe.errorCode ?? probe.exitCode ?? "probe-failed"}).`, providerHealth: { availability: "unavailable", invocation: "not-callable", authentication: "unverified", executionCellCanary: probe.executionCellCanary ?? "failed" } };
    }
    const verified = probe.authenticationConfigured !== false && probe.executionCellCanary === "verified";
    return {
      verified,
      summary: probe.authenticationConfigured === false
        ? "The user-level Codex CLI is callable, but saved Codex account authentication is not configured."
        : probe.executionCellCanary !== "verified" ? "The Codex CLI is callable, but the candidate-worktree containment canary failed."
          : "The user-level Codex CLI and candidate-worktree containment are verified for task-scoped execution.",
      providerHealth: { availability: verified ? "healthy" : "unavailable", invocation: "non-interactive-cli", authentication: probe.authenticationConfigured === false ? "unverified" : "verified", executionCellCanary: probe.executionCellCanary ?? "failed", version: safeVersion(probe.stdout) },
    };
  }
  if (capability !== "codex.execute") throw new Error("unsupported-capability");

  const executionSessionId = dependencies.session?.executionSessionId ?? task?.executionSessionId ?? `builder-${bounded(task?.id, 100, "task id")}`;
  const contract = {
    taskId: task.id,
    executionSessionId,
    repositoryRoot: dependencies.repositoryRoot ?? ROOT,
    baseCommit: task.baseCommit,
    allowedPaths: task.allowedPaths,
    integrationLeaseId: task.integrationLeaseId,
    integrationLease: task.integrationLease,
  };
  let cell;
  try {
    cell = await createExecutionCell(contract, dependencies.executionCell ?? {});
  } catch (error) {
    return failedCandidate(task.id, "Codex Builder refused to start outside a verified execution cell.", errorCode(error), null);
  }

  const envelope = buildCodexBuilderEnvelope({ task, worker, session: dependencies.session, cell });
  let execution;
  try {
    execution = dependencies.runTask ? await dependencies.runTask(envelope) : await runCodexTask(envelope, adapter, dependencies);
  } catch (error) {
    const quarantined = await quarantineExecutionCell(cell, errorCode(error), dependencies.executionCell ?? {});
    return failedCandidate(task.id, "Codex Builder execution failed and its candidate worktree was quarantined.", errorCode(error), quarantined);
  }
  if (execution.exitCode !== 0 || execution.completed !== true) {
    const code = `codex-builder-exit-${execution.exitCode ?? "failed"}`;
    const quarantined = await quarantineExecutionCell(cell, code, dependencies.executionCell ?? {});
    return failedCandidate(task.id, "Codex Builder did not complete; its candidate worktree was quarantined.", code, quarantined, execution);
  }

  const inspection = await inspectExecutionCell(cell, dependencies.executionCell ?? {});
  if (inspection.violations.length > 0) {
    const quarantined = await quarantineExecutionCell(cell, inspection.violations[0], dependencies.executionCell ?? {});
    return failedCandidate(task.id, `Codex Builder candidate failed containment validation with ${inspection.violations.length} violation(s).`, "execution-cell-validation-failed", quarantined, execution, inspection);
  }
  return {
    verified: true,
    summary: `Codex Builder produced a contained candidate for task ${envelope.taskId}; ${inspection.changedPaths.length} allowed repository path(s) await integrator review.`,
    providerReceipt: candidateEvidence(cell, execution, inspection, "clear"),
  };
}

export async function findInstalledCodexCli({ canAccess = access, resolveRealpath = realpath, listPnpmPackages = readdir, localAppData = process.env.LOCALAPPDATA } = {}) {
  const repositoryRoot = path.join(ROOT, "node_modules", "@openai", "codex", "vendor");
  const candidates = [{ executable: BUNDLED_CODEX_EXECUTABLE, trustedRoots: [repositoryRoot] }];
  const normalizedLocalAppData = typeof localAppData === "string" && path.isAbsolute(localAppData) && /[\\/]AppData[\\/]Local$/i.test(path.resolve(localAppData)) ? path.resolve(localAppData) : null;
  if (normalizedLocalAppData) {
    const pnpmRoot = path.join(normalizedLocalAppData, "Programs", "CodexCLI", "node_modules", ".pnpm");
    try {
      const packages = (await listPnpmPackages(pnpmRoot)).filter((name) => /^@openai\+codex@[0-9][^\\/]*-win32-x64$/.test(name)).sort().reverse();
      for (const name of packages) {
        const vendorRoot = path.join(pnpmRoot, name, "node_modules", "@openai", "codex", "vendor");
        candidates.push({ executable: path.join(vendorRoot, "x86_64-pc-windows-msvc", "bin", "codex.exe"), trustedRoots: [vendorRoot] });
      }
    } catch { /* user-level package is optional */ }
  }
  for (const candidate of candidates) {
    try {
      await canAccess(candidate.executable);
      if (await isTrustedCodexExecutable(candidate.executable, candidate.trustedRoots, resolveRealpath)) return candidate.executable;
    } catch { /* try the next fixed trusted candidate */ }
  }
  throw Object.assign(new Error("codex-builder-cli-not-found"), { code: "ENOENT" });
}

async function isTrustedCodexExecutable(candidate, trustedRoots, resolveRealpath = realpath) {
  const resolvedCandidate = await resolveRealpath(candidate);
  if (path.basename(resolvedCandidate).toLowerCase() !== "codex.exe") return false;
  const resolvedRoots = [];
  for (const root of trustedRoots) {
    try { resolvedRoots.push(await resolveRealpath(root)); } catch { /* ignore unavailable root */ }
  }
  return resolvedRoots.some((root) => {
    const relative = path.relative(root, resolvedCandidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}

async function probeCodexCli(dependencies) {
  try {
    const executable = await (dependencies.resolveExecutable ?? findInstalledCodexCli)(dependencies);
    const result = await execFileAsync(executable, ["--version"], { cwd: ROOT, windowsHide: true, timeout: 15000, maxBuffer: 32 * 1024, env: codexEnvironment(dependencies.env) });
    const containment = await probeExecutionCellEnvironment(ROOT, dependencies.executionCell ?? {});
    return { exitCode: 0, errorCode: null, containmentErrorCode: containment.verified ? null : containment.errorCode, stdout: result.stdout, stderr: result.stderr, authenticationConfigured: await authenticationConfigured(dependencies.env), executionCellCanary: containment.executionCellCanary };
  } catch (error) {
    return { exitCode: Number.isInteger(error?.code) ? error.code : null, errorCode: typeof error?.code === "string" ? error.code : "probe-failed", stdout: error?.stdout ?? "", stderr: error?.stderr ?? error?.message ?? "" };
  }
}

async function runCodexTask(envelope, adapter, dependencies) {
  const executable = await (dependencies.resolveExecutable ?? findInstalledCodexCli)(dependencies);
  const workingDirectory = trustedExecutionCellDirectory({ path: envelope.workingDirectory, cellsRoot: envelope.executionCellRoot });
  const result = await spawnCodex(executable, ["exec", "--ephemeral", "--sandbox", adapter.sandbox, "-c", `approval_policy=\"${adapter.approvalPolicy}\"`, "-c", "sandbox_workspace_write.network_access=false", "--ignore-user-config", "--json", "-C", workingDirectory, "-"], envelope.prompt, workingDirectory, adapter, dependencies);
  const events = parseEvents(result.stdout);
  return { exitCode: result.exitCode, completed: events.completed, threadId: events.threadId, usage: events.usage, outputSha256: digest(events.finalText) };
}

function spawnCodex(executable, args, prompt, workingDirectory, adapter, dependencies) {
  const launch = dependencies.spawn ?? spawn;
  return new Promise((resolve, reject) => {
    let stdout = ""; let stderr = ""; let settled = false;
    const child = launch(executable, args, { cwd: workingDirectory, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: codexEnvironment(dependencies.env) });
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(new Error("codex-builder-timeout")); }, adapter.executionTimeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; if (Buffer.byteLength(stdout, "utf8") > adapter.maximumEventBytes) { child.kill(); finish(new Error("codex-builder-output-limit")); } });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8192); });
    child.once("error", (error) => finish(error));
    child.once("close", (exitCode) => finish(null, { exitCode, stdout, stderr }));
    child.stdin.end(prompt, "utf8");
  });
}

function candidateEvidence(cell, execution = {}, inspection = {}, quarantineState = "clear", failureCode = null) {
  return {
    executionMode: "candidate-worktree",
    cellId: cell.id,
    executionSessionId: cell.executionSessionId,
    sandbox: "workspace-write",
    approvalPolicy: "never",
    networkAccess: false,
    ephemeral: true,
    baseCommit: cell.baseCommit,
    headCommit: inspection.headCommit ?? cell.baseCommit,
    branch: cell.branch,
    worktreeIdentitySha256: cell.pathSha256,
    allowedPaths: cell.allowedPaths,
    changedPaths: inspection.changedPaths ?? [],
    validationState: inspection.validationState ?? "failed",
    quarantineState,
    failureCode,
    threadId: optionalIdentifier(execution.threadId),
    outputSha256: /^[a-f0-9]{64}$/i.test(execution.outputSha256 ?? "") ? execution.outputSha256.toLowerCase() : null,
    usage: sanitizeUsage(execution.usage),
    finalResponseStored: false,
  };
}

function failedCandidate(taskId, summary, code, cell, execution = {}, inspection = {}) {
  return {
    verified: false,
    summary,
    providerReceipt: cell
      ? candidateEvidence(cell, execution, inspection, "quarantined", code)
      : { executionMode: "candidate-worktree", sandbox: "workspace-write", approvalPolicy: "never", networkAccess: false, ephemeral: true, validationState: "failed", quarantineState: "not-created", failureCode: code, finalResponseStored: false },
    taskReference: digest(taskId).slice(0, 24),
  };
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

function trustedExecutionCellDirectory(cell) {
  if (!cell || typeof cell.path !== "string" || typeof cell.cellsRoot !== "string" || !path.isAbsolute(cell.path) || !path.isAbsolute(cell.cellsRoot)) throw new TypeError("Codex Builder execution cell is invalid.");
  const cellsRoot = path.resolve(cell.cellsRoot);
  const candidate = path.resolve(cell.path);
  const relative = path.relative(cellsRoot, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new TypeError("Codex Builder execution cell is invalid.");
  return candidate;
}

function trustedProfileDirectory(value) {
  return typeof value === "string" && path.isAbsolute(value) && path.resolve(value) === value ? value : null;
}

function codexEnvironment(source = process.env) {
  const profile = trustedProfileDirectory(source.USERPROFILE);
  return Object.fromEntries(Object.entries({ SystemRoot: source.SystemRoot, WINDIR: source.WINDIR, PATH: source.PATH, USERPROFILE: profile, LOCALAPPDATA: source.LOCALAPPDATA, APPDATA: source.APPDATA, TEMP: source.TEMP, TMP: source.TMP, CODEX_HOME: profile ? path.join(profile, ".codex") : undefined }).filter(([, value]) => typeof value === "string" && value.length > 0));
}

async function authenticationConfigured(env = process.env) {
  const profile = trustedProfileDirectory(env.USERPROFILE);
  if (!profile) return false;
  try { await access(path.join(profile, ".codex", "auth.json")); return true; } catch { return false; }
}

function requireAdapter(worker) {
  const adapter = worker?.adapter;
  if (worker?.id !== "primary-codex-builder" || adapter?.kind !== "codex-cli-builder" || adapter.executable !== CODEX_EXECUTABLE || adapter.workingDirectory !== "candidate-worktree" || adapter.taskScoped !== true || adapter.interactiveAuthority !== false || adapter.directExecutionEnabled !== true || adapter.apiKeyRequired !== false || adapter.sandbox !== "workspace-write" || adapter.approvalPolicy !== "never" || adapter.networkAccess !== false || adapter.ephemeral !== true || adapter.ignoreUserConfig !== true) throw new Error("codex-builder-adapter-not-configured");
  return adapter;
}

function sanitizeUsage(value) { const number = (item) => Number.isInteger(Number(item)) && Number(item) >= 0 ? Number(item) : 0; return { inputTokens: number(value?.input_tokens), cachedInputTokens: number(value?.cached_input_tokens), outputTokens: number(value?.output_tokens), reasoningOutputTokens: number(value?.reasoning_output_tokens) }; }
function safeVersion(value) { return String(value ?? "").match(/codex-cli\s+([0-9.]+)/i)?.[1] ?? "detected"; }
function optionalIdentifier(value) { return typeof value === "string" && /^[A-Za-z0-9-]{8,128}$/.test(value) ? value : null; }
function errorCode(error) { return String(error?.code ?? error?.message ?? "codex-builder-failed").replace(/[^a-z0-9-]/gi, "-").slice(0, 120) || "codex-builder-failed"; }
function digest(value) { return createHash("sha256").update(value ?? "", "utf8").digest("hex"); }
function bounded(value, maximum, label) { if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\r\n\u0000]/.test(value)) throw new TypeError(`${label} is invalid.`); return value; }
function boundedMultiline(value, maximum, label) { if (typeof value !== "string" || value.trim().length < 1 || Buffer.byteLength(value, "utf8") > maximum || /\u0000/.test(value)) throw new TypeError(`${label} is invalid.`); return value.trim(); }
