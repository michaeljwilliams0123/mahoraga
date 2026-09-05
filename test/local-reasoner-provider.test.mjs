import test from "node:test";
import assert from "node:assert/strict";
import { localReasonerExecutionBoundary, localReasonerLoopbackEndpoints, observeLocalReasonerReady, probeLocalReasoner } from "../src/local-reasoner-provider.mjs";

test("local reasoner probe is fixed to Ollama and LM Studio loopback and does not retain model identifiers", async () => {
  const calls = [];
  const result = await probeLocalReasoner({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (String(url).includes(":11434")) {
        return { ok: true, status: 200, json: async () => ({ models: [{ name: "private-model-alpha" }] }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: "private-model-beta" }] }),
      };
    },
  });

  assert.equal(result.verified, true);
  assert.equal(result.providerHealth.modelCount, 2);
  assert.equal(result.providerHealth.executionEnabled, false);
  assert.deepEqual(result.providerHealth.backends.map((backend) => backend.id), ["ollama", "lm-studio"]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.url).sort(), [
    "http://127.0.0.1:11434/api/tags",
    "http://127.0.0.1:1234/v1/models",
  ].sort());
  assert.equal(calls.every((call) => call.options.method === "GET"), true);
  assert.equal(calls.every((call) => call.options.redirect === "error"), true);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("private-model-alpha"), false);
  assert.equal(serialized.includes("private-model-beta"), false);
});

test("local reasoner readiness fails closed for missing models or unavailable loopback services", async () => {
  const noModels = await probeLocalReasoner({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [], models: [] }) }),
  });
  assert.equal(noModels.verified, false);
  assert.equal(noModels.providerHealth.availability, "configured");

  const unavailable = await probeLocalReasoner({ fetchImpl: async () => { throw new Error("connection refused"); } });
  assert.equal(unavailable.verified, false);
  assert.equal(unavailable.providerHealth.errorCode, "connection-unavailable");
  assert.equal(await observeLocalReasonerReady({ fetchImpl: async () => { throw new Error("connection refused"); } }), false);
});

test("Ollama alone is sufficient for a live credit-free local reasoner", async () => {
  const result = await probeLocalReasoner({
    fetchImpl: async (url) => {
      if (String(url).includes(":11434")) {
        return { ok: true, status: 200, json: async () => ({ models: [{ name: "qwen-secret" }] }) };
      }
      throw new Error("lm studio down");
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.providerHealth.backends.find((backend) => backend.id === "ollama").verified, true);
  assert.equal(result.providerHealth.backends.find((backend) => backend.id === "lm-studio").verified, false);
  assert.equal(JSON.stringify(result).includes("qwen-secret"), false);
});

test("loopback endpoints stay on 127.0.0.1 and local reasoning execution remains disabled", () => {
  const endpoints = localReasonerLoopbackEndpoints();
  assert.equal(endpoints.every((endpoint) => endpoint.url.startsWith("http://127.0.0.1:")), true);
  assert.deepEqual(localReasonerExecutionBoundary(), {
    executionEnabled: false,
    reason: "transient-result-channel-required",
    promptPersistenceAllowed: false,
    responsePersistenceAllowed: false,
  });
});
