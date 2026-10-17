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

  it("executes canonical prediction in the deterministic lane without invoking the answer provider", async () => {
    const run = vi.fn(); setProviderInvokerForTest(run);
    const conversationId = "predictive-cloud-native";
    const response = await post("chat", { conversationId, content: '/predict {"observedState":{"load":4},"stateUncertainty":0.2,"action":{"actionId":"add-capacity","effects":{"load":-2},"uncertainty":0.1}}', mode: "auto", creditPolicy: "zero-codex", idempotencyKey: "predictive-cloud-native-turn" });
    expect(response.status).toBe(200);
    expect((await response.json() as { task: { capability: string } }).task.capability).toBe("cognitive.predict");
    const tasks = await (await post("tasks", { conversationId })).json() as { tasks: Array<{ capability: string }> };
    expect(tasks.tasks[0]?.capability).toBe("cognitive.predict");
    const messages = await (await post("messages", { conversationId })).json() as { messages: Array<{ id: string; contentReference: string }> };
    const assistant = messages.messages[1]!;
    const content = await (await post("message-content", { conversationId, messageId: assistant.id, contentReference: assistant.contentReference })).json() as { content: string };
    expect(content.content).toContain('"predictedState"');
    expect(content.content).toContain('"load": 2');
    expect(run).not.toHaveBeenCalled();
  });

  it("returns execution-time source metadata in task history and replays without restamping historical turns", async () => {
    const conversationId = "source-provenance";
    const payload = { conversationId, content: '/predict {"observedState":{"load":4},"stateUncertainty":0.2,"action":{"actionId":"capacity","effects":{"load":-2},"uncertainty":0.1}}', mode: "ask", creditPolicy: "zero-codex", idempotencyKey: "source-provenance-key" };
    const first = await (await post("chat", payload)).json() as { task: { id: string }; executionReceipt: { sourceSHA?: string | null } };
    expect(first.executionReceipt.sourceSHA).toBe(env.TARGET_SHA);
    const read = async () => (await (await post("tasks", { conversationId })).json() as { tasks: Array<{ executionReceipt: { sourceSHA?: string | null } }> }).tasks[0]!.executionReceipt.sourceSHA;
    expect(await read()).toBe(env.TARGET_SHA);
    // Model a turn produced by an older deployment, then an unprovenanced legacy turn.
    for (const source of ["b".repeat(40), null]) {
      await runInDurableObject<ExecutionDurableObject, void>(stub, (_instance, state) => {
        state.storage.sql.exec("UPDATE turns SET source_sha = ? WHERE id = ?", source, first.task.id);
      });
      const replay = await (await post("chat", payload)).json() as { executionReceipt: { sourceSHA?: string | null } };
      expect(replay.executionReceipt.sourceSHA).toBe(source);
      expect(await read()).toBe(source);
    }
  });

  it("replays a recorded GitHub App result on the same owner task without another external call", async () => {
    const conversationId = "github-admin-receipt-replay";
    const key = "github-admin-receipt-replay-key";
    const message = "/repo admin status";
    const hash = async (value: string) => Array.from(new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
    ), byte => byte.toString(16).padStart(2, "0")).join("");
    const ownerHash = await hash(owner);
    const id = await hash(ownerHash + "\n" + key);
    const requestDigest = await hash(ownerHash + "\n" + conversationId + "\n" + message);
    const githubReceipt = { action: "status", kind: "repository" as const,
      mainSha: env.TARGET_SHA, outcome: "observed" as const };
    await post("tasks", { conversationId });
    await runInDurableObject<ExecutionDurableObject, void>(stub, instance => {
      instance.storage.saveConversation({ id: conversationId, ownerIdHash: ownerHash, createdAt: 1, updatedAt: 2 });
      instance.storage.saveTurn({ id, conversationId, requestDigest, responseDigest: null,
        sourceSHA: env.TARGET_SHA, providerId: "mahoraga-native-github-admin-status",
        costClass: "deterministic", creditPolicy: "zero-codex", status: "SUCCESS",
        githubReceipt, errorCode: null, contentIdUser: "test-user", contentIdAssistant: "test-answer",
        createdAt: 1, completedAt: 2 });
    });
    for (let attempt=0; attempt<2;attempt++) {
      const response = await post("chat", { conversationId, content: message, mode: "ask",
        creditPolicy: "zero-codex", idempotencyKey: key });
      expect(response.status).toBe(200);
      const json = await response.json() as { executionReceipt: { githubActionReceipt: unknown } };
      expect(json.executionReceipt.githubActionReceipt).toEqual(githubReceipt);
    }
    const tasks = await (await post("tasks", { conversationId })).json() as {
      tasks: Array<{ executionReceipt: { githubActionReceipt: unknown } }>;
    };
    expect(tasks.tasks[0]?.executionReceipt.githubActionReceipt).toEqual(githubReceipt);
  });

  it.each([
    ["assistant", "Earlier question", "cloudflare-workers-ai", "SUCCESS"],
    ["inspect", "/repo inspect", "mahoraga-native-github-inspect", "SUCCESS"],
    ["source", "/repo file AGENTS.md", "mahoraga-native-github-source", "SUCCESS"],
    ["admin", "/repo admin status", "mahoraga-native-github-admin-status", "SUCCESS"],
    ["failure", "/repo admin status", "mahoraga-native-github-admin-status", "FAILED"],
  ] as const)("preserves historical and unknown source on %s replay", async (name, content, providerId, status) => {
    const run = vi.fn(); setProviderInvokerForTest(run);
    const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, "0")).join("");
    const ownerHash = await digest(owner);
    for (const sourceSHA of ["b".repeat(40), null]) {
      const conversationId = `historical-${name}-${sourceSHA ? "known" : "unknown"}`;
      const key = `${conversationId}-key`;
      const id = await digest(`${ownerHash}\n${key}`);
      const requestDigest = await digest(`${ownerHash}\n${conversationId}\n${content}`);
      await runInDurableObject<ExecutionDurableObject, void>(stub, instance => {
        instance.storage.saveConversation({ id: conversationId, ownerIdHash: ownerHash, createdAt: 1, updatedAt: 2 });
        instance.storage.saveTurn({ id, conversationId, requestDigest, sourceSHA, responseDigest: "response", providerId,
          costClass: providerId === "cloudflare-workers-ai" ? "cloud-open-weight" : "deterministic", creditPolicy: "zero-codex",
          status, errorCode: status === "FAILED" ? "github-native-credentials-unavailable" : null,
          contentIdUser: "user", contentIdAssistant: "assistant", createdAt: 1, completedAt: 2 });
      });
      const replay = await post("chat", { conversationId, content, mode: "ask", creditPolicy: "zero-codex", idempotencyKey: key });
      expect(replay.status).toBe(200);
      expect(await replay.json()).toMatchObject({ task: { id, status: status === "SUCCESS" ? "completed" : "failed" }, executionReceipt: { sourceSHA } });
      const tasks = await (await post("tasks", { conversationId })).json();
      expect(tasks).toMatchObject({ tasks: [{ id, executionReceipt: { sourceSHA } }] });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("runs the canonical collective cognitive cycle as a receipt-only deterministic task", async () => {
    const run = vi.fn(); setProviderInvokerForTest(run);
    const input = {
      members: [{ individualId: "builder", parentAgentId: "mahoraga-core", displayName: "Builder", archetype: "builder-mind", perspective: "implementation", communicationStyle: "evidence-first", traits: { curiosity: 0.7 }, epistemicPosture: { evidenceThreshold: 0.8, uncertaintyTolerance: 0.4, dissentDisposition: "surface-material-dissent" }, perspectiveTags: ["engineering"], privateEpisodicRefs: [] }],
      requiredPerspectiveTags: ["engineering"], positions: [{ individualId: "builder", conclusion: "hold", confidence: 0.8, evidenceRefs: ["owner:scenario"], assumptions: [], unknowns: [], dissentTags: [] }],
      metacognition: { evidenceCoverage: 0.9, calibratedConfidence: 0.8, knownUnknowns: [], materialConflictCount: 0, reversible: true },
      observedState: { queueDepth: 4 }, stateUncertainty: 0.2, proposedAction: { actionId: "add-capacity", effects: { queueDepth: -2 }, uncertainty: 0.1 },
      plannerSnapshot: { workers: [], activeLeases: [], taskCounts: {}, objectives: [], repository: { verified: true }, providers: [] },
    };
    const response = await post("chat", { conversationId: "cycle-cloud-native", content: `/cycle ${JSON.stringify(input)}`, mode: "auto", creditPolicy: "zero-codex", idempotencyKey: "cycle-cloud-native-turn" });
    expect(response.status).toBe(200);
    expect((await response.json() as { task: { capability: string } }).task.capability).toBe("cognitive.cycle");
    expect(run).not.toHaveBeenCalled();
    await runInDurableObject<ExecutionDurableObject, void>(stub, (_instance, state) => {
      const memories = state.storage.sql.exec<{ id: string; payload: string }>("SELECT id,payload FROM memory_index_outbox").toArray();
      expect(memories.some((memory) => JSON.parse(memory.payload).kind === "lesson")).toBe(true);
      for (const memory of memories) expect(new TextEncoder().encode(memory.id).byteLength).toBeLessThanOrEqual(64);
    });
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
    const firstResult = await first.json();
    expect(firstResult).toMatchObject({ executionReceipt: { sourceSHA: env.TARGET_SHA } });
    expect(await replay.json()).toEqual(firstResult);
    expect(run).toHaveBeenCalledTimes(1);
    expect((await post("chat", { ...payload, content: "different" })).status).toBe(409);
    expect((await post("messages", { conversationId: payload.conversationId }, "intruder@example.com")).status).toBe(404);
    const messages = await (await post("messages", { conversationId: payload.conversationId })).json() as { messages: Array<{ id: string; contentReference: string; role: string }> };
    expect(messages.messages).toHaveLength(2);
    const assistant = messages.messages[1]!;
    const answer = await (await post("message-content", { conversationId: payload.conversationId, messageId: assistant.id, contentReference: assistant.contentReference })).json();
    expect(answer).toEqual({ content: "The answer is 42." });
    const tasks = await (await post("tasks", { conversationId: payload.conversationId })).json() as { tasks: Array<{ status: string; executionReceipt: { persistedResultObservation?: string } }> };
    expect(tasks.tasks[0]?.status).toBe("completed");
    expect(tasks.tasks[0]?.executionReceipt.persistedResultObservation).toBe("matched");
    await runInDurableObject<ExecutionDurableObject, void>(stub, (_instance, state) => {
      const rows = state.storage.sql.exec<{ ciphertext: string }>("SELECT ciphertext FROM conversation_content WHERE conversation_id = ?", payload.conversationId).toArray();
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => !row.ciphertext.includes("Question") && !row.ciphertext.includes("answer"))).toBe(true);
    });
  });

  it("persists and replays a failed native GitHub administration turn across reconnect", async () => {
    const failedStub = env.EXECUTION_DO.getByName("native-github-failure-reconnect");
    const failedPost = (type: string, payload: Record<string, unknown>) => failedStub.fetch("https://execution.example/api/native/bridge", {
      method: "POST",
      headers: { "content-type": "application/json", "x-mahoraga-verified-owner": owner, "x-mahoraga-verified-nonce": crypto.randomUUID() },
      body: JSON.stringify({ type, payload }),
    });
    await failedStub.fetch("https://execution.example/api/ready");
    const conversationId = "native-github-failed-conversation";
    const payload = {
      conversationId,
      content: '/repo pr checks {"number":1106,"expectedHeadSha":"8754a4bbc9b347a5a7870d8a0eeaa730f11c0952"}',
      mode: "auto",
      creditPolicy: "zero-codex",
      idempotencyKey: "native-github-failed-once",
    };
    const first = await failedPost("chat", payload);
    expect(first.status).toBe(200);
    const firstResult = await first.json() as { task: { status: string; errorCode: string } };
    expect(firstResult).toMatchObject({ executionReceipt: { sourceSHA: env.TARGET_SHA } });
    expect(firstResult.task).toMatchObject({ status: "failed", errorCode: "github-native-credentials-unavailable" });
    expect(await (await failedPost("chat", payload)).json()).toEqual(firstResult);

    const tasks = await (await failedPost("tasks", { conversationId })).json() as { tasks: Array<{ status: string; errorCode: string }> };
    expect(tasks.tasks).toEqual([expect.objectContaining({ status: "failed", errorCode: "github-native-credentials-unavailable" })]);
    const messages = await (await failedPost("messages", { conversationId })).json() as { messages: Array<{ id: string; contentReference: string; role: string }> };
    expect(messages.messages).toHaveLength(2);
    const assistant = messages.messages[1]!;
    const result = await (await failedPost("message-content", { conversationId, messageId: assistant.id, contentReference: assistant.contentReference })).json() as { content: string };
    expect(result.content).toContain("Status: failed");
    expect(result.content).toContain("External action receipt: none");

    const restored = await (await failedPost("conversation-history", { conversationId })).json() as { messages: Array<{ role: string; text: string }> };
    expect(restored.messages.map(({ role }) => role)).toEqual(["user", "assistant"]);
    expect(restored.messages[1]?.text).toContain("github-native-credentials-unavailable");
  });

  it("uses completed turns from the same owner's conversation for follow-up cognition", async () => {
    await stub.fetch("https://execution.example/api/ready");
    await runInDurableObject<ExecutionDurableObject, void>(stub, (instance) => {
      instance.storage.saveProviderState({ providerId: "cloudflare-workers-ai", available: true, zeroCreditEligible: true, reasonCode: null, observedAt: Date.now(), verifiedAt: Date.now(), canaryExpiresAt: Date.now() + 60_000 });
    });
    const run = vi.fn().mockResolvedValueOnce({ response: "The code word is violet." }).mockResolvedValueOnce({ response: "Violet." }).mockResolvedValueOnce({ response: "New conversation." });
    setProviderInvokerForTest(run);
    const base = { conversationId: "recall-conversation", mode: "ask", creditPolicy: "zero-codex" };
    expect((await post("chat", { ...base, content: "Remember the code word violet in this conversation.", idempotencyKey: "recall-first" })).status).toBe(200);
    expect((await post("chat", { ...base, content: "What was the code word?", idempotencyKey: "recall-second" })).status).toBe(200);
    expect(run.mock.calls[1]?.[1].messages).toEqual([
      { role: "user", content: "Remember the code word violet in this conversation." },
      { role: "assistant", content: "The code word is violet." },
      { role: "user", content: "What was the code word?" },
    ]);
    expect((await post("chat", { ...base, conversationId: "separate-conversation", content: "And here?", idempotencyKey: "recall-other" })).status).toBe(200);
    expect(run.mock.calls[2]?.[1].messages).toEqual([{ role: "user", content: "And here?" }]);
    expect((await post("chat", { ...base, content: "Intruder", idempotencyKey: "recall-intruder" }, "intruder@example.com")).status).toBe(404);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("keeps only recent complete turns within the provider input budget", async () => {
    await stub.fetch("https://execution.example/api/ready");
    await runInDurableObject<ExecutionDurableObject, void>(stub, (instance) => {
      instance.storage.saveProviderState({ providerId: "cloudflare-workers-ai", available: true, zeroCreditEligible: true, reasonCode: null, observedAt: Date.now(), verifiedAt: Date.now(), canaryExpiresAt: Date.now() + 60_000 });
    });
    const run = vi.fn().mockResolvedValue({ response: "a".repeat(2100) }); setProviderInvokerForTest(run);
    const base = { conversationId: "bounded-recall", mode: "ask", creditPolicy: "zero-codex" };
    for (let index = 0; index < 5; index += 1) {
      expect((await post("chat", { ...base, content: `Earlier ${index}`, idempotencyKey: `bounded-${index}` })).status).toBe(200);
    }
    expect((await post("chat", { ...base, content: "Latest question", idempotencyKey: "bounded-last" })).status).toBe(200);
    const messages = run.mock.calls[5]?.[1].messages as Array<{ role: string; content: string }>;
    expect(messages.at(-1)).toEqual({ role: "user", content: "Latest question" });
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.length).toBeLessThan(11);
    expect(messages[0]?.content).not.toBe("Earlier 0");
    expect(messages.reduce((total, message) => total + new TextEncoder().encode(message.content).byteLength, 0)).toBeLessThan(8_000);
  });
});
