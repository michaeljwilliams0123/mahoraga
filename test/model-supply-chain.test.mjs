import test from "node:test";
import assert from "node:assert/strict";
import * as modelSupplyChain from "../src/model-supply-chain.mjs";

const SHA256 = "b".repeat(64);
const REVISION = "c".repeat(40);

function validPolicy(overrides = {}) {
  return {
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
      id: "test-model-artifact",
      state: "quarantined",
      source: {
        provider: "huggingface",
        repository: "owner/model",
        revision: REVISION,
        artifactPath: "weights/model.gguf",
        trustRemoteCode: false,
      },
      artifact: { format: "gguf", sha256: SHA256, sizeBytes: 42 },
    }],
    ...overrides,
  };
}

test("model supply-chain policy exposes a deterministic validator and ships with no admitted model", () => {
  assert.equal(typeof modelSupplyChain.validateModelSupplyChain, "function");
  assert.equal(modelSupplyChain.validateModelSupplyChain(modelSupplyChain.DEFAULT_MODEL_SUPPLY_CHAIN), modelSupplyChain.DEFAULT_MODEL_SUPPLY_CHAIN);
  assert.equal(modelSupplyChain.DEFAULT_MODEL_SUPPLY_CHAIN.upstream.provider, "huggingface");
  assert.equal(modelSupplyChain.DEFAULT_MODEL_SUPPLY_CHAIN.upstream.trustRemoteCode, false);
  assert.deepEqual(modelSupplyChain.DEFAULT_MODEL_SUPPLY_CHAIN.admissions, []);
});

test("policy accepts only immutable Hugging Face metadata for safetensors or GGUF artifacts", () => {
  const policy = validPolicy();
  assert.equal(modelSupplyChain.validateModelSupplyChain(policy), policy);
});

test("policy rejects remote code, mutable revisions, unsafe paths, executables, and embedded secret or content fields", () => {
  const invalidPolicies = [
    validPolicy({ upstream: { ...validPolicy().upstream, provider: "other-host" } }),
    validPolicy({ upstream: { ...validPolicy().upstream, trustRemoteCode: true } }),
    withEntry((entry) => ({ ...entry, source: { ...entry.source, revision: "main" } })),
    withEntry((entry) => ({ ...entry, source: { ...entry.source, artifactPath: "../model.gguf" } })),
    withEntry((entry) => ({ ...entry, source: { ...entry.source, artifactPath: "https://host/model.gguf" } })),
    ...["bin", "pkl", "py", "exe"].map((extension) => withEntry((entry) => ({
      ...entry,
      source: { ...entry.source, artifactPath: `weights/model.${extension}` },
      artifact: { ...entry.artifact, format: "gguf" },
    }))),
    withEntry((entry) => ({ ...entry, source: { ...entry.source, trustRemoteCode: true } })),
    withEntry((entry) => ({ ...entry, artifact: { ...entry.artifact, sha256: "short" } })),
    withEntry((entry) => ({ ...entry, artifact: { ...entry.artifact, sizeBytes: 0 } })),
    withEntry((entry) => ({ ...entry, credential: "secret" })),
    withEntry((entry) => ({ ...entry, content: "weights" })),
  ];

  for (const policy of invalidPolicies) {
    assert.throws(() => modelSupplyChain.validateModelSupplyChain(policy), { code: "model-supply-chain-invalid" });
  }
});

test("admission lifecycle is deterministic and revoked artifacts cannot be re-admitted", () => {
  assert.equal(typeof modelSupplyChain.transitionModelAdmission, "function");
  const quarantined = validPolicy().admissions[0];
  const admitted = modelSupplyChain.transitionModelAdmission(quarantined, "admitted");
  assert.equal(admitted.state, "admitted");
  const revoked = modelSupplyChain.transitionModelAdmission(admitted, "revoked");
  assert.equal(revoked.state, "revoked");
  assert.throws(() => modelSupplyChain.transitionModelAdmission(revoked, "admitted"), { code: "model-supply-chain-transition-invalid" });
});

test("runtime admission requires both immutable digest and exact artifact size and honors revocation", () => {
  const admittedPolicy = withEntry((entry) => ({ ...entry, state: "admitted" }));
  assert.deepEqual(
    modelSupplyChain.evaluateRuntimeModelAdmission({ provider: "ollama", digest: `sha256:${SHA256}`, sizeBytes: 42 }, admittedPolicy),
    { admitted: true, state: "admitted", reason: "model-supply-chain-admitted" },
  );
  assert.equal(modelSupplyChain.evaluateRuntimeModelAdmission({ provider: "ollama", digest: SHA256, sizeBytes: 41 }, admittedPolicy).admitted, false);
  const revokedPolicy = withEntry((entry) => ({ ...entry, state: "revoked" }));
  assert.deepEqual(
    modelSupplyChain.evaluateRuntimeModelAdmission({ provider: "ollama", digest: SHA256, sizeBytes: 42 }, revokedPolicy),
    { admitted: false, state: "revoked", reason: "model-supply-chain-revoked" },
  );
});

test("admission decisions contain no repository, artifact path, runtime name, URL, credential, or model content", () => {
  const policy = withEntry((entry) => ({ ...entry, state: "admitted" }));
  const decision = modelSupplyChain.evaluateRuntimeModelAdmission({
    provider: "ollama",
    digest: `sha256:${SHA256}`,
    sizeBytes: 42,
    name: "private-runtime-name",
    content: "private-model-content",
    credential: "private-token",
  }, policy);
  const serialized = JSON.stringify(decision);
  for (const forbidden of ["owner/model", "weights/model.gguf", "private-runtime-name", "private-model-content", "private-token", "https://"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

function withEntry(transform) {
  const policy = validPolicy();
  return { ...policy, admissions: [transform(policy.admissions[0])] };
}
