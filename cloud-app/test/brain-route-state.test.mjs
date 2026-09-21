import test from "node:test";
import assert from "node:assert/strict";
import { brainReadiness, deriveBrainRouteState } from "../lib/brain-route-state.ts";

test("connected transport is degraded when assistant.respond is not advertised", () => {
  const state = deriveBrainRouteState(true, []);
  assert.equal(state.kind, "capability-unavailable");
  assert.equal(brainReadiness(state), "degraded");
});

test("connected transport is degraded when assistant.respond is not routable", () => {
  const state = deriveBrainRouteState(true, [{
    capability: "assistant.respond",
    routable: false,
    routingReason: "provider.gap",
  }]);
  assert.equal(state.kind, "capability-unavailable");
  assert.equal(brainReadiness(state), "degraded");
});

test("quota and backoff reasons become provider-backoff", () => {
  const state = deriveBrainRouteState(true, [{
    capability: "assistant.respond",
    routable: false,
    providerReasonCode: "provider-quota-backoff",
  }]);
  assert.equal(state.kind, "provider-backoff");
  assert.equal(brainReadiness(state), "degraded");
});

test("assistant.respond must be routable before the brain is ready", () => {
  const state = deriveBrainRouteState(true, [{
    capability: "assistant.respond",
    routable: true,
    enabled: true,
    provider: "zero-credit",
  }]);
  assert.equal(state.kind, "route-ready");
  assert.equal(brainReadiness(state), "ready");
});

test("a healthy answer route wins over an earlier degraded route", () => {
  const state = deriveBrainRouteState(true, [
    {
      capability: "assistant.respond",
      routable: false,
      enabled: true,
      provider: "licensed-question-model",
      providerReasonCode: "provider-quota-backoff",
    },
    {
      capability: "assistant.respond",
      routable: true,
      enabled: true,
      provider: "zero-credit",
    },
  ]);
  assert.equal(state.kind, "route-ready");
  assert.equal(state.provider, "zero-credit");
  assert.equal(brainReadiness(state), "ready");
});

test("disconnected transport remains offline regardless of stale capabilities", () => {
  const state = deriveBrainRouteState(false, [{
    capability: "assistant.respond",
    routable: true,
  }], "relay-disconnected");
  assert.equal(state.kind, "transport-unavailable");
  assert.equal(brainReadiness(state), "offline");
});
