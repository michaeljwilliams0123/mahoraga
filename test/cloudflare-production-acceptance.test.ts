import assert from "node:assert/strict";
import test from "node:test";
import { proveFailClosedZeroBilling, runProductionAcceptance } from "../scripts/cloudflare-production-acceptance.ts";

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
    if (request.method === "GET" && url.pathname === "/api/runtime/attestation") {
      return Response.json({
        schemaVersion: 1,
        kind: "mahoraga-runtime-attestation",
        status: "ready",
        targetSha: SHA,
        runtime: "cloudflare-worker",
        durableState: "cloudflare-do-sqlite",
        trafficAuthority: "cloudflare",
        railwayRoutingEnabled: false,
        railwayInfluence: false,
        provider: { providerId: "cloudflare-workers-ai", admitted: true, zeroCreditEligible: true },
      }, { headers: { server: "cloudflare", "cf-ray": "test-ray-IAD" } });
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
    redeployExactRuntime: async () => {},
    proveFailClosedZeroBilling: async () => {},
    now: () => "2026-09-23T22:30:00.000Z",
  });
  assert.equal(receipt.status, "accepted");
  assert.equal(receipt.providerCognitionVerified, true);
  assert.equal(receipt.noRailwayFallbackVerified, true);
  assert.equal(receipt.providerId, "cloudflare-workers-ai");
  assert.equal(receipt.modelId, "@cf/zai-org/glm-4.7-flash");
  assert.equal(receipt.trafficAuthorityVerified, true);
  assert.equal(receipt.runtimeAttestationVerified, true);
  assert.equal(receipt.railwayNoRouteVerified, true);
  assert.equal(receipt.railwayNoInfluenceVerified, true);
  assert.equal(receipt.durableContinuityVerified, true);
  assert.equal(receipt.hardZeroBillingVerified, true);
  assert.equal(receipt.failClosedZeroBillingVerified, true);
  assert.deepEqual(receipt.executionUniqueness, {
    logicalRequests: 5,
    providerExecutions: 1,
    receipts: 1,
    conflicts: 0,
    replays: 4,
    atMostOneVerified: true,
  });
  assert.equal(JSON.stringify(receipt).includes("access-token"), false);
});

test("production acceptance fails closed on Railway bypass evidence", async () => {
  await assert.rejects(runProductionAcceptance({
    accessToken: "access-token",
    baseUrl: BASE_URL,
    targetSha: SHA,
    idempotencyKey: "railway-bypass",
    fetchImpl: acceptanceFetch({ railwayBypass: true }),
    redeployExactRuntime: async () => {},
    proveFailClosedZeroBilling: async () => {},
  }), /accept-railway-fallback-detected/);
});

test("production acceptance fails closed on unexpected provider identity", async () => {
  await assert.rejects(runProductionAcceptance({
    accessToken: "access-token",
    baseUrl: BASE_URL,
    targetSha: SHA,
    idempotencyKey: "provider-mismatch",
    fetchImpl: acceptanceFetch({ providerId: "unexpected-provider" }),
    redeployExactRuntime: async () => {},
    proveFailClosedZeroBilling: async () => {},
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
    redeployExactRuntime: async () => {},
    proveFailClosedZeroBilling: async () => {},
  }), /accept-provider-not-admitted:cloudflare-native-provider-pending/);
  assert.equal(executeCalls, 0);
});

test("fail-closed proof expires admission, blocks inference, and restores hard-zero admission", async () => {
  const requests: Request[] = [];
  let refreshes = 0;
  await proveFailClosedZeroBilling({
    accessToken: "access-token",
    baseUrl: BASE_URL,
    targetSha: SHA,
    providerRefreshSecret: "refresh-secret",
    acceptanceRunId: "cutover-test-run-1",
    billingAttestation: JSON.stringify({ schemaVersion: 1, verifiedAt: 100, expiresAt: 200 }),
    fetchImpl: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (new URL(request.url).pathname === "/api/provider/refresh") {
        refreshes += 1;
        return Response.json({ zeroCreditEligible: refreshes > 1 }, { status: refreshes === 1 ? 503 : 200 });
      }
      return Response.json({ error: "Cognition provider unavailable" }, { status: 503 });
    },
  });
  assert.deepEqual(requests.map((request) => new URL(request.url).pathname), [
    "/api/provider/refresh", "/api/execute", "/api/provider/refresh",
  ]);
  assert.equal(await requests[0]!.clone().json().then((body: any) => JSON.parse(body.billingAttestation).expiresAt), 1);
  assert.equal(requests[1]!.headers.get("x-target-sha"), SHA);
  assert.equal(requests.every((request) => request.headers.get("x-mahoraga-acceptance-run") === "cutover-test-run-1"), true);
  assert.equal(requests[2]!.headers.get("x-provider-refresh-token"), "refresh-secret");
});
