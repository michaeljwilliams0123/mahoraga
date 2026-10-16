/** Transport failures can hide completed work. Retry only the same logical objective. */
export type PendingChatRetry = Readonly<{
  idempotencyKey: string; conversationId: string | null; text: string;
  mode: "auto" | "ask" | "act"; creditPolicy: "zero-codex" | "licensed-approved";
}>;
const MAYBE_DELIVERED = new Set(["cloud-session-unreachable", "relay-request-timeout",
  "relay-disconnected", "cloud-runtime-degraded", "cloud-gateway-unavailable"]);
export function ambiguousTransportFailure(reason: unknown): boolean {
  return typeof reason === "string" && MAYBE_DELIVERED.has(reason);
}
export function prepareChatRetry(payload: PendingChatRetry): PendingChatRetry {
  if (!/^workspace-[a-f0-9-]{36}$/i.test(payload.idempotencyKey) || !payload.text.trim())
    throw new Error("chat-retry-identity-invalid");
  return Object.freeze({ ...payload });
}
