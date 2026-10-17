import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ExecutionDurableObject } from "../deploy/cloudflare-execution-runtime/worker";

const stub = env.EXECUTION_DO.getByName("owner-work-evidence-test");
const ownerA = "owner-a@example.com";
const ownerB = "owner-b@example.com";
const digest = async (value: string) => Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  byte => byte.toString(16).padStart(2, "0"),
).join("");
const post = (type: string, payload: Record<string, unknown>, who: string) =>
  stub.fetch("https://execution.example/api/native/bridge", {
    method: "POST",
    headers: { "content-type": "application/json", "x-mahoraga-verified-owner": who,
      "x-mahoraga-verified-nonce": crypto.randomUUID() },
    body: JSON.stringify({ type, payload }),
  });

describe("owner-scoped cloud work snapshot", () => {
  it("counts real persisted owner turns and never reports other owners or unsupported mutation", async () => {
    const [a, b] = await Promise.all([digest(ownerA), digest(ownerB)]);
    await post("conversations", {}, ownerA); // Initialize SQL.
    await runInDurableObject<ExecutionDurableObject, void>(stub, instance => {
      const now = Date.now();
      for (const [conversationId, ownerIdHash, state] of [
        ["owner-a-work", a, "PENDING"], ["owner-a-done", a, "SUCCESS"],
        ["owner-a-failed", a, "FAILED"], ["owner-b-secret", b, "SUCCESS"],
      ] as const) {
        instance.storage.saveConversation({id:conversationId,ownerIdHash,createdAt:now,updatedAt:now});
        instance.storage.saveTurn({
          id: "turn-"+conversationId, conversationId, requestDigest:"bounded",
          responseDigest: null, sourceSHA:env.TARGET_SHA, providerId:"test-deterministic",
          costClass:"deterministic", creditPolicy:"zero-codex", status:state,
          errorCode:state==="FAILED"?"task-failed":null,
          contentIdUser:"user-"+conversationId,contentIdAssistant:state==="PENDING"?null:"answer-"+conversationId,
          createdAt:now,completedAt:state==="PENDING"?null:now,
        });
      }
    });
    const first = await post("operations-snapshot", {}, ownerA);
    expect(first.status).toBe(200);
    const aValue=await first.json() as Record<string,any>;
    expect(aValue.observationScope).toBe("owner-cloud-turns");
    expect(aValue.tasks).toMatchObject({active:1,completed:1,failed:1});
    expect(aValue.cloudEvidence).toMatchObject({ownerScoped:true,mutationActionsSupported:false});
    expect(aValue.cloudEvidence.unknown).toContain("workers");
    expect(aValue.repository.cleanState).toBe("deployment-provenance-only");
    expect(aValue.verification.exactHeadSha).toBeNull();
    expect(aValue.latestAuthorityDecision).toBeNull();
    const second=await post("operations-snapshot",{},ownerB);
    expect((await second.json() as any).tasks).toMatchObject({active:0,completed:1,failed:0});
    const unseen=await post("operations-snapshot",{},"unknown-owner@example.com");
    expect((await unseen.json() as any).tasks).toMatchObject({active:0,completed:0,failed:0});
    const invalid=await post("operations-snapshot",{ownerHash:b},ownerA);
    expect(invalid.status).toBe(400);
    const mutation=await post("operations-action",{actionId:"repair.request",idempotencyKey:"test"},ownerA);
    expect(mutation.status).not.toBe(200);
  });
});
