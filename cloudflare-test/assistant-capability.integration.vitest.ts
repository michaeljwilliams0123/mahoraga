import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { type ExecutionDurableObject } from "../deploy/cloudflare-execution-runtime/worker";

const SHA = "7cb8aab1129875f798347afdb2844f963e986a65";

describe("Cloudflare assistant capability projection", () => {
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
