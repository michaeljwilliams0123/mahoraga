/** Transport failures can hide completed native commands. Retry only the same logical request. */
export type PendingChatRetry = Readonly<{
  idempotencyKey: string;
  conversationId: string;
  text: string;
  mode: "auto" | "ask" | "act";
  creditPolicy: "zero-codex" | "licensed-approved";
}>;

const MAYBE_DELIVERED = new Set([
  "cloud-session-unreachable",
  "relay-request-timeout",
  "relay-disconnected",
  "cloud-runtime-degraded",
  "cloud-gateway-unavailable",
]);

export function ambiguousTransportFailure(reason: unknown): boolean {
  return typeof reason === "string" && MAYBE_DELIVERED.has(reason);
}

export function prepareChatRetry(payload: PendingChatRetry): PendingChatRetry {
  if (!/^workspace-[a-f0-9-]{36}$/i.test(payload.idempotencyKey)
    || !payload.conversationId.trim() || payload.conversationId.length > 200
    || !payload.text.trim() || payload.text.length > 8_000) {
    throw new Error("chat-retry-identity-invalid");
  }
  return Object.freeze({ ...payload });
}
