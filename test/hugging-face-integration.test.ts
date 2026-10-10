import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
// @ts-ignore Existing JavaScript validator is migration debt.
import { modelInspectionReceiptSha256 } from "../src/model-supply-chain.mjs";
import {
  discoverHuggingFace,
  evaluateHuggingFaceAdmission,
  probeHuggingFaceLocalReadiness,
  scoreHuggingFaceBenchmark,
} from "../src/hugging-face-integration.ts";

const REVISION = "c".repeat(40);
const ARTIFACT = "a".repeat(64);
const RUNTIME = "d".repeat(64);
const NOW = new Date("2026-10-09T17:00:00.000Z");
function fixturePolicy() {
  const metadata = {
    scannerId: "mahoraga-static-model-scan-v1",
    artifactSha256: ARTIFACT, artifactSizeBytes: 42,
    trustRemoteCode: false, pickleDetected: false, executableCodeDetected: false,
    inspectedAt: "2026-10-09T16:00:00.000Z", expiresAt: "2026-10-10T16:00:00.000Z",
  };
  return {
    schemaVersion: 1,
    policyId: "test-hf-model-admission-v1",
    upstream: { provider: "huggingface", origin: "https://huggingface.co", immutableRevisionRequired: true, trustRemoteCode: false },
    allowedFormats: ["safetensors", "gguf"],
    runtimeProviders: ["ollama", "lm-studio"],
    admissions: [{
      id: "reviewed-test-model",
      state: "admitted",
      source: { provider: "huggingface", repository: "owner/model", revision: REVISION, artifactPath: "weights/model.gguf", trustRemoteCode: false },
      artifact: { format: "gguf", sha256: ARTIFACT, sizeBytes: 42 },
      inspection: { ...metadata, receiptSha256: modelInspectionReceiptSha256(metadata) },
      runtimeBindings: [{ provider: "ollama", digest: RUNTIME, sizeBytes: 420 }],
    }],
  };
}
const candidate = () => ({
  repoId: "owner/model", revision: REVISION, artifactSha256: ARTIFACT,
  provider: "ollama" as const, runtimeDigest: RUNTIME, runtimeSizeBytes: 420,
});
const dev = { NODE_ENV: "development", ALLOW_LOCAL_AI_DEV: "true" };

test("public catalog requests are GET-only, bounded, unauthenticated, and never auto-admit candidates", async () => {
  let called = 0;
  const result = await discoverHuggingFace("models", "qwen", {
    limit: 2,
    fetchImpl: async (url, init) => {
      called++;
      const target = new URL(String(url));
      assert.equal(target.origin, "https://huggingface.co");
      assert.equal(target.pathname, "/api/models");
      assert.equal(target.searchParams.get("search"), "qwen");
      assert.equal(target.searchParams.get("sort"), "downloads");
      assert.equal(target.searchParams.get("limit"), "2");
      assert.equal(init?.method, "GET");
      assert.equal(init?.credentials, "omit");
      assert.equal(init?.redirect, "error");
      assert.equal(init?.headers && "Authorization" in init.headers, false);
      return new Response(JSON.stringify([
        { id: "owner/model", sha: REVISION, downloads: 10, cardData: { license: "apache-2.0" }, gated: false },
        { id: "owner/gated-model", sha: "main", downloads: 11, private: true, gated: true, token: "sensitive" },
        { id: "extra/ignored", sha: REVISION },
      ]), { status: 200 });
    },
  });
  assert.equal(called, 1);
  assert.equal(result.kind, "models");
  if (result.kind !== "models") throw new Error("unexpected-kind");
  assert.equal(result.count, 2);
  assert.equal(result.candidates[0]?.revision, REVISION);
  assert.equal(result.candidates[0]?.license, "apache-2.0");
  assert.equal(result.candidates[1]?.revision, null);
  assert.equal(result.candidates[1]?.private, true);
  assert.equal(result.candidates[0]?.admissionState, "requires-independent-inspection");
  assert.equal(result.inferencePerformed, false);
  assert.equal(result.creditCost, 0);
  assert.equal(JSON.stringify(result).includes("sensitive"), false);
});

test("research search emits bounded paper metadata, never instructions or abstracts", async () => {
  const result = await discoverHuggingFace("papers", "agent safety", {
    fetchImpl: async (url) => {
      assert.equal(new URL(String(url)).pathname, "/api/papers/search");
      return new Response(JSON.stringify([
        { id: "2501.12345", title: "Agent Evaluation", publishedAt: "2026-10-08T00:00:00.000Z", abstract: "RUN MALICIOUS COMMAND" },
        { id: "invalid-paper", title: "bad" },
      ]), { status: 200 });
    },
  });
  assert.equal(result.kind, "papers");
  if (result.kind !== "papers") throw new Error("unexpected-kind");
  assert.deepEqual(result.papers, [{ id: "2501.12345", title: "Agent Evaluation", publishedAt: "2026-10-08T00:00:00.000Z" }]);
  assert.equal(JSON.stringify(result).includes("MALICIOUS"), false);
});

