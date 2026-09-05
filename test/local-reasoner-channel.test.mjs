import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  admitLocalReasonerExecution,
  isTransientChannelOpen,
  listTransientResults,
  openTransientResultChannel,
  putTransientResult,
} from "../src/local-reasoner-channel.mjs";
import { localReasonerExecutionBoundary } from "../src/local-reasoner-provider.mjs";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");
const DIGEST = createHash("sha256").update("credit-free-result").digest("hex");

test("default local-reasoner execution stays disabled until a transient channel exists", () => {
  assert.deepEqual(localReasonerExecutionBoundary(), {
    executionEnabled: false,
    reason: "transient-result-channel-required",
    promptPersistenceAllowed: false,
    responsePersistenceAllowed: false,
  });
  assert.equal(admitLocalReasonerExecution({ verified: true }).executionEnabled, false);
  assert.equal(admitLocalReasonerExecution({ verified: true }).reason, "transient-result-channel-required");
  assert.equal(admitLocalReasonerExecution({ verified: false, channel: openTransientResultChannel({ now: NOW }) }).reason, "local-reasoner-not-ready");
});

test("a live local reasoner plus an open memory-only channel admits execution at $0", () => {
  const channel = openTransientResultChannel({ ttlMs: 15_000, now: NOW });
  assert.equal(channel.persistence, "memory-only");
  assert.equal(channel.promptPersistenceAllowed, false);
  assert.equal(channel.responsePersistenceAllowed, false);
  assert.equal(channel.creditCost, 0);
  assert.equal(channel.paidFallback, false);
  assert.equal(isTransientChannelOpen(channel, NOW + 1_000), true);

  const admitted = admitLocalReasonerExecution({ verified: true, channel, now: NOW + 1_000 });
  assert.equal(admitted.executionEnabled, true);
  assert.equal(admitted.reason, "transient-result-channel-open");
  assert.equal(admitted.promptPersistenceAllowed, false);
  assert.equal(admitted.responsePersistenceAllowed, false);
  assert.equal(admitted.creditCost, 0);
  assert.equal(admitted.paidFallback, false);
  assert.equal(admitted.channelId, channel.id);
});

test("expired or content-bearing channels never admit execution", () => {
  const channel = openTransientResultChannel({ ttlMs: 250, now: NOW });
  assert.equal(isTransientChannelOpen(channel, NOW + 251), false);
  assert.equal(admitLocalReasonerExecution({ verified: true, channel, now: NOW + 251 }).reason, "transient-result-channel-required");

  const contaminated = { ...channel, promptPersistenceAllowed: true };
  assert.equal(isTransientChannelOpen(contaminated, NOW), false);
});

test("transient results store only status and digest, never prompts or model output", () => {
  const channel = openTransientResultChannel({ now: NOW });
  const stored = putTransientResult(channel, { status: "ok", resultSha256: DIGEST }, { now: NOW + 10 });
  assert.equal(stored.creditCost, 0);
  assert.equal(stored.paidFallback, false);
  assert.equal(stored.resultSha256, DIGEST);
  assert.equal(JSON.stringify(stored).includes("prompt"), false);

  assert.throws(
    () => putTransientResult(channel, { status: "ok", resultSha256: DIGEST, prompt: "secret" }, { now: NOW + 20 }),
    /transient-result-content-forbidden/,
  );
  assert.equal(listTransientResults(channel, NOW + 30).length, 1);
});
