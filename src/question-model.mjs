import { spawn } from "node:child_process";
import path from "node:path";
import { findInstalledCodexCli } from "./codex-builder-worker.mjs";
import { ROOT } from "./config.mjs";

const MAX_PROMPT_BYTES = 16 * 1024;
const MAX_EVENT_BYTES = 512 * 1024;
const MAX_ANSWER_CHARS = 4000;
const TIMEOUT_MS = 120_000;

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

export async function executeQuestionModel({ task, run = runCodexQuestion } = {}) {
  const prompt = buildQuestionPrompt({ requestedOutcome: task?.requestedOutcome, messages: task?.messages });
  const execution = await run({ prompt, sandbox: "read-only", approvalPolicy: "never", networkAccess: false });
  const parsed = parseCodexQuestionEvents(execution?.stdout);
  if (execution?.exitCode !== 0 || !parsed.completed || parsed.finalText.length < 32) throw new Error("question-model-incomplete");
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

export async function probeQuestionModel({ findCli = findInstalledCodexCli } = {}) {
  const executable = await findCli();
  return {
    verified: true,
    summary: "The transient read-only question model is available.",
    providerHealth: { availability: "healthy", provider: "primary-codex-question", executable: path.basename(executable) },
  };
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

function boundedText(value, maximum, code) {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > maximum || /\u0000/.test(value)) throw new TypeError(code);
  return value.trim();
}
function receiptSummary(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 512);
}
function nonnegativeInteger(value) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : 0; }