test("discovery rejects invalid arguments, remote redirects, bad schemas, oversized data, and upstream failures", async () => {
  await assert.rejects(discoverHuggingFace("models", "", {}), /hf-discovery-input-invalid/);
  await assert.rejects(discoverHuggingFace("models", "qwen", { limit: 21 }), /hf-discovery-input-invalid/);
  await assert.rejects(discoverHuggingFace("models", "qwen", { fetchImpl: async () => new Response("bad", { status: 403 }) }), /hf-discovery-upstream-unavailable/);
  await assert.rejects(discoverHuggingFace("models", "qwen", { fetchImpl: async () => new Response("{}", { status: 200 }) }), /hf-discovery-invalid-schema/);
  await assert.rejects(discoverHuggingFace("models", "qwen", { fetchImpl: async () => new Response("x".repeat(140_000), { status: 200 }) }), /hf-discovery-response-too-large/);
  await assert.rejects(discoverHuggingFace("models", "qwen", { fetchImpl: async () => { throw new Error("private-token"); } }), /hf-discovery-upstream-unavailable/);
});

test("admission remains tied to immutable source, exact artifact, runtime digest and fresh inspection", () => {
  const policy = fixturePolicy();
  const ok = evaluateHuggingFaceAdmission(candidate(), { policy, now: NOW });
  assert.deepEqual(ok, { admitted: true, reason: "model-supply-chain-admitted", activationPerformed: false, creditCost: 0 });
  for (const invalid of [
    { revision: "main" }, { repoId: "other/model" }, { artifactSha256: "b".repeat(64) },
    { runtimeDigest: "e".repeat(64) }, { runtimeSizeBytes: 421 }, { gated: true }, { private: true },
  ]) {
    assert.equal(evaluateHuggingFaceAdmission({ ...candidate(), ...invalid }, { policy, now: NOW }).admitted, false);
  }
  assert.equal(evaluateHuggingFaceAdmission(candidate()).admitted, false);
  assert.equal(evaluateHuggingFaceAdmission(candidate(), { policy, now: new Date("2026-10-11T00:00:00.000Z") }).admitted, false);
  assert.equal(evaluateHuggingFaceAdmission(candidate(), { policy: { ...policy, upstream: { ...policy.upstream, trustRemoteCode: true } }, now: NOW }).admitted, false);
  assert.equal(evaluateHuggingFaceAdmission(candidate(), { policy: { ...policy, admissions: [{ ...policy.admissions[0], state: "revoked" }] }, now: NOW }).admitted, false);
});

