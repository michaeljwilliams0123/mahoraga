import assert from "node:assert/strict";
import test from "node:test";
import { runAcceptanceProbe } from "../scripts/cloudflare-execution-runtime.ts";

const SHA = "6a1d51e25654eb7a5c22bab7a1c2dcaca522c2af";
const OTHER_SHA = "7cb8aab1129875f798347afdb2844f963e986a65";
const BASE_URL = "https://mahoraga-execution-runtime.mahoraga-mjw0123.workers.dev";

test("acceptance waits for exact ready provenance after deployment convergence", async () => {
  let authenticatedReadyChecks = 0;
  let targetPosts = 0;
  const firstBody = { executed: true, data: { acceptance: "first" }, timestamp: 123 };

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    if (request.method === "GET" && request.headers.get("cf-access-token") === null) {
      return new Response("Access denied", { status: 403 });
    }
    if (request.method === "GET") {
      authenticatedReadyChecks += 1;
      return Response.json({ status: "ready", sha: authenticatedReadyChecks === 1 ? OTHER_SHA : SHA });
    }
    if (request.headers.get("x-target-sha") !== SHA) {
      return Response.json({ error: "Precondition Failed: SHA mismatch" }, { status: 412 });
    }
    targetPosts += 1;
    return Response.json(firstBody, targetPosts > 1 ? { headers: { "x-idempotent-replay": "true" } } : undefined);
  };

  const receipt = await runAcceptanceProbe({
    accessToken: "secret-access-token",
    baseUrl: BASE_URL,
    targetSha: SHA,
    idempotencyKey: "convergence-key",
    fetchImpl,
  });

  assert.equal(receipt.status, "accepted");
  assert.equal(receipt.ready, true);
  assert.equal(authenticatedReadyChecks, 2);
});
