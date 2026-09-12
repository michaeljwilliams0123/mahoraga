import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { findInstalledCodexCli } from "./codex-builder-worker.mjs";
import { ROOT } from "./config.mjs";

const MAX_PROMPT_BYTES = 16 * 1024;
const MAX_EVENT_BYTES = 512 * 1024;
const MAX_ANSWER_CHARS = 4000;
const TIMEOUT_MS = 120_000;
const EXECUTION_STATE_SCHEMA_VERSION = 1;
const EXECUTION_STATE_FILE = "question-model-execution-state.json";
const execFileAsync = promisify(execFile);

export function buildQuestionPrompt({ requestedOutcome, messages = [] } = {}) {
  const question = boundedText(requestedOutcome, 12_000, "question-model-request-invalid");
  const history = (Array.isArray(messages) ? messages : []).slice(-12).map((message) => {
    const role = new Set(["user", "assistant", "worker", "system"]).has(message?.role) ? message.role : "user";
    const content = typeof message?.content === "string" ? message.content.replace(/\u0000/g, "").slice(0, 2000) : "";
    return content ? `${role}: ${content}` : null;
  }).filter(Boolean).join("\n");
  const prompt = [
    "You are Mahoraga's transient question model. Answer the owner's question directly, accurately, and with enough detail to be genuinely useful.",
    "Lead with the answer. Explain important reasoning and practical implications. Use concise Markdown when structure helps.",
    "Do not modify files, run commands, use tools, start tasks, claim actions, or turn the question into a software objective.",
    history ? `Recent conversation:\n${history}` : null,
    `Current question: ${question}`,
  ].filter(Boolean).join("\n\n");
  if (Buffer.byteLength(prompt, "utf8") > MAX_PROMPT_BYTES) throw new TypeError("question-model-prompt-too-large");
  return prompt;
}

export function parseCodexQuestionEvents(source) {
  let completed = false;
  let finalText = "";
  let usage = { inputTokens: 0, outputTokens: 0 };
  for (const line of String(source ?? "").split(/\r?\n/).filter(Boolean)) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type === "item.completed" && event?.item?.type === "agent_message") finalText = String(event.item.text ?? "").trim().slice(0, MAX_ANSWER_CHARS);
    if (event?.type === "turn.completed") {
      completed = true;
      usage = {
        inputTokens: nonnegativeInteger(event.usage?.input_tokens),
        outputTokens: nonnegativeInteger(event.usage?.output_tokens),
      };
    }
    if (event?.type === "turn.failed") completed = false;
  }
  return Object.freeze({ completed, finalText, usage: Object.freeze(usage) });
}

export async function executeQuestionModel({ task, run = runCodexQuestion, executionState = null } = {}) {
  const prompt = buildQuestionPrompt({ requestedOutcome: task?.requestedOutcome, messages: task?.messages });
  const execution = await run({ prompt, sandbox: "read-only", approvalPolicy: "never", networkAccess: false });
  const parsed = parseCodexQuestionEvents(execution?.stdout);
  if (execution?.exitCode !== 0) {
    const error = questionModelExecutionError(execution?.stdout);
    if (executionState && error.code === "question-model-usage-limit") {
      executionState.reasonCode = error.code;
      executionState.blockedUntil = error.retryAfter ?? new Date(Date.now() + 15 * 60_000).toISOString();
    }
    throw error;
  }
  if (!parsed.completed || parsed.finalText.length < 32) throw new Error("question-model-incomplete");
  return {
    verified: true,
    answer: parsed.finalText,
    summary: receiptSummary(parsed.finalText),
    completionEvidence: { criteriaSatisfied: true, evidenceCount: 1, unresolved: false },
    providerHealth: {
      availability: "healthy",
      provider: "primary-codex-question",
      executionMode: "transient-read-only",
      networkAccess: false,
      responseContentPersistedOutsideVault: false,
      usage: parsed.usage,
    },
  };
}

export function createQuestionModelExecutionState() {
  return { reasonCode: null, blockedUntil: null };
}

