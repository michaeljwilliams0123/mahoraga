import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { projectRuntimeCapabilities, runtimeContextFromCapabilities, type ExecutionDurableObject } from "../deploy/cloudflare-execution-runtime/worker";

const SHA = "7cb8aab1129875f798347afdb2844f963e986a65";

describe("Cloudflare assistant capability projection", () => {
  it("adds individually attested connector lanes without inventing codex authority", async () => {
    const routes = await projectRuntimeCapabilities({
      assistant: {
        capability: "assistant.respond", routable: true, enabled: true, provider: "cloudflare-workers-ai",
        workerIds: [], routingReason: null, providerReasonCode: null, evidenceLevel: "runtime-probe",
      },
      connectorBroker: { async fetch() { return Response.json({
        schemaVersion: 1,
        kind: "connector-capability-attestation",
        observedAt: "2026-09-28T16:30:00.000Z",
        expiresAt: "2026-09-28T16:35:00.000Z",
        grants: [
          { capability: "repository.inspect", provider: "github", permissionClass: "read", zeroCreditEligible: true, healthy: true },
          { capability: "cloud.inspect", provider: "cloudflare", permissionClass: "read", zeroCreditEligible: true, healthy: true },
        ],
      }); } },
      now: Date.parse("2026-09-28T16:31:00.000Z"),
    });
    expect(routes.map((route) => route.capability)).toEqual([
      "assistant.respond", "cognitive.predict", "cognitive.cycle", "repository.inspect", "cloud.inspect",
    ]);
    expect(routes.some((route) => route.capability === "codex.execute")).toBe(false);
    const context = runtimeContextFromCapabilities(routes);
    expect(context.capabilities["repository.inspect"]).toBe("routable");
    expect(context.capabilities["cloud.inspect"]).toBe("routable");
    expect(context.capabilities["codex.execute"]).toBe("unavailable");
  });

  it("stays fail-closed when no provider evidence exists", async () => {
    const stub = env.EXECUTION_DO.getByName("assistant-capability-empty");
    const ready = await stub.fetch("https://execution.example/api/ready", {
      headers: { "x-target-sha": SHA },
    });
    expect(ready.status).toBe(200);

    const response = await stub.fetch("https://execution.example/api/capabilities", {
      headers: { "x-target-sha": SHA },
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { capabilities: Array<Record<string, unknown>> };
    expect(body.capabilities[0]).toMatchObject({
      capability: "assistant.respond",
      routable: false,
      enabled: false,
      provider: "cloudflare-native",
      routingReason: "provider.gap",
      providerReasonCode: "cloudflare-native-provider-pending",
      evidenceLevel: "runtime-probe",
    });
    expect(body.capabilities.slice(1)).toEqual([
      expect.objectContaining({ capability: "cognitive.predict", routable: true, costClass: "deterministic", evidenceLevel: "runtime-execution" }),
      expect.objectContaining({ capability: "cognitive.cycle", routable: true, costClass: "deterministic", evidenceLevel: "runtime-execution" }),
    ]);
  });

  it("projects a fresh admitted provider as routable", async () => {
    const stub = env.EXECUTION_DO.getByName("assistant-capability-admitted");
    const ready = await stub.fetch("https://execution.example/api/ready", {
      headers: { "x-target-sha": SHA },
    });
    expect(ready.status).toBe(200);

    const now = Date.now();
    await runInDurableObject<ExecutionDurableObject, void>(stub, (instance) => {
      instance.storage.saveProviderState({
        providerId: "cloudflare-workers-ai",
        available: true,
        zeroCreditEligible: true,
        reasonCode: null,
        observedAt: now - 1_000,
        verifiedAt: now - 500,
        canaryExpiresAt: now + 60_000,
      });
    });

    const response = await stub.fetch("https://execution.example/api/capabilities", {
      headers: { "x-target-sha": SHA },
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { capabilities: Array<Record<string, unknown>> };
    expect(body.capabilities[0]).toMatchObject({
      capability: "assistant.respond",
      routable: true,
      enabled: true,
      provider: "cloudflare-workers-ai",
      routingReason: null,
      providerReasonCode: null,
      evidenceLevel: "runtime-probe",
    });
  });

  it("treats stale admitted provider evidence as unroutable", async () => {
    const stub = env.EXECUTION_DO.getByName("assistant-capability-stale");
    const ready = await stub.fetch("https://execution.example/api/ready", {
      headers: { "x-target-sha": SHA },
    });
    expect(ready.status).toBe(200);

    const now = Date.now();
    await runInDurableObject<ExecutionDurableObject, void>(stub, (instance) => {
      instance.storage.saveProviderState({
        providerId: "cloudflare-workers-ai",
        available: true,
        zeroCreditEligible: true,
        reasonCode: null,
        observedAt: now - 120_000,
        verifiedAt: now - 120_000,
        canaryExpiresAt: now - 1,
      });
    });

    const response = await stub.fetch("https://execution.example/api/capabilities", {
      headers: { "x-target-sha": SHA },
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { capabilities: Array<Record<string, unknown>> };
    expect(body.capabilities[0]).toMatchObject({
      capability: "assistant.respond",
      routable: false,
      enabled: false,
      provider: "cloudflare-workers-ai",
      routingReason: "provider.gap",
      providerReasonCode: "provider-canary-stale",
      evidenceLevel: "runtime-probe",
    });
  });
});
