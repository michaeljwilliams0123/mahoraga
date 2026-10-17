import test from "node:test";
import assert from "node:assert/strict";
import { createExecutionBroker } from "../deploy/cloudflare-execution-broker/worker.ts";

const now = Date.parse("2026-10-15T12:00:00Z");
test("ambiguous provider transport and response failures retain attempted-route evidence without retry", async () => {
  for (const failure of ["transport", "invalid-json", "http-denied"]) {
    let executions = 0;
    const broker = createExecutionBroker({ REPOSITORY_PROVIDER: { async fetch(request) {
      if (new URL(request.url).pathname === "/api/capabilities") {
        const attestation = {
          schemaVersion: 1, kind: "universal-worker-attestation", provider: "github", workerId: "repo-worker", locality: "cloud",
          observedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 30_000).toISOString(),
          capabilities: [{ capability: "repository.inspect", permissionClass: "read", healthy: true,
            zeroCreditEligible: true, costClass: "deterministic", dataClassesAllowed: ["enterprise"], authorityScopes: ["repo:read"] }],
        };
        return Response.json({ attestations: [attestation, { ...attestation, workerId: "second-repo-worker" }] });
      }
      executions++;
      if (failure === "transport") throw new Error("Bearer private-token-value");
      if (failure === "invalid-json") return new Response("private-upstream-body");
      return new Response("private-upstream-body", { status: 429 });
    } } }, () => now);
    const response = await broker.fetch(new Request("https://broker/api/execute", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ request: {
        taskId: "same-objective", chainId: "same-chain", requiredCapability: "repository.inspect", requestedPermission: "read",
        dataClass: "enterprise", authorityScopes: ["repo:read"], constraints: { requireZeroCredit: true }, maxHops: 3,
      }, payload: { objective: "inspect" } }),
    }));
    assert.equal(response.status, 502);
    const result = await response.json() as { error: string; receipts: Array<{ kind: string }> };
    assert.equal(result.error, "worker-execution-failed");
    assert.equal(result.receipts[0]?.kind, "route-selection-receipt");
    assert.equal(result.receipts.some(receipt => receipt.kind === "execution-receipt"), false);
    assert.equal(executions, 1);
    assert.doesNotMatch(JSON.stringify(result), /private-token-value|private-upstream-body|Bearer/);
  }
});
