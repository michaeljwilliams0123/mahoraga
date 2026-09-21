import test from "node:test";
import assert from "node:assert/strict";
import { ErrorProfileCode } from "../src/types/mahoraga.ts";
import { brainReadiness, deriveBrainRouteState } from "../cloud-app/lib/brain-route-state.ts";

test("Mahoraga convergence error codes remain stable", () => {
  assert.deepEqual(Object.values(ErrorProfileCode), [
    "ERR_MAHORAGA_AST_001",
    "ERR_MAHORAGA_COMP_002",
    "ERR_MAHORAGA_CPU_003",
    "ERR_MAHORAGA_MSFT_004",
    "ERR_MAHORAGA_UCF_005",
  ]);
});

test("protected verification covers mixed assistant route readiness", () => {
  const state = deriveBrainRouteState(true, [
    { capability: "assistant.respond", routable: false, provider: "licensed-question-model", providerReasonCode: "provider-quota-backoff" },
    { capability: "assistant.respond", routable: true, enabled: true, provider: "zero-credit" },
  ]);
  assert.equal(state.kind, "route-ready");
  assert.equal(state.provider, "zero-credit");
  assert.equal(brainReadiness(state), "ready");
});