export function resolveQuestionModelExecutionStatePath({ root = ROOT, env = process.env } = {}) {
  let stateRoot;
  if (typeof env?.MAHORAGA_DATABASE_FILE === "string" && env.MAHORAGA_DATABASE_FILE.trim()) {
    stateRoot = path.dirname(path.resolve(env.MAHORAGA_DATABASE_FILE.trim()));
  } else if (typeof env?.MAHORAGA_ARTIFACT_ROOT === "string" && env.MAHORAGA_ARTIFACT_ROOT.trim()) {
    stateRoot = path.dirname(path.resolve(env.MAHORAGA_ARTIFACT_ROOT.trim()));
  } else if (typeof env?.MAHORAGA_CONTENT_VAULT_ROOT === "string" && env.MAHORAGA_CONTENT_VAULT_ROOT.trim()) {
    stateRoot = path.dirname(path.resolve(env.MAHORAGA_CONTENT_VAULT_ROOT.trim()));
  } else {
    stateRoot = path.join(root, "state");
  }
  return path.join(stateRoot, EXECUTION_STATE_FILE);
}

export async function loadQuestionModelExecutionState({ file = resolveQuestionModelExecutionStatePath() } = {}) {
  let parsed;
  try { parsed = JSON.parse(await readFile(path.resolve(file), "utf8")); }
  catch (error) {
    if (error?.code === "ENOENT") return createQuestionModelExecutionState();
    if (error instanceof SyntaxError) throw new TypeError("question-model-execution-state-invalid");
    throw error;
  }
  return normalizeExecutionStateRecord(parsed);
}

export async function saveQuestionModelExecutionState(executionState, { file = resolveQuestionModelExecutionStatePath() } = {}) {
  const normalized = normalizeExecutionStateValues(executionState);
  const target = path.resolve(file);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(path.dirname(target), { recursive: true });
  const record = {
    schemaVersion: EXECUTION_STATE_SCHEMA_VERSION,
    reasonCode: normalized.reasonCode,
    blockedUntil: normalized.blockedUntil,
  };
  try {
    await writeFile(temporary, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export function probeQuestionModelExecutionState({ executionState = null, now = Date.now() } = {}) {
  const blockedUntil = executionState?.blockedUntil ?? null;
  const blockedUntilMs = blockedUntil ? Date.parse(blockedUntil) : NaN;
  if (Number.isFinite(blockedUntilMs) && blockedUntilMs > now) {
    return {
      verified: false,
      summary: "The transient question model is temporarily unavailable because its licensed quota is exhausted.",
      providerHealth: {
        availability: "unavailable",
        provider: "primary-codex-question",
        invocation: "execution-state",
        reasonCode: executionState?.reasonCode ?? "question-model-usage-limit",
        retryAfter: blockedUntil,
      },
    };
  }
  if (executionState) { executionState.reasonCode = null; executionState.blockedUntil = null; }
  return {
    verified: true,
    summary: "The transient question model has no active execution backoff.",
    providerHealth: { availability: "healthy", provider: "primary-codex-question", invocation: "execution-state" },
  };
}

export async function probeQuestionModel({ findCli = findInstalledCodexCli, runVersion = runCodexVersionProbe } = {}) {
  let executable;
  try {
    executable = await findCli();
    const probe = await runVersion({ executable });
    if (probe?.exitCode !== 0) {
      return {
        verified: false,
        summary: "The transient question model Codex executable is not callable.",
        providerHealth: { availability: "unavailable", provider: "primary-codex-question", invocation: "not-callable", executable: path.basename(executable) },
      };
    }
    return {
      verified: true,
      summary: "The transient read-only question model is available.",
      providerHealth: { availability: "healthy", provider: "primary-codex-question", invocation: "non-interactive-cli", executable: path.basename(executable) },
    };
  } catch {
    return {
      verified: false,
      summary: "The transient question model Codex executable is unavailable.",
      providerHealth: { availability: "unavailable", provider: "primary-codex-question", invocation: "not-callable", executable: executable ? path.basename(executable) : null },
    };
  }
}

async function runCodexVersionProbe({ executable }) {
  const result = await execFileAsync(executable, ["--version"], { cwd: ROOT, windowsHide: true, timeout: 15_000, maxBuffer: 32 * 1024, env: questionEnvironment() });
  return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
}

export async function runCodexQuestion({ prompt }) {
  const executable = await findInstalledCodexCli();
  const args = ["exec", "--ephemeral", "--sandbox", "read-only", "-c", "approval_policy=\"never\"", "-c", "sandbox_workspace_write.network_access=false", "--ignore-user-config", "--json", "-C", ROOT, "-"];
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(executable, args, { cwd: ROOT, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: questionEnvironment() });
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => { child.kill(); finish(new Error("question-model-timeout")); }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, "utf8") > MAX_EVENT_BYTES) { child.kill(); finish(new Error("question-model-output-limit")); }
    });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4096); });
    child.once("error", (error) => finish(error));
    child.once("close", (exitCode) => finish(null, { exitCode, stdout, stderr }));
    child.stdin.end(prompt, "utf8");
  });
}

