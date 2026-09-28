import assert from "node:assert/strict";
import test from "node:test";
import { runAcceptanceProbe } from "../scripts/cloudflare-execution-runtime.ts";

const SHA = "6a1d51e25654eb7a5c22bab7a1c2dcaca522c2af";
const OTHER_SHA = "7cb8aab1129875f798347afdb2844f963e986a65";
const BASE_URL = "https://mahoraga-execution-runtime.mahoraga-mjw0123.workers.dev";
const readyBody = () => ({ status: "ready", sha: SHA, durableState: "cloudflare-do-sqlite" });
const attestationResponse = () => Response.json({
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

function staleShaResponse(expected: string, actual: string) {
  return Response.json({ error: "Precondition Failed: SHA mismatch", expected, actual }, { status: 412 });
}

test("current-SHA execute 412 re-proves authoritative and runtime evidence before one bounded recovery", async () => {
  let authenticatedReadyCalls = 0;
  let attestationCalls = 0;
  let currentShaPosts = 0;
  let authoritativeChecks = 0;
  const firstBody = { executed: true, data: { probe: "first" }, timestamp: 123 };

  const fetchImpl = async (input: RequestInfo | globalThis.URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const pathname = new URL(request.url).pathname;
    if (request.method === "GET" && request.headers.get("cf-access-token") === null) {
      return new Response("Access denied", { status: 403 });
    }
    if (request.method === "GET" && pathname === "/api/runtime/attestation") {
      attestationCalls += 1;
      return attestationResponse();
    }
    if (request.method === "GET" && pathname === "/api/ready") {
      authenticatedReadyCalls += 1;
      return Response.json(readyBody());
    }
    if (request.method === "POST" && request.headers.get("x-target-sha") !== SHA) {
      return staleShaResponse(SHA, request.headers.get("x-target-sha") ?? "");
    }
    if (request.method === "POST") {
      currentShaPosts += 1;
      if (currentShaPosts === 1) return Response.json(firstBody);
      if (currentShaPosts === 2 || currentShaPosts === 3) return Response.json({ error: "in flight" }, { status: 409 });
      if (currentShaPosts === 4) return staleShaResponse(OTHER_SHA, SHA);
      return Response.json(firstBody, { headers: { "x-idempotent-replay": "true" } });
    }
    throw new Error(`unexpected-request:${request.method}:${pathname}`);
  };

  const receipt = await runAcceptanceProbe({
    accessToken: "secret-access-token",
    baseUrl: BASE_URL,
    targetSha: SHA,
    idempotencyKey: "sha-convergence-key",
    fetchImpl,
    readyDelayMs: 0,
    sleep: async () => {},
    verifyAuthoritativeSha: async () => { authoritativeChecks += 1; },
  });

  assert.equal(receipt.status, "accepted");
  assert.equal(authoritativeChecks, 1);
  assert.equal(authenticatedReadyCalls >= 2, true);
  assert.equal(attestationCalls >= 2, true);
  assert.equal(receipt.executionShaConvergence.recoveryAttempts, 1);
  assert.deepEqual(receipt.executionShaConvergence.mismatches, [
    { phase: "execute", expected: OTHER_SHA, actual: SHA },
  ]);
});

test("persistent current-SHA execute mismatch fails closed after the bounded recovery", async () => {
  let authoritativeChecks = 0;
  const fetchImpl = async (input: RequestInfo | globalThis.URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const pathname = new URL(request.url).pathname;
    if (request.method === "GET" && request.headers.get("cf-access-token") === null) {
      return new Response("Access denied", { status: 403 });
    }
    if (request.method === "GET" && pathname === "/api/runtime/attestation") return attestationResponse();
    if (request.method === "GET" && pathname === "/api/ready") return Response.json(readyBody());
    if (request.method === "POST" && request.headers.get("x-target-sha") !== SHA) {
      return staleShaResponse(SHA, request.headers.get("x-target-sha") ?? "");
    }
    if (request.method === "POST") return staleShaResponse(OTHER_SHA, SHA);
    throw new Error(`unexpected-request:${request.method}:${pathname}`);
  };

  await assert.rejects(
    runAcceptanceProbe({
      accessToken: "secret-access-token",
      baseUrl: BASE_URL,
      targetSha: SHA,
      idempotencyKey: "sha-convergence-exhaust-key",
      fetchImpl,
      readyDelayMs: 0,
      sleep: async () => {},
      executeShaRecoveryAttempts: 1,
      verifyAuthoritativeSha: async () => { authoritativeChecks += 1; },
    }),
    new RegExp(`accept-execute-sha-convergence-exhausted:expected=${OTHER_SHA}:actual=${SHA}:recoveries=1`),
  );
  assert.equal(authoritativeChecks, 1);
});
