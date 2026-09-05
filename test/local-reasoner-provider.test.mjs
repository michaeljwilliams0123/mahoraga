import test from "node:test";
import assert from "node:assert/strict";
import { localReasonerExecutionBoundary, LOCAL_REASONER_ENDPOINTS, probeLocalReasoner } from "../src/local-reasoner-provider.mjs";

test("loopback probe covers Ollama and LM Studio without retaining model identifiers", async () => {
  const calls = [];
  const result = await probeLocalReasoner({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url === LOCAL_REASONER_ENDPOINTS.ollama) {
        return { ok: true, status: 200, json: async () => ({ models: [{ name: "private-ollama-alpha" }] }) };
      }
      return { ok: true, status: 200, json: async () => ({ data: [{ id: "private-model-alpha" }, { id: "private-model-beta" }] }) };
    },
  });

  assert.equal(result.verified, true);
  assert.equal(result.providerHealth.modelCount, 3);
  assert.equal(result.providerHealth.ollama.modelCount, 1);
  assert.equal(result.providerHealth.lmStudio.modelCount, 2);
  assert.equal(result.providerHealth.executionEnabled, false);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.url).sort(), [LOCAL_REASONER_ENDPOINTS.lmStudio, LOCAL_REASONER_ENDPOINTS.ollama].sort());
  assert.equal(calls.every((call) => call.options.method === "GET" && call.options.redirect === "error"), true);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("private-ollama-alpha"), false);
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
  assert.equal(unavailable.providerHealth.availability, "unavailable");
  assert.equal(unavailable.providerHealth.errorCode, "connection-unavailable");
});

test("Ollama-only loopback is sufficient to mark the local reasoner live", async () => {
  const result = await probeLocalReasoner({
    fetchImpl: async (url) => {
      if (url === LOCAL_REASONER_ENDPOINTS.ollama) {
        return { ok: true, status: 200, json: async () => ({ models: [{ name: "secret-qwen" }] }) };
      }
      throw new Error("lm studio down");
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.providerHealth.ollama.availability, "healthy");
  assert.equal(result.providerHealth.lmStudio.availability, "unavailable");
  assert.equal(JSON.stringify(result).includes("secret-qwen"), false);
});

test("local reasoning execution remains explicitly disabled until transient results are available", () => {
  assert.deepEqual(localReasonerExecutionBoundary(), {
    executionEnabled: false,
    reason: "transient-result-channel-required",
    promptPersistenceAllowed: false,
    responsePersistenceAllowed: false,
  });
});
