import { Buffer } from "node:buffer";
import { CopilotStudioClient } from "@microsoft/agents-copilotstudio-client";
import { createCopilotTokenProvider, loadCopilotStudioRuntimeSettings } from "./copilot-studio-auth.mjs";

const ROLES = Object.freeze(new Set([
  "reasoner",
  "researcher",
  "analyst",
  "builder-advisor",
  "validator",
  "workflow-advisor",
]));
const INPUT_KEYS = Object.freeze(["idempotencyKey", "prompt", "role"]);
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_PROMPT_BYTES = 16 * 1024;
const MAX_REPLY_BYTES = 64 * 1024;

export async function invokeCopilotStudioAgent(input, dependencies = {}) {
  validateInput(input);
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  try {
    const settings = loadCopilotStudioRuntimeSettings(dependencies.env ?? process.env);
    const tokenProvider = dependencies.tokenProvider ?? createCopilotTokenProvider(settings, dependencies.authDependencies);
    const token = await tokenProvider.getToken({ allowInteractive: dependencies.allowInteractive !== false });
    const Client = dependencies.CopilotStudioClientCtor ?? CopilotStudioClient;
    const client = new Client(settings.connectionSettings, token);
    let conversationId = "";
    for await (const activity of client.startConversationStreaming({ emitStartConversationEvent: false, locale: "en-US" })) {
      if (typeof activity?.conversation?.id === "string" && activity.conversation.id.trim()) conversationId = activity.conversation.id.trim();
    }
    if (!conversationId) throw safeError("agent-unavailable");

    const replies = [];
    let replyBytes = 0;
    const activity = { type: "message", text: input.prompt, conversation: { id: conversationId } };
    for await (const reply of client.sendActivityStreaming(activity)) {
      if (reply?.type !== "message" || typeof reply.text !== "string" || !reply.text.trim()) continue;
      const text = reply.text.trim();
      replyBytes += Buffer.byteLength(text, "utf8");
      if (replyBytes > MAX_REPLY_BYTES) throw safeError("invalid-contract");
      replies.push(text);
    }
    if (replies.length === 0) throw safeError("agent-unavailable");

    return Object.freeze({
      verified: true,
      responseText: replies.join("\n"),
      providerReceipt: Object.freeze({
        providerClass: "copilot-studio",
        role: input.role,
        replyCount: replies.length,
        latencyMs: boundedLatency(now() - startedAt),
        outcome: "succeeded",
        authenticated: true,
        conversationEstablished: true,
      }),
    });
  } catch (error) {
    throw normalizeError(error);
  }
}
function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw safeError("invalid-contract");
  const keys = Object.keys(input).sort();
  if (keys.length !== INPUT_KEYS.length || keys.some((key, index) => key !== INPUT_KEYS[index])) throw safeError("invalid-contract");
  if (!ROLES.has(input.role)) throw safeError("invalid-contract");
  if (typeof input.prompt !== "string" || !input.prompt.trim() || Buffer.byteLength(input.prompt, "utf8") > MAX_PROMPT_BYTES) throw safeError("invalid-contract");
  if (typeof input.idempotencyKey !== "string" || !IDEMPOTENCY.test(input.idempotencyKey)) throw safeError("invalid-contract");
}

function normalizeError(error) {
  if (["invalid-contract", "authentication-required", "authority-denied", "agent-unavailable", "rate-limited", "transient-provider", "permanent-provider"].includes(error?.code)) return safeError(error.code);
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  if (status === 401) return safeError("authentication-required");
  if (status === 403) return safeError("authority-denied");
  if (status === 429) return safeError("rate-limited");
  if (Number.isInteger(status) && status >= 500 && status <= 599) return safeError("transient-provider");
  if (Number.isInteger(status) && status >= 400 && status <= 499) return safeError("permanent-provider");
  return safeError("transient-provider");
}

function boundedLatency(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 600_000 ? Math.round(number) : 0;
}

function safeError(code) {
  return Object.assign(new Error(code), { code });
}
