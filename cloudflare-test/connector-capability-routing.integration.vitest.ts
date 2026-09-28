import { describe, expect, it } from "vitest";

import { collectConnectorCapabilityRoutes, projectConnectorCapabilityRoutes } from "../deploy/cloudflare-execution-runtime/connector-capability-router";

describe("permissioned connector capability routing", () => {
  it("projects each healthy zero-credit grant without requiring codex.execute", () => {
    const routes = projectConnectorCapabilityRoutes({
      schemaVersion: 1,
      kind: "connector-capability-attestation",
      observedAt: "2026-09-28T16:30:00.000Z",
      expiresAt: "2026-09-28T16:35:00.000Z",
      grants: [
        { capability: "repository.inspect", provider: "github", permissionClass: "read", zeroCreditEligible: true, healthy: true },
        { capability: "repository.write", provider: "github", permissionClass: "write", zeroCreditEligible: true, healthy: true },
        { capability: "cloud.inspect", provider: "cloudflare", permissionClass: "read", zeroCreditEligible: true, healthy: true },
        { capability: "integration.execute", provider: "composio", permissionClass: "execute", zeroCreditEligible: true, healthy: true },
      ],
    }, Date.parse("2026-09-28T16:31:00.000Z"));

    expect(routes.map((route) => route.capability)).toEqual([
      "repository.inspect",
      "repository.write",
      "cloud.inspect",
      "integration.execute",
    ]);
    expect(routes.every((route) => route.routable && route.costClass === "deterministic" && route.evidenceLevel === "runtime-execution")).toBe(true);
    expect(routes.some((route) => String(route.capability) === "codex.execute")).toBe(false);
  });

  it("fails closed per grant for stale, unhealthy, paid, or over-privileged evidence", () => {
    const base = {
      schemaVersion: 1,
      kind: "connector-capability-attestation",
      observedAt: "2026-09-28T16:30:00.000Z",
      expiresAt: "2026-09-28T16:35:00.000Z",
    } as const;
    expect(projectConnectorCapabilityRoutes({ ...base, expiresAt: "2026-09-28T16:30:59.000Z", grants: [
      { capability: "repository.inspect", provider: "github", permissionClass: "read", zeroCreditEligible: true, healthy: true },
    ] }, Date.parse("2026-09-28T16:31:00.000Z"))).toEqual([]);
    expect(projectConnectorCapabilityRoutes({ ...base, grants: [
      { capability: "repository.inspect", provider: "github", permissionClass: "read", zeroCreditEligible: false, healthy: true },
      { capability: "cloud.inspect", provider: "cloudflare", permissionClass: "read", zeroCreditEligible: true, healthy: false },
      { capability: "repository.write", provider: "github", permissionClass: "read", zeroCreditEligible: true, healthy: true },
    ] }, Date.parse("2026-09-28T16:31:00.000Z"))).toEqual([]);
  });

  it("accepts routes only from the bound connector broker attestation endpoint", async () => {
    const broker = { async fetch(request: Request) {
      expect(new URL(request.url).pathname).toBe("/api/capabilities");
      return Response.json({
        schemaVersion: 1,
        kind: "connector-capability-attestation",
        observedAt: "2026-09-28T16:30:00.000Z",
        expiresAt: "2026-09-28T16:35:00.000Z",
        grants: [{ capability: "repository.inspect", provider: "github", permissionClass: "read", zeroCreditEligible: true, healthy: true }],
      });
    } };
    const routes = await collectConnectorCapabilityRoutes(broker, Date.parse("2026-09-28T16:31:00.000Z"));
    expect(routes).toEqual([expect.objectContaining({ capability: "repository.inspect", provider: "github", permissionClass: "read" })]);
    expect(await collectConnectorCapabilityRoutes(undefined, Date.parse("2026-09-28T16:31:00.000Z"))).toEqual([]);
  });
});
