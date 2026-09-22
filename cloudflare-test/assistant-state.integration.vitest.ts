import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { type ExecutionDurableObject } from "../deploy/cloudflare-execution-runtime/worker";

const SHA = "7cb8aab1129875f798347afdb2844f963e986a65";

describe("Cloudflare assistant durable state", () => {
  it("persists provider, conversation and turn metadata without plaintext conversation columns", async () => {
    const stub = env.EXECUTION_DO.getByName("assistant-state-roundtrip");
    const ready = await stub.fetch("https://execution.example/api/ready", {
      headers: { "x-target-sha": SHA },
    });
    expect(ready.status).toBe(200);

    await runInDurableObject<ExecutionDurableObject, void>(stub, (instance, state) => {
      instance.storage.saveProviderState({
        providerId: "cloudflare-test-zero",
        available: true,
        zeroCreditEligible: true,
        reasonCode: null,
        observedAt: 1000,
        verifiedAt: 1001,
        canaryExpiresAt: 2000,
      });
      expect(instance.storage.getProviderState("cloudflare-test-zero")).toEqual({
        providerId: "cloudflare-test-zero",
        available: true,
        zeroCreditEligible: true,
        reasonCode: null,
        observedAt: 1000,
        verifiedAt: 1001,
        canaryExpiresAt: 2000,
      });

      instance.storage.saveConversation({
        id: "conversation-1",
        ownerIdHash: "owner-hash",
        createdAt: 1100,
        updatedAt: 1200,
      });
      expect(instance.storage.getConversation("conversation-1")).toEqual({
        id: "conversation-1",
        ownerIdHash: "owner-hash",
        createdAt: 1100,
        updatedAt: 1200,
      });

      instance.storage.saveTurn({
        id: "turn-1",
        conversationId: "conversation-1",
        requestDigest: "request-digest",
        responseDigest: "response-digest",
        providerId: "cloudflare-test-zero",
        costClass: "cloud-open-weight",
        creditPolicy: "zero-codex",
        status: "SUCCESS",
        contentIdUser: "content-user-1",
        contentIdAssistant: "content-assistant-1",
        createdAt: 1300,
        completedAt: 1400,
      });
      expect(instance.storage.getTurn("turn-1")).toEqual({
        id: "turn-1",
        conversationId: "conversation-1",
        requestDigest: "request-digest",
        responseDigest: "response-digest",
        providerId: "cloudflare-test-zero",
        costClass: "cloud-open-weight",
        creditPolicy: "zero-codex",
        status: "SUCCESS",
        contentIdUser: "content-user-1",
        contentIdAssistant: "content-assistant-1",
        createdAt: 1300,
        completedAt: 1400,
      });

      const columns = state.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(turns)")
        .toArray()
        .map((row) => row.name);
      expect(columns).not.toContain("prompt");
      expect(columns).not.toContain("answer");
      expect(columns).not.toContain("message");
      expect(columns).not.toContain("content");
    });
  });

  it("updates provider evidence atomically by provider id", async () => {
    const stub = env.EXECUTION_DO.getByName("assistant-provider-state-upsert");
    await stub.fetch("https://execution.example/api/ready");

    await runInDurableObject<ExecutionDurableObject, void>(stub, (instance) => {
      instance.storage.saveProviderState({
        providerId: "provider-1",
        available: false,
        zeroCreditEligible: false,
        reasonCode: "provider-canary-stale",
        observedAt: 1000,
        verifiedAt: null,
        canaryExpiresAt: null,
      });
      instance.storage.saveProviderState({
        providerId: "provider-1",
        available: true,
        zeroCreditEligible: true,
        reasonCode: null,
        observedAt: 2000,
        verifiedAt: 2000,
        canaryExpiresAt: 3000,
      });

      expect(instance.storage.getProviderState("provider-1")).toMatchObject({
        available: true,
        zeroCreditEligible: true,
        reasonCode: null,
        observedAt: 2000,
        verifiedAt: 2000,
        canaryExpiresAt: 3000,
      });
    });
  });
});
