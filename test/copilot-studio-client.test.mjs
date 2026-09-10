import test from "node:test";
import assert from "node:assert/strict";
import { invokeCopilotStudioAgent } from "../src/copilot-studio-client.mjs";

const runtimeEnv = Object.freeze({
  MAHORAGA_COPILOT_DIRECT_CONNECT_URL: "https://runtime.example/direct",
  MAHORAGA_COPILOT_TENANT_ID: "tenant-runtime",
  MAHORAGA_COPILOT_APP_CLIENT_ID: "client-runtime",
});

class FakeCopilotStudioClient {
  constructor(settings, token) { this.settings = settings; this.token = token; }
  async *startConversationStreaming() { yield { type: "event", conversation: { id: "conv-1" } }; }
  async *sendActivityStreaming(activity) {
    assert.equal(activity.text, "MAHORAGA-LINK-HEALTH");
    assert.equal(activity.conversation.id, "conv-1");
    yield { type: "typing" };
    yield { type: "message", text: "HANDSHAKE-ACK | General Mahoraga" };
  }
}

test("direct Copilot Studio client returns response privately and bounded receipt metadata", async () => {
  const result = await invokeCopilotStudioAgent({ role: "reasoner", prompt: "MAHORAGA-LINK-HEALTH", idempotencyKey: "health-1" }, {
    env: runtimeEnv,
    tokenProvider: { getToken: async ({ allowInteractive }) => { assert.equal(allowInteractive, true); return "short-lived-token"; } },
    CopilotStudioClientCtor: FakeCopilotStudioClient,
    now: (() => { let n = 1000; return () => n += 25; })(),
  });
  assert.equal(result.verified, true);
  assert.equal(result.responseText, "HANDSHAKE-ACK | General Mahoraga");
  assert.equal(result.providerReceipt.role, "reasoner");
  assert.equal(result.providerReceipt.replyCount, 1);
  for (const forbidden of ["HANDSHAKE-ACK", "short-lived-token", "tenant-runtime", "client-runtime", "runtime.example", "conv-1"]) assert.equal(JSON.stringify(result.providerReceipt).includes(forbidden), false);
});
test("direct Copilot Studio client rejects caller-selected recipients, endpoints, agents, and shell fields", async () => {
  const invalid = [
    { role: "unknown", prompt: "hello", idempotencyKey: "x-1" },
    { role: "reasoner", prompt: "hello", idempotencyKey: "x-2", recipientId: "person" },
    { role: "reasoner", prompt: "hello", idempotencyKey: "x-3", agentId: "guid" },
    { role: "reasoner", prompt: "hello", idempotencyKey: "x-4", url: "https://example.com" },
    { role: "reasoner", prompt: "hello", idempotencyKey: "x-5", shell: "cmd.exe" },
  ];
  for (const input of invalid) {
    let called = false;
    await assert.rejects(() => invokeCopilotStudioAgent(input, {
      env: runtimeEnv,
      tokenProvider: { getToken: async () => { called = true; return "token"; } },
      CopilotStudioClientCtor: FakeCopilotStudioClient,
    }), /invalid-contract/);
    assert.equal(called, false);
  }
});

test("direct Copilot Studio client normalizes provider failures without leaking provider text", async () => {
  class RateLimitedClient {
    async *startConversationStreaming() { const error = new Error("secret provider detail"); error.status = 429; throw error; }
  }
  await assert.rejects(() => invokeCopilotStudioAgent(
    { role: "reasoner", prompt: "hello", idempotencyKey: "rate-1" },
    {
      env: runtimeEnv,
      tokenProvider: { getToken: async () => "token" },
      CopilotStudioClientCtor: RateLimitedClient,
    },
  ), (error) => error?.code === "rate-limited" && !String(error?.message).includes("secret"));

  class NoConversationClient {
    async *startConversationStreaming() { yield { type: "event" }; }
  }
  await assert.rejects(() => invokeCopilotStudioAgent(
    { role: "reasoner", prompt: "hello", idempotencyKey: "none-1" },
    { env: runtimeEnv, tokenProvider: { getToken: async () => "token" }, CopilotStudioClientCtor: NoConversationClient },
  ), (error) => error?.code === "agent-unavailable");
});
