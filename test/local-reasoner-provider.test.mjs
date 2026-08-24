import test from "node:test";
import assert from "node:assert/strict";
import { localReasonerExecutionBoundary, probeLocalReasoner } from "../src/local-reasoner-provider.mjs";

test("LM Studio readiness probe is fixed to loopback and does not retain model identifiers", async () => {
  const calls = [];
  const result = await probeLocalReasoner({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: "private-model-alpha" }, { id: "private-model-beta" }] }),
      };
    },
  });

  assert.equal(result.verified, true);
  assert.equal(result.providerHealth.modelCount, 2);
  assert.equal(result.providerHealth.executionEnabled, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:1234/v1/models");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.redirect, "error");
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("private-model-alpha"), false);
  assert.equal(serialized.includes("private-model-beta"), false);
});

test("LM Studio readiness fails closed for missing models or unavailable loopback service", async () => {
  const noModels = await probeLocalReasoner({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }),
  });
  assert.equal(noModels.verified, false);
  assert.equal(noModels.providerHealth.availability, "configured");

  const unavailable = await probeLocalReasoner({ fetchImpl: async () => { throw new Error("connection refused"); } });
  assert.equal(unavailable.verified, false);
  assert.equal(unavailable.providerHealth.errorCode, "connection-unavailable");
});

test("local reasoning execution remains explicitly disabled until transient results are available", () => {
  assert.deepEqual(localReasonerExecutionBoundary(), {
    executionEnabled: false,
    reason: "transient-result-channel-required",
    promptPersistenceAllowed: false,
    responsePersistenceAllowed: false,
  });
});
