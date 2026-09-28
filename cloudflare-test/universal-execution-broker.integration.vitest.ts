import { describe, expect, it } from "vitest";
import { adaptLegacyConnectorAttestation } from "../deploy/cloudflare-execution-broker/legacy-connector-adapter";
import { createExecutionBroker } from "../deploy/cloudflare-execution-broker/worker";

const NOW = Date.parse("2026-09-28T21:45:00.000Z");
const universal = (workerId = "github-provider") => ({
  schemaVersion: 1, kind: "universal-worker-attestation", workerId, provider: "github", locality: "cloud",
  observedAt: new Date(NOW - 1_000).toISOString(), expiresAt: new Date(NOW + 60_000).toISOString(),
  observedLatencyMs: 20, queueDepth: 0, reliabilityScore: 1,
  capabilities: [{ capability: "repository.inspect", permissionClass: "read", healthy: true, zeroCreditEligible: true,
    costClass: "zero-credit", dataClassesAllowed: ["synthetic", "personal", "enterprise"], authorityScopes: ["repo:mahoraga:read"] }],
});

const provider = (body = universal()) => ({
  async fetch(request: Request) {
    if (new URL(request.url).pathname === "/api/capabilities") return Response.json(body);
    if (new URL(request.url).pathname === "/api/execute") return Response.json({ status: "complete", receipt: { id: "provider-receipt" } });
    return new Response("not found", { status: 404 });
  },
});

describe("universal execution broker", () => {
  it("converts fresh legacy connector grants only when their provider has an executable binding", () => {
    const legacy = { schemaVersion: 1, kind: "connector-capability-attestation", observedAt: new Date(NOW - 1000).toISOString(), expiresAt: new Date(NOW + 60000).toISOString(), grants: [
      { capability: "repository.inspect", provider: "github", permissionClass: "read", zeroCreditEligible: true, healthy: true },
      { capability: "integration.execute", provider: "composio", permissionClass: "execute", zeroCreditEligible: true, healthy: true },
    ] };
    const converted = adaptLegacyConnectorAttestation(legacy, new Set(["github"]), NOW);
    expect(converted).toHaveLength(1);
    expect(converted[0]).toEqual(expect.objectContaining({ provider: "github", workerId: "legacy-github" }));
    expect(converted[0]?.capabilities[0]?.capability).toBe("repository.inspect");
  });

  it("projects a fresh provider capability and refuses an unbound provider", async () => {
    const broker = createExecutionBroker({ REPOSITORY_PROVIDER: provider() }, () => NOW);
    const response = await broker.fetch(new Request("https://broker/api/capabilities"));
    const body = await response.json() as { routes: Array<{ capability: string; provider: string }> };
    expect(body.routes).toEqual([expect.objectContaining({ capability: "repository.inspect", provider: "github" })]);

    const empty = createExecutionBroker({}, () => NOW);
    const emptyBody = await (await empty.fetch(new Request("https://broker/api/capabilities"))).json() as { routes: unknown[] };
    expect(emptyBody.routes).toEqual([]);
  });

  it("selects a deterministic route and returns a bounded lease with sanitized receipt", async () => {
    const broker = createExecutionBroker({ REPOSITORY_PROVIDER: provider() }, () => NOW);
    const response = await broker.fetch(new Request("https://broker/api/route", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ schemaVersion:1, taskId:"t1", chainId:"c1", requiredCapability:"repository.inspect", requestedPermission:"read", dataClass:"enterprise", authorityScopes:["repo:mahoraga:read"], costPreference:"zero-credit-first", maxHops:4, constraints:{}, evidenceRefs:[] }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json() as { lease: { workerId: string; provider: string }; receipt: Record<string, unknown> };
    expect(body.lease).toEqual(expect.objectContaining({ workerId:"github-provider", provider:"github" }));
    expect(JSON.stringify(body.receipt)).not.toMatch(/token|secret|password/i);
  });

  it("fails closed for stale provider evidence", async () => {
    const stale = universal(); stale.expiresAt = new Date(NOW - 1).toISOString();
    const broker = createExecutionBroker({ REPOSITORY_PROVIDER: provider(stale) }, () => NOW);
    const body = await (await broker.fetch(new Request("https://broker/api/capabilities"))).json() as { routes: unknown[] };
    expect(body.routes).toEqual([]);
  });
});