import { describe, expect, it } from "vitest";
import { observePersistedTurnResult } from "../deploy/cloudflare-execution-runtime/turn-storage-observation";

const turn = {
  id: "turn-1", conversationId: "conversation-1", status: "SUCCESS" as const,
  contentIdAssistant: "assistant-1", responseDigest: "a".repeat(64),
};
const matching = { contentId: "assistant-1", conversationId: "conversation-1",
  role: "assistant" as const, contentHash: "a".repeat(64) };

describe("per-turn encrypted-result storage observation", () => {
  it("confirms only an exact task-owned encrypted content record", () => {
    expect(observePersistedTurnResult(turn, () => matching)).toBe("matched");
    expect(observePersistedTurnResult(turn, () => null)).toBe("missing");
    expect(observePersistedTurnResult(turn, () => { throw new Error("private-read-failure"); })).toBe("not-observed");
    expect(observePersistedTurnResult(turn, () => ({ ...matching, contentHash: "b".repeat(64) }))).toBe("mismatch");
    expect(observePersistedTurnResult(turn, () => ({ ...matching, conversationId: "other" }))).toBe("mismatch");
    expect(observePersistedTurnResult(turn, () => ({ ...matching, role: "user" }))).toBe("mismatch");
    expect(observePersistedTurnResult(turn, () => ({ ...matching, contentId: "other" }))).toBe("mismatch");
  });
  it("does not claim result persistence for pending/failed/legacy turns", () => {
    expect(observePersistedTurnResult({ ...turn, status: "FAILED" }, () => matching)).toBe("not-observed");
    expect(observePersistedTurnResult({ ...turn, contentIdAssistant: null }, () => matching)).toBe("not-observed");
    expect(observePersistedTurnResult({ ...turn, responseDigest: null }, () => matching)).toBe("not-observed");
    expect(observePersistedTurnResult({ ...turn, responseDigest: "bad" }, () => matching)).toBe("not-observed");
  });
  it("does not materialize plaintext or disclose raw digests in the status", () => {
    const observation = observePersistedTurnResult(turn, () => ({
      ...matching, ciphertext: "secret", iv: "secret", contentHash: "a".repeat(64),
    }));
    expect(observation).toBe("matched");
    expect(JSON.stringify(observation)).not.toContain("secret");
    expect(JSON.stringify(observation)).not.toContain("aaaa");
  });
});
