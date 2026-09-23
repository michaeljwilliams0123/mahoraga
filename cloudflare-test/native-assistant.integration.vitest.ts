import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setProviderInvokerForTest } from "../deploy/cloudflare-execution-runtime/provider-invoker";
import worker, { type ExecutionDurableObject } from "../deploy/cloudflare-execution-runtime/worker";

const stub = env.EXECUTION_DO.getByName("native-assistant-test");
const owner = "owner@example.com";
const post = (type: string, payload: Record<string, unknown>, who = owner) => stub.fetch("https://execution.example/api/native/bridge", {
  method: "POST", headers: { "content-type": "application/json", "x-mahoraga-verified-owner": who, "x-mahoraga-verified-nonce": crypto.randomUUID() }, body: JSON.stringify({ type, payload }),
});

afterEach(() => setProviderInvokerForTest(null));

describe("native assistant bridge", () => {
  it("requires a signed gateway assertion at the public Worker boundary", async () => {
    const response = await worker.fetch(new Request("https://execution.example/api/native/bridge", { method: "POST", body: JSON.stringify({ type: "chat", payload: {} }) }), {
      ...env, OWNER_GATEWAY_SECRET: "a".repeat(64),
    });
    expect(response.status).toBe(403);
  });

  it("binds the gateway signature to the exact body and expires it", async () => {
    const secret = "a".repeat(64);
    const body = JSON.stringify({ type: "tasks", payload: { conversationId: "missing" } });
    const timestamp = String(Date.now()); const nonce = crypto.randomUUID();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${owner}\n${timestamp}\n${nonce}\n${digest}`))), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const headers = { "x-mahoraga-owner": owner, "x-mahoraga-owner-timestamp": timestamp, "x-mahoraga-owner-nonce": nonce, "x-mahoraga-owner-signature": signature };
    const runtimeEnv = { ...env, OWNER_GATEWAY_SECRET: secret };
    expect((await worker.fetch(new Request("https://execution.example/api/native/bridge", { method: "POST", headers, body }), runtimeEnv)).status).toBe(404);
    expect((await worker.fetch(new Request("https://execution.example/api/native/bridge", { method: "POST", headers, body: body.replace("missing", "changed") }), runtimeEnv)).status).toBe(403);
    expect((await worker.fetch(new Request("https://execution.example/api/native/bridge", { method: "POST", headers: { ...headers, "x-mahoraga-owner-timestamp": String(Date.now() - 120_000) }, body }), runtimeEnv)).status).toBe(403);
  });

  it("rejects an identical signed assertion replay before a second provider invocation", async () => {
    const secret = "a".repeat(64);
    const body = JSON.stringify({ type: "chat", payload: { conversationId: "signed-replay", content: "Answer once", mode: "auto", creditPolicy: "zero-codex", idempotencyKey: "signed-replay-turn" } });
    const timestamp = String(Date.now()); const nonce = crypto.randomUUID();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${owner}\n${timestamp}\n${nonce}\n${digest}`))), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const headers = { "x-mahoraga-owner": owner, "x-mahoraga-owner-timestamp": timestamp, "x-mahoraga-owner-nonce": nonce, "x-mahoraga-owner-signature": signature };
    const runtimeEnv = { ...env, OWNER_GATEWAY_SECRET: secret };
    const publicStub = env.EXECUTION_DO.getByName("execution-v1");
    await publicStub.fetch("https://execution.example/api/ready");
    await runInDurableObject<ExecutionDurableObject, void>(publicStub, (instance) => {
      instance.storage.saveProviderState({ providerId: "cloudflare-workers-ai", available: true, zeroCreditEligible: true, reasonCode: null, observedAt: Date.now(), verifiedAt: Date.now(), canaryExpiresAt: Date.now() + 60_000 });
    });
    const run = vi.fn().mockResolvedValue({ response: "One answer." }); setProviderInvokerForTest(run);
    const first = await worker.fetch(new Request("https://execution.example/api/native/bridge", { method: "POST", headers, body }), runtimeEnv);
    expect(first.status).toBe(200);
    const replay = await worker.fetch(new Request("https://execution.example/api/native/bridge", { method: "POST", headers, body }), runtimeEnv);
    expect(replay.status).toBe(409);
    expect((await replay.json() as { error: string }).error).toBe("gateway-assertion-replayed");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("rejects unavailable zero credit and unconfigured licensed inference without invoking a provider", async () => {
    const run = vi.fn(); setProviderInvokerForTest(run);
    const input = { content: "What is the status?", mode: "auto", creditPolicy: "zero-codex", idempotencyKey: "missing-evidence" };
    const zero = await post("chat", input);
    expect(zero.status).toBe(503);
    expect((await zero.json() as { error: string }).error).toBe("zero-credit-provider-unavailable");
    const licensed = await post("chat", { ...input, creditPolicy: "licensed-approved" });
    expect(licensed.status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });

  it("persists encrypted turns, replays once, and enforces conversation ownership", async () => {
    await stub.fetch("https://execution.example/api/ready");
    await runInDurableObject<ExecutionDurableObject, void>(stub, (instance) => {
      instance.storage.saveProviderState({ providerId: "cloudflare-workers-ai", available: true, zeroCreditEligible: true, reasonCode: null, observedAt: Date.now(), verifiedAt: Date.now(), canaryExpiresAt: Date.now() + 60_000 });
    });
    const run = vi.fn().mockResolvedValue({ response: "The answer is 42." }); setProviderInvokerForTest(run);
    const payload = { conversationId: "native-conversation", content: "Question with a private detail", mode: "auto", creditPolicy: "zero-codex", idempotencyKey: "native-once" };
    const first = await post("chat", payload);
    expect(first.status).toBe(200);
    const replay = await post("chat", payload);
    expect(await replay.json()).toEqual(await first.json());
    expect(run).toHaveBeenCalledTimes(1);
    expect((await post("chat", { ...payload, content: "different" })).status).toBe(409);
    expect((await post("messages", { conversationId: payload.conversationId }, "intruder@example.com")).status).toBe(404);
    const messages = await (await post("messages", { conversationId: payload.conversationId })).json() as { messages: Array<{ id: string; contentReference: string; role: string }> };
    expect(messages.messages).toHaveLength(2);
    const assistant = messages.messages[1]!;
    const answer = await (await post("message-content", { conversationId: payload.conversationId, messageId: assistant.id, contentReference: assistant.contentReference })).json();
    expect(answer).toEqual({ content: "The answer is 42." });
    const tasks = await (await post("tasks", { conversationId: payload.conversationId })).json() as { tasks: Array<{ status: string }> };
    expect(tasks.tasks[0]?.status).toBe("completed");
    await runInDurableObject<ExecutionDurableObject, void>(stub, (_instance, state) => {
      const rows = state.storage.sql.exec<{ ciphertext: string }>("SELECT ciphertext FROM conversation_content").toArray();
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => !row.ciphertext.includes("Question") && !row.ciphertext.includes("answer"))).toBe(true);
    });
  });
});
