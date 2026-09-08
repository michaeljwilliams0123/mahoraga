import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import * as modelSupplyChain from "../src/model-supply-chain.mjs";

const SHA256 = "b".repeat(64);
const RUNTIME_SHA256 = "d".repeat(64);
const REVISION = "c".repeat(40);
const NOW = "2026-09-08T12:00:00.000Z";
const INSPECTED_AT = "2026-09-08T11:00:00.000Z";
const EXPIRES_AT = "2026-09-09T11:00:00.000Z";

test("static inspection receipts are reproducible from canonical artifact metadata", () => {
  assert.equal(typeof modelSupplyChain.modelInspectionReceiptSha256, "function");
  const metadata = {
    scannerId: "mahoraga-static-model-scan-v1",
    artifactSha256: SHA256,
    artifactSizeBytes: 42,
    trustRemoteCode: false,
    pickleDetected: false,
    executableCodeDetected: false,
    inspectedAt: "2026-09-08T12:00:00.000Z",
    expiresAt: "2026-09-09T12:00:00.000Z",
  };
  const canonical = JSON.stringify(metadata);
  assert.equal(modelSupplyChain.modelInspectionReceiptSha256(metadata), crypto.createHash("sha256").update(canonical).digest("hex"));
});

function validPolicy(overrides = {}) {
  const inspection = inspectionReceipt({
    scannerId: "mahoraga-static-model-scan-v1",
    artifactSha256: SHA256,
    artifactSizeBytes: 42,
    trustRemoteCode: false,
    pickleDetected: false,
    executableCodeDetected: false,
    inspectedAt: INSPECTED_AT,
    expiresAt: EXPIRES_AT,
  });
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
      inspection,
      runtimeBindings: [{ provider: "ollama", digest: RUNTIME_SHA256, sizeBytes: 420 }],
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
  assert.equal(modelSupplyChain.validateModelSupplyChain(policy, { now: NOW }), policy);
});

test("policy rejects remote code, mutable revisions, unsafe paths, executables, and embedded secret or content fields", () => {
  const invalidPolicies = [
    validPolicy({ upstream: { ...validPolicy().upstream, provider: "other-host" } }),
    validPolicy({ upstream: { ...validPolicy().upstream, trustRemoteCode: true } }),
    withEntry((entry) => ({ ...entry, source: { ...entry.source, revision: "main" } })),
    withEntry((entry) => ({ ...entry, source: { ...entry.source, revision: "f".repeat(39) } })),
    withEntry((entry) => ({ ...entry, source: { ...entry.source, revision: "f".repeat(64) } })),
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
    assert.throws(() => modelSupplyChain.validateModelSupplyChain(policy, { now: NOW }), { code: "model-supply-chain-invalid" });
  }
});

test("admission lifecycle is deterministic and revoked artifacts cannot be re-admitted", () => {
  assert.equal(typeof modelSupplyChain.transitionModelAdmission, "function");
  const quarantined = validPolicy().admissions[0];
  const admitted = modelSupplyChain.transitionModelAdmission(quarantined, "admitted", { now: NOW });
  assert.equal(admitted.state, "admitted");
  const revoked = modelSupplyChain.transitionModelAdmission(admitted, "revoked", { now: NOW });
  assert.equal(revoked.state, "revoked");
  assert.throws(() => modelSupplyChain.transitionModelAdmission(revoked, "admitted", { now: NOW }), { code: "model-supply-chain-transition-invalid" });
});

test("runtime admission matches an explicit runtime binding instead of assuming the source artifact digest", () => {
  const admittedPolicy = withEntry((entry) => ({ ...entry, state: "admitted" }));
  assert.deepEqual(
    modelSupplyChain.evaluateRuntimeModelAdmission({ provider: "ollama", digest: `sha256:${RUNTIME_SHA256}`, sizeBytes: 420 }, admittedPolicy, { now: NOW }),
    { admitted: true, state: "admitted", reason: "model-supply-chain-admitted" },
  );
  assert.equal(modelSupplyChain.evaluateRuntimeModelAdmission({ provider: "ollama", digest: SHA256, sizeBytes: 42 }, admittedPolicy, { now: NOW }).admitted, false);
  assert.equal(modelSupplyChain.evaluateRuntimeModelAdmission({ provider: "ollama", digest: RUNTIME_SHA256, sizeBytes: 419 }, admittedPolicy, { now: NOW }).admitted, false);
  const revokedPolicy = withEntry((entry) => ({ ...entry, state: "revoked" }));
  assert.deepEqual(
    modelSupplyChain.evaluateRuntimeModelAdmission({ provider: "ollama", digest: RUNTIME_SHA256, sizeBytes: 420 }, revokedPolicy, { now: NOW }),
    { admitted: false, state: "revoked", reason: "model-supply-chain-revoked" },
  );
});