export function questionEnvironment(source = process.env) {
  const profile = typeof source.USERPROFILE === "string" && path.isAbsolute(source.USERPROFILE) ? path.resolve(source.USERPROFILE) : null;
  return Object.fromEntries(Object.entries({
    SystemRoot: source.SystemRoot,
    WINDIR: source.WINDIR,
    PATH: source.PATH,
    USERPROFILE: profile,
    LOCALAPPDATA: source.LOCALAPPDATA,
    APPDATA: source.APPDATA,
    TEMP: source.TEMP,
    TMP: source.TMP,
    CODEX_HOME: profile ? path.join(profile, ".codex") : undefined,
  }).filter(([, value]) => typeof value === "string" && value.length > 0));
}

function questionModelExecutionError(source) {
  let message = "question-model-incomplete";
  for (const line of String(source ?? "").split(/\r?\n/).filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      const candidate = event?.error?.message ?? event?.message;
      if (typeof candidate === "string" && candidate.trim()) message = candidate.trim();
    } catch {}
  }
  const error = new Error(message);
  if (/usage limit/i.test(message)) {
    error.code = "question-model-usage-limit";
    error.retryAfter = parseUsageLimitRetryAfter(message);
  }
  return error;
}

function parseUsageLimitRetryAfter(message) {
  const match = String(message ?? "").match(/try again at\s+(.+?)(?:\.|$)/i);
  if (!match) return null;
  const normalized = match[1].replace(/(\d+)(?:st|nd|rd|th)\b/gi, "$1");
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeExecutionStateRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("question-model-execution-state-invalid");
  const keys = Object.keys(value).sort();
  if (keys.length !== 3 || keys[0] !== "blockedUntil" || keys[1] !== "reasonCode" || keys[2] !== "schemaVersion") {
    throw new TypeError("question-model-execution-state-invalid");
  }
  if (value.schemaVersion !== EXECUTION_STATE_SCHEMA_VERSION) throw new TypeError("question-model-execution-state-invalid");
  return normalizeExecutionStateValues(value);
}

function normalizeExecutionStateValues(value) {
  const reasonCode = value?.reasonCode ?? null;
  const blockedUntil = value?.blockedUntil ?? null;
  if (reasonCode !== null && reasonCode !== "question-model-usage-limit") throw new TypeError("question-model-execution-state-invalid");
  if (blockedUntil !== null) {
    if (typeof blockedUntil !== "string") throw new TypeError("question-model-execution-state-invalid");
    const timestamp = Date.parse(blockedUntil);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== blockedUntil) throw new TypeError("question-model-execution-state-invalid");
  }
  if ((reasonCode === null) !== (blockedUntil === null)) throw new TypeError("question-model-execution-state-invalid");
  return { reasonCode, blockedUntil };
}

function boundedText(value, maximum, code) {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > maximum || /\u0000/.test(value)) throw new TypeError(code);
  return value.trim();
}
function receiptSummary(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 512);
}
function nonnegativeInteger(value) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : 0; }
