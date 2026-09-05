import test from "node:test";
import assert from "node:assert/strict";
import {
  attestZeroCreditHealth,
  classifyAutonomyProvider,
  selectCreditFreeExecutionPlane,
  assertCreditFreeDispatch,
} from "../src/credit-free-autonomy.mjs";

test("classifies deterministic, local-reasoner, subscription, and metered providers", () => {
  assert.equal(classifyAutonomyProvider("repository"), "credit-free");
  assert.equal(classifyAutonomyProvider("ollama"), "local-reasoner");
  assert.equal(classifyAutonomyProvider("primary-codex-builder"), "subscription-local");
  assert.equal(classifyAutonomyProvider("openai-platform"), "metered");
  assert.equal(classifyAutonomyProvider("mystery"), "unknown");
});

test("admits only credit-free or ready local-reasoner planes", () => {
  assert.equal(selectCreditFreeExecutionPlane({ requestedProvider: "repository" }).ok, true);
  assert.equal(selectCreditFreeExecutionPlane({ requestedProvider: "local-core" }).plane, "local-deterministic");
  assert.equal(selectCreditFreeExecutionPlane({ requestedProvider: "ollama", localReasonerReady: true }).ok, true);
  assert.equal(selectCreditFreeExecutionPlane({ requestedProvider: "ollama" }).reason, "local-reasoner-not-ready");
});

test("never falls back to paid, metered, subscription, or key-backed routes", () => {
  const cases = [
    [{ requestedProvider: "openai-platform" }, "metered-provider-forbidden"],
    [{ requestedProvider: "github-copilot" }, "metered-provider-forbidden"],
    [{ requestedProvider: "primary-codex-builder" }, "subscription-local-not-credit-free"],
    [{ requestedProvider: "repository", allowPaidFallback: true }, "paid-fallback-forbidden"],
    [{ requestedProvider: "repository", spendGrantUsd: 1 }, "spend-grant-not-zero"],
    [{ requestedProvider: "repository", platformApiKeyPresent: true }, "platform-api-key-present"],
    [{ requestedProvider: "unknown-cloud", cloudBudgetAdmissible: true }, "unknown-provider-not-credit-free"],
  ];
  for (const [input, reason] of cases) {
    assert.equal(selectCreditFreeExecutionPlane(input).reason, reason);
  }
});

test("zero-credit health attestation fails closed on metered or unknown providers", () => {
  const healthy = attestZeroCreditHealth({
    providers: ["repository", "local-core"],
    cloudBudgetAdmissible: true,
  });
  assert.equal(healthy.status, "healthy");
  assert.equal(healthy.reason, "zero-credit-attested");

  assert.equal(attestZeroCreditHealth({ providers: ["openai-platform"] }).reason, "metered-provider-present");
  assert.equal(attestZeroCreditHealth({ providers: ["mystery"] }).reason, "unknown-provider-present");
  assert.equal(attestZeroCreditHealth({ providers: ["ollama"] }).reason, "deterministic-plane-missing");
});

test("assertCreditFreeDispatch throws the blocked reason code", () => {
  assert.throws(() => assertCreditFreeDispatch({ requestedProvider: "codex-cloud" }), /metered-provider-forbidden/);
  const admitted = assertCreditFreeDispatch({ requestedProvider: "self-healer" });
  assert.equal(admitted.creditCost, 0);
  assert.equal(admitted.paidFallback, false);
});