test("local readiness performs only existing loopback probes with admitted models in development", async () => {
  const calls: string[] = [];
  const report = await probeHuggingFaceLocalReadiness({
    env: dev, now: NOW, policy: fixturePolicy(),
    fetchImpl: async (input, init) => {
      calls.push(String(input));
      assert.equal(init?.method, "GET");
      assert.equal(init?.redirect, "error");
      if (String(input).includes("11434")) {
        return new Response(JSON.stringify({ models: [{ name: "secret-name", digest: `sha256:${RUNTIME}`, size: 420 }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });
  assert.equal(report.status, "model-ready");
  assert.equal(report.admittedModelCount, 1);
  assert.equal(report.executionEnabled, false);
  assert.equal(report.inferencePerformed, false);
  assert.equal(report.creditCost, 0);
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(report).includes("secret-name"), false);
});

test("production local probes cannot be enabled by an approved policy alone", async () => {
  let touched = false;
  const report = await probeHuggingFaceLocalReadiness({
    env: { NODE_ENV: "production", ALLOW_LOCAL_AI_DEV: "true" }, now: NOW, policy: fixturePolicy(),
    fetchImpl: async () => { touched = true; throw new Error("should-not-be-called"); },
  });
  assert.equal(report.status, "hold");
  assert.equal(touched, false);
  assert.equal(report.productionActivated, false);
});

test("offline benchmark scoring is reproducible, order-independent and explicitly unverified", () => {
  const pass = createHash("sha256").update("expected").digest("hex");
  const fail = createHash("sha256").update("wrong").digest("hex");
  const sample = {
    suiteId: "local-hf-regression-v1",
    cases: [{ id: "first-case", expectedSha256: pass }, { id: "second-case", expectedSha256: pass }],
    observations: [
      { id: "second-case", status: "failed" as const, resultSha256: fail, durationMs: 50 },
      { id: "first-case", status: "completed" as const, resultSha256: pass, durationMs: 10 },
    ],
  };
  const one = scoreHuggingFaceBenchmark(sample);
  const two = scoreHuggingFaceBenchmark({ ...sample, cases: [...sample.cases].reverse(), observations: [...sample.observations].reverse() });
  assert.deepEqual(one, two);
  assert.equal(one.passRate, 0.5);
  assert.equal(one.passed, 1);
  assert.equal(one.failed, 1);
  assert.equal(one.mismatched, 0);
  assert.equal(one.failureRate, 0.5);
  assert.equal(one.medianDurationMs, 10);
  assert.equal(one.p95DurationMs, 50);
  assert.equal(one.evidenceClass, "unverified-offline-score-only");
  assert.equal(one.promotionEligible, false);
  assert.equal(one.modelExecutionVerified, false);
  assert.equal(one.creditCost, 0);
  assert.equal(JSON.stringify(one).includes(pass), false);
});

test("benchmark rejects duplicate IDs, missing observations, output content, bad durations and invalid hashes", () => {
  const value = "f".repeat(64);
  const one = { suiteId: "suite-v1", cases: [{ id: "case-1", expectedSha256: value }], observations: [{ id: "case-1", status: "completed" as const, resultSha256: value, durationMs: 2 }] };
  for (const patch of [
    { cases: [...one.cases, ...one.cases], observations: [...one.observations, ...one.observations] },
    { observations: [{ ...one.observations[0]!, id: "wrong-id" }] },
    { observations: [{ ...one.observations[0]!, durationMs: Infinity }] },
    { observations: [{ ...one.observations[0]!, resultSha256: "none" }] },
    { observations: [{ ...one.observations[0]!, status: "completed", resultSha256: null }] },
    { suiteId: "invalid suite" },
    { cases: [] },
  ]) assert.throws(() => scoreHuggingFaceBenchmark({ ...one, ...patch } as never), /hf-benchmark-input-invalid/);
});


test("admission never borrows a runtime digest from a different admitted model", () => {
  const base = fixturePolicy();
  const secondArtifact = "b".repeat(64);
  const secondRuntime = "e".repeat(64);
  const { receiptSha256: _receipt, ...metadata } = base.admissions[0]!.inspection;
  const secondMetadata = { ...metadata, artifactSha256: secondArtifact };
  const second = {
    ...base.admissions[0]!,
    id: "other-admitted-model",
    source: { ...base.admissions[0]!.source, repository: "other/model" },
    artifact: { ...base.admissions[0]!.artifact, sha256: secondArtifact },
    inspection: { ...secondMetadata, receiptSha256: modelInspectionReceiptSha256(secondMetadata) },
    runtimeBindings: [{ provider: "ollama", digest: secondRuntime, sizeBytes: 421 }],
  };
  const policy = { ...base, admissions: [base.admissions[0]!, second] };
  const borrowed = evaluateHuggingFaceAdmission(
    { ...candidate(), runtimeDigest: secondRuntime, runtimeSizeBytes: 421 },
    { policy, now: NOW },
  );
  assert.equal(borrowed.admitted, false);
  assert.equal(borrowed.reason, "hf-runtime-binding-mismatch");
  assert.equal(evaluateHuggingFaceAdmission({
    ...candidate(), repoId: "other/model", artifactSha256: secondArtifact,
    runtimeDigest: secondRuntime, runtimeSizeBytes: 421,
  }, { policy, now: NOW }).admitted, true);
});

test("offline benchmarks reject undeclared content at every depth", () => {
  const digest = "f".repeat(64);
  const sample = {
    suiteId: "suite-v1",
    cases: [{ id: "case-1", expectedSha256: digest }],
    observations: [{ id: "case-1", status: "completed" as const, resultSha256: digest, durationMs: 2 }],
  };
  const contaminated = [
    { ...sample, prompt: "private text" },
    { ...sample, cases: [{ ...sample.cases[0]!, question: "private question" }] },
    { ...sample, observations: [{ ...sample.observations[0]!, response: "private answer" }] },
  ];
  for (const input of contaminated) {
    assert.throws(() => scoreHuggingFaceBenchmark(input), /hf-benchmark-input-invalid/);
  }
});

test("model search accepts license tags as unverified discovery metadata", async () => {
  const result = await discoverHuggingFace("models", "model", {
    fetchImpl: async () => new Response(JSON.stringify([
      { id: "owner/model", sha: REVISION, tags: ["safetensors", "license:apache-2.0"], gated: false },
    ]), { status: 200 }),
  });
  assert.equal(result.kind, "models");
  if (result.kind !== "models") throw new Error("unexpected-kind");
  assert.equal(result.candidates[0]?.license, "apache-2.0");
  assert.equal(result.candidates[0]?.admissionState, "requires-independent-inspection");
});
