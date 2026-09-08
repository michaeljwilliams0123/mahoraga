import test from "node:test";
import assert from "node:assert/strict";
import {
  localReasonerExecutionBoundary,
  localReasonerLoopbackEndpoints,
  LOCAL_REASONER_ENDPOINTS,
  observeLocalReasonerReady,
  probeLocalReasoner,
} from "../src/local-reasoner-provider.mjs";
import { modelInspectionReceiptSha256 } from "../src/model-supply-chain.mjs";

const ADMITTED_SHA256 = "a".repeat(64);
const RUNTIME_SHA256 = "d".repeat(64);
const NOW = "2020-01-01T12:00:00.000Z";
const INSPECTION_METADATA = {
  scannerId: "mahoraga-static-model-scan-v1",
  artifactSha256: ADMITTED_SHA256,
  artifactSizeBytes: 42,
  trustRemoteCode: false,
  pickleDetected: false,
  executableCodeDetected: false,
  inspectedAt: "2020-01-01T11:00:00.000Z",
  expiresAt: "2020-01-02T11:00:00.000Z",
};
const ADMITTED_POLICY = {
  schemaVersion: 1,
  policyId: "test-model-supply-chain-v1",
  upstream: {
    provider: "huggingface",
    origin: "https://huggingface.co",
    immutableRevisionRequired: true,
    trustRemoteCode: false,
  },
  allowedFormats: ["safetensors", "gguf"],
  runtimeProviders: ["ollama", "lm-studio"],
  admissions: [{
    id: "test-admitted-model",
    state: "admitted",
    source: {
      provider: "huggingface",
      repository: "owner/model",
      revision: "c".repeat(40),
      artifactPath: "weights/model.gguf",
      trustRemoteCode: false,
    },
    artifact: { format: "gguf", sha256: ADMITTED_SHA256, sizeBytes: 42 },
    inspection: { ...INSPECTION_METADATA, receiptSha256: modelInspectionReceiptSha256(INSPECTION_METADATA) },
    runtimeBindings: [{ provider: "ollama", digest: RUNTIME_SHA256, sizeBytes: 420 }],
  }],
};

test("loopback probe covers Ollama and LM Studio without retaining model identifiers", async () => {
  const calls = [];
  const result = await probeLocalReasoner({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url === LOCAL_REASONER_ENDPOINTS.ollama) {
        return { ok: true, status: 200, json: async () => ({ models: [{ name: "private-ollama-alpha", digest: `sha256:${RUNTIME_SHA256}`, size: 420 }] }) };
      }
      return { ok: true, status: 200, json: async () => ({ data: [{ id: "private-model-alpha" }, { id: "private-model-beta" }] }) };
    },
    modelSupplyChain: ADMITTED_POLICY,
    now: NOW,
  });

  assert.equal(result.verified, true);
  assert.equal(result.providerHealth.modelCount, 3);
  assert.equal(result.providerHealth.admittedModelCount, 1);
  assert.equal(result.providerHealth.ollama.modelCount, 1);
  assert.equal(result.providerHealth.ollama.admittedModelCount, 1);
  assert.equal(result.providerHealth.lmStudio.modelCount, 2);
  assert.equal(result.providerHealth.lmStudio.admittedModelCount, 0);
  assert.equal(result.providerHealth.executionEnabled, false);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.url).sort(), [LOCAL_REASONER_ENDPOINTS.lmStudio, LOCAL_REASONER_ENDPOINTS.ollama].sort());
  assert.equal(calls.every((call) => call.options.method === "GET" && call.options.redirect === "error"), true);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("private-ollama-alpha"), false);
  assert.equal(serialized.includes("private-model-alpha"), false);
  assert.equal(serialized.includes("private-model-beta"), false);
  assert.deepEqual(localReasonerLoopbackEndpoints().map((item) => item.url).sort(), [
    LOCAL_REASONER_ENDPOINTS.lmStudio,
    LOCAL_REASONER_ENDPOINTS.ollama,
  ].sort());
});

test("local reasoner readiness fails closed for missing models or unavailable loopback services", async () => {
  const noModels = await probeLocalReasoner({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [], models: [] }) }),
  });
  assert.equal(noModels.verified, false);
  assert.equal(noModels.providerHealth.availability, "configured");
  assert.equal(await observeLocalReasonerReady({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [], models: [] }) }),
  }), false);

  const unavailable = await probeLocalReasoner({ fetchImpl: async () => { throw new Error("connection refused"); } });
  assert.equal(unavailable.verified, false);
  assert.equal(unavailable.providerHealth.availability, "unavailable");
  assert.equal(unavailable.providerHealth.errorCode, "connection-unavailable");
});

test("Ollama-only loopback is sufficient to mark the local reasoner live", async () => {
  const result = await probeLocalReasoner({
    fetchImpl: async (url) => {
      if (url === LOCAL_REASONER_ENDPOINTS.ollama) {
        return { ok: true, status: 200, json: async () => ({ models: [{ name: "secret-qwen", digest: `sha256:${RUNTIME_SHA256}`, size: 420 }] }) };
      }
      throw new Error("lm studio down");
    },
    modelSupplyChain: ADMITTED_POLICY,
    now: NOW,
  });
  assert.equal(result.verified, true);
  assert.equal(result.providerHealth.ollama.availability, "healthy");
  assert.equal(result.providerHealth.lmStudio.availability, "unavailable");
  assert.equal(JSON.stringify(result).includes("secret-qwen"), false);
  assert.equal(await observeLocalReasonerReady({
    fetchImpl: async (url) => {
      if (url === LOCAL_REASONER_ENDPOINTS.ollama) {
        return { ok: true, status: 200, json: async () => ({ models: [{ name: "secret-qwen", digest: `sha256:${RUNTIME_SHA256}`, size: 420 }] }) };
      }
      throw new Error("lm studio down");
    },
    modelSupplyChain: ADMITTED_POLICY,
    now: NOW,
  }), true);
});

test("local reasoning execution remains explicitly disabled until transient results are available", () => {
  assert.deepEqual(localReasonerExecutionBoundary(), {
    executionEnabled: false,
    reason: "transient-result-channel-required",
    promptPersistenceAllowed: false,
    responsePersistenceAllowed: false,
  });
});

test("loaded loopback models stay unverified without an admitted immutable digest", async () => {
  const result = await probeLocalReasoner({
    fetchImpl: async (url) => {
      if (url === LOCAL_REASONER_ENDPOINTS.ollama) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ models: [{ name: "untrusted-local-name", digest: `sha256:${"a".repeat(64)}`, size: 42 }] }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    },
  });

  assert.equal(result.verified, false);
  assert.equal(result.providerHealth.availability, "configured");
  assert.equal(result.providerHealth.errorCode, "model-supply-chain-unadmitted");
  assert.match(result.summary, /no admitted models/i);
  assert.equal(JSON.stringify(result).includes("untrusted-local-name"), false);
});
