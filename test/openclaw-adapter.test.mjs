import test from "node:test";
import assert from "node:assert/strict";
import { createOpenClawAdapter } from "../src/openclaw-adapter.mjs";

async function collect(iterable) { const values = []; for await (const value of iterable) values.push(value); return values; }

test("OpenClaw adapter normalizes provider streams and leaves tool authority with Mahoraga", async () => {
  const adapter = createOpenClawAdapter({
    providerId: "openclaw-local",
    async *send() {
      yield { type: "text_delta", text: "Working" };
      yield { type: "tool_call", tool: "repository.inspect", arguments: { depth: 1 } };
      yield { type: "done", usage: { inputTokens: 10, outputTokens: 4 } };
    },
  });
  const events = await collect(adapter.start([{ role: "user", content: "Inspect the repository" }], { dataClass: "synthetic", allowedCapabilityIds: ["repository.inspect"] }));
  assert.deepEqual(events[0], { type: "text-delta", text: "Working", providerId: "openclaw-local" });
  assert.deepEqual(events[1], { type: "tool-request", capabilityId: "repository.inspect", input: { depth: 1 }, authority: "proposal-only", providerId: "openclaw-local" });
  assert.equal(events[2].type, "completed");
});

test("OpenClaw adapter rejects caller transport and undeclared tool proposals", async () => {
  const adapter = createOpenClawAdapter({ providerId: "openclaw-local", async *send() { yield { type: "tool_call", tool: "arbitrary.shell", arguments: {} }; } });
  await assert.rejects(() => collect(adapter.start([{ role: "user", content: "Run work" }], { dataClass: "synthetic", allowedCapabilityIds: ["repository.inspect"], transportUrl: "https://caller.example" })), /openclaw-context-field-unknown/);
  await assert.rejects(() => collect(adapter.start([{ role: "user", content: "Run work" }], { dataClass: "synthetic", allowedCapabilityIds: ["repository.inspect"] })), /openclaw-tool-not-allowed/);
});
