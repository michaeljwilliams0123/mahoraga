import assert from "node:assert/strict";
import test from "node:test";
import { runProductionAcceptance } from "../scripts/cloudflare-production-acceptance.ts";

const SHA = "6a1d51e25654eb7a5c22bab7a1c2dcaca522c2af";
const BASE_URL = "https://mahoraga-execution-runtime.mahoraga-mjw0123.workers.dev";
const PROVIDER_BODY = {
  executed: true,
  answer: "acceptance-answer",
  providerId: "cloudflare-workers-ai",
  modelId: "@cf/zai-org/glm-4.7-flash",
  timestamp: 123,
};

function acceptanceFetch(options?: {
  railwayBypass?: boolean;
  providerId?: string;
  providerAdmitted?: boolean;
  providerReasonCode?: string;
  onExecute?: () => void;
}): typeof fetch {
  let correctPosts = 0;
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (request.method === "GET" && request.headers.get("cf-access-token") === null) return new Response("Access denied", { status: 403 });
    if (request.method === "GET" && url.pathname === "/api/capabilities") {
      const admitted = options?.providerAdmitted !== false;
      return Response.json({ capabilities: [{
        capability: "assistant.respond",
        routable: admitted,
        enabled: admitted,
        provider: "cloudflare-workers-ai",
        providerReasonCode: admitted ? null : (options?.providerReasonCode ?? "cloudflare-native-provider-pending"),
      }] });
    }
    if (request.method === "GET") return Response.json({ status: "ready", sha: SHA, durableState: "cloudflare-do-sqlite" });
    if (request.headers.get("x-target-sha") !== SHA) return Response.json({ error: "sha" }, { status: 412 });
    options?.onExecute?.();
    correctPosts += 1;
    const body = { ...PROVIDER_BODY, ...(options?.providerId ? { providerId: options.providerId } : {}) };
    const headers: Record<string, string> = {};
    if (correctPosts > 1) headers["x-idempotent-replay"] = "true";
    if (options?.railwayBypass) headers["x-bypass-applied"] = "true";
    return Response.json(body, { headers });
  };
}

test("production acceptance proves provider identity and no Railway fallthrough", async () => {
  const receipt = await runProductionAcceptance({
    accessToken: "access-token",
    baseUrl: BASE_URL,
    targetSha: SHA,
    idempotencyKey: "production-acceptance",
    fetchImpl: acceptanceFetch(),
    now: () => "2026-09-23T22:30:00.000Z",
  });
  assert.equal(receipt.status, "accepted");
  assert.equal(receipt.providerCognitionVerified, true);
  assert.equal(receipt.noRailwayFallbackVerified, true);
  assert.equal(receipt.providerId, "cloudflare-workers-ai");
  assert.equal(receipt.modelId, "@cf/zai-org/glm-4.7-flash");
  assert.equal(receipt.trafficAuthorityVerified, false);
  assert.equal(JSON.stringify(receipt).includes("access-token"), false);
});

test("production acceptance fails closed on Railway bypass evidence", async () => {
  await assert.rejects(runProductionAcceptance({
    accessToken: "access-token",
    baseUrl: BASE_URL,
    targetSha: SHA,
    idempotencyKey: "railway-bypass",
    fetchImpl: acceptanceFetch({ railwayBypass: true }),
  }), /accept-railway-fallback-detected/);
});

test("production acceptance fails closed on unexpected provider identity", async () => {
  await assert.rejects(runProductionAcceptance({
    accessToken: "access-token",
    baseUrl: BASE_URL,
    targetSha: SHA,
    idempotencyKey: "provider-mismatch",
    fetchImpl: acceptanceFetch({ providerId: "unexpected-provider" }),
  }), /accept-provider-id-mismatch/);
});

test("production acceptance reports provider policy block before inference", async () => {
  let executeCalls = 0;
  await assert.rejects(runProductionAcceptance({
    accessToken: "access-token",
    baseUrl: BASE_URL,
    targetSha: SHA,
    idempotencyKey: "provider-blocked",
    fetchImpl: acceptanceFetch({
      providerAdmitted: false,
      providerReasonCode: "cloudflare-native-provider-pending",
      onExecute: () => { executeCalls += 1; },
    }),
  }), /accept-provider-not-admitted:cloudflare-native-provider-pending/);
  assert.equal(executeCalls, 0);
});
