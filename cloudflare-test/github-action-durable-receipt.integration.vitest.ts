import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ExecutionDurableObject } from "../deploy/cloudflare-execution-runtime/worker";

const stub = env.EXECUTION_DO.getByName("github-action-durable-receipt-test");
const owner = "receipt-owner@example.com";
const sha = "a".repeat(40);
const digest = async (value: string) => Array.from(new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
), byte => byte.toString(16).padStart(2,"0")).join("");

const post = (type: string, payload: Record<string, unknown>, who = owner) =>
  stub.fetch("https://execution.example/api/native/bridge", {
    method: "POST",
    headers: { "content-type": "application/json", "x-mahoraga-verified-owner": who,
      "x-mahoraga-verified-nonce": crypto.randomUUID() },
    body: JSON.stringify({ type, payload }),
  });

describe("native GitHub App result survives a real Durable Object storage roundtrip", () => {
  it("returns only the bounded receipt for an authenticated owner and never changes historical metadata", async () => {
    const conversationId = "github-receipt-conversation-1";
    const ownerHash = await digest(owner);
    const now = Date.now();
    const githubReceipt = {
      action: "create", kind: "pull-request" as const,
      number: 1148, headSha: sha, outcome: "accepted" as const,
    };
    await post("tasks", { conversationId }); // Initializes SQLite schema.
    await runInDurableObject<ExecutionDurableObject, void>(stub, instance => {
      instance.storage.saveConversation({
        id: conversationId, ownerIdHash: ownerHash, createdAt: now, updatedAt: now,
      });
      instance.storage.saveTurn({
        id: "github-result-turn-1", conversationId, requestDigest: "safe", responseDigest: null,
        sourceSHA: sha, providerId: "mahoraga-native-github-pr-create", costClass: "deterministic",
        creditPolicy: "zero-codex", status: "SUCCESS", errorCode: null, githubReceipt,
        contentIdUser: "test-user", contentIdAssistant: "test-assistant",
        createdAt: now, completedAt: now,
      });
    });
    for (let repeat=0;repeat<2;repeat++) {
      const res = await post("tasks", { conversationId });
      expect(res.status).toBe(200);
      const body = await res.json() as { tasks: Array<{executionReceipt:Record<string,unknown>}> };
      expect(body.tasks).toHaveLength(1);
      expect(body.tasks[0]?.executionReceipt.githubActionReceipt).toEqual(githubReceipt);
      expect(body.tasks[0]?.executionReceipt.sourceSHA).toEqual(sha);
      expect(JSON.stringify(body)).not.toMatch(/secret|prompt|token|private title/);
    }
    expect((await post("tasks", { conversationId }, "foreign@example.com")).status).toBe(404);
    await runInDurableObject<ExecutionDurableObject, void>(stub, (_instance, state) => {
      const row = state.storage.sql.exec<{ github_receipt: string }>(
        "SELECT github_receipt FROM turns WHERE id = ?", "github-result-turn-1",
      ).one();
      expect(JSON.parse(row.github_receipt)).toEqual(githubReceipt);
    });
  });
});