test("admission requires fresh digest-bound inspection evidence with safe static-scan findings", () => {
  const base = validPolicy().admissions[0];
  const invalidEntries = [
    withoutKey(base, "inspection"),
    { ...base, inspection: { ...base.inspection, receiptSha256: "0".repeat(64) } },
    withInspection(base, { artifactSha256: "a".repeat(64) }),
    withInspection(base, { artifactSizeBytes: 43 }),
    withInspection(base, { trustRemoteCode: true }),
    withInspection(base, { pickleDetected: true }),
    withInspection(base, { executableCodeDetected: true }),
    withInspection(base, { scannerId: "scanner with spaces" }),
    withInspection(base, { scannerId: `scanner-${"x".repeat(64)}` }),
    { ...base, inspection: { ...base.inspection, content: "model bytes" } },
    { ...base, runtimeBindings: [] },
  ];
  for (const entry of invalidEntries) {
    assert.throws(
      () => modelSupplyChain.transitionModelAdmission(entry, "admitted", { now: NOW }),
      { code: "model-supply-chain-inspection-invalid" },
    );
  }
});

test("expired or stale inspection receipts cannot admit or execute", () => {
  const expired = withEntry((entry) => ({
    ...withInspection(entry, { inspectedAt: "2026-09-06T11:00:00.000Z", expiresAt: "2026-09-07T11:00:00.000Z" }),
    state: "admitted",
  }));
  assert.deepEqual(
    modelSupplyChain.evaluateRuntimeModelAdmission({ provider: "ollama", digest: RUNTIME_SHA256, sizeBytes: 420 }, expired, { now: NOW }),
    { admitted: false, state: "quarantined", reason: "model-supply-chain-inspection-expired" },
  );

  const staleEntry = withInspection(validPolicy().admissions[0], {
    inspectedAt: "2026-08-30T12:00:00.000Z",
    expiresAt: "2026-09-09T12:00:00.000Z",
  });
  assert.throws(
    () => modelSupplyChain.transitionModelAdmission(staleEntry, "admitted", { now: NOW }),
    { code: "model-supply-chain-inspection-expired" },
  );
});

test("runtime bindings are exact metadata and cannot be replayed or duplicated across admissions", () => {
  const policy = validPolicy();
  const first = policy.admissions[0];
  const secondArtifactSha = "e".repeat(64);
  const second = {
    ...first,
    id: "second-model-artifact",
    source: { ...first.source, repository: "owner/second-model", artifactPath: "weights/second.gguf" },
    artifact: { ...first.artifact, sha256: secondArtifactSha },
    inspection: inspectionReceipt({ ...withoutKey(first.inspection, "receiptSha256"), artifactSha256: secondArtifactSha }),
  };
  const conflicts = [
    { ...policy, admissions: [first, second] },
    { ...policy, admissions: [{ ...first, runtimeBindings: [first.runtimeBindings[0], first.runtimeBindings[0]] }] },
    { ...policy, admissions: [{ ...first, runtimeBindings: [{ ...first.runtimeBindings[0], content: "model" }] }] },
  ];
  for (const candidate of conflicts) {
    assert.throws(() => modelSupplyChain.validateModelSupplyChain(candidate, { now: NOW }), { code: "model-supply-chain-invalid" });
  }
});

test("admission decisions contain no repository, artifact path, runtime name, URL, credential, or model content", () => {
  const policy = withEntry((entry) => ({ ...entry, state: "admitted" }));
  const decision = modelSupplyChain.evaluateRuntimeModelAdmission({
    provider: "ollama",
    digest: `sha256:${RUNTIME_SHA256}`,
    sizeBytes: 420,
    name: "private-runtime-name",
    content: "private-model-content",
    credential: "private-token",
  }, policy, { now: NOW });
  const serialized = JSON.stringify(decision);
  for (const forbidden of ["owner/model", "weights/model.gguf", "private-runtime-name", "private-model-content", "private-token", "https://"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

function withEntry(transform) {
  const policy = validPolicy();
  return { ...policy, admissions: [transform(policy.admissions[0])] };
}

function inspectionReceipt(metadata) {
  return { ...metadata, receiptSha256: modelSupplyChain.modelInspectionReceiptSha256(metadata) };
}

function withInspection(entry, changes) {
  const metadata = { ...withoutKey(entry.inspection, "receiptSha256"), ...changes };
  return { ...entry, inspection: inspectionReceipt(metadata) };
}

function withoutKey(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}
