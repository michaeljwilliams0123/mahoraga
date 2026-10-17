import type { AssistantTurnRecord } from "./storage";
import type { EncryptedContentRecord } from "./content-vault";

export type PersistedResultObservation = "matched" | "missing" | "mismatch" | "not-observed";

/**
 * Observe that the same live Durable Object storage contains the recorded
 * encrypted assistant result for this completed turn.
 * This is NOT an independent execution, replay, decrypt, or authority proof.
 */
export function observePersistedTurnResult(
  turn: Pick<AssistantTurnRecord, "status" | "conversationId" | "contentIdAssistant" | "responseDigest">,
  read: (contentId: string) => Pick<EncryptedContentRecord,
    "contentId" | "conversationId" | "role" | "contentHash"> | null,
): PersistedResultObservation {
  if (turn.status !== "SUCCESS" || !turn.contentIdAssistant || !/^[A-Za-z0-9_-]{43}$/.test(turn.responseDigest ?? "")) {
    return "not-observed";
  }
  let stored: ReturnType<typeof read>;
  try { stored = read(turn.contentIdAssistant); }
  catch { return "not-observed"; }
  if (!stored) return "missing";
  return stored.contentId === turn.contentIdAssistant
    && stored.conversationId === turn.conversationId
    && stored.role === "assistant"
    && stored.contentHash === turn.responseDigest
    ? "matched" : "mismatch";
}
