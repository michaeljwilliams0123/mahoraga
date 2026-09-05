import test from "node:test";
import assert from "node:assert/strict";
import {
  CREDIT_FREE_PROTOCOL_STEPS,
  attestZeroCreditHealth,
  classifyAutonomyProvider,
  creditFreeGraphNodes,
  maintainCreditFreeAutonomy,
  selectCreditFreeExecutionPlane,
  assertCreditFreeDispatch,
} from "../src/credit-free-autonomy.mjs";
import { buildAutonomyObjective } from "../src/autonomy-orchestrator.mjs";
import { createTaskRouter } from "../src/router.mjs";

test("classifies deterministic, local-reasoner, subscription, and metered providers", () => {
  assert.equal(classifyAutonomyProvider("repository"), "credit-free");
  assert.equal(classifyAutonomyProvider("browser"), "credit-free");
  assert.equal(classifyAutonomyProvider("desktop"), "credit-free");
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

test("credit-free protocol graph is observe-decide-act-verify-repair-report on $0 planes", () => {
  assert.deepEqual([...CREDIT_FREE_PROTOCOL_STEPS], ["observe", "decide", "act", "verify", "repair", "report"]);
  const nodes = creditFreeGraphNodes();
  assert.deepEqual(nodes.map((node) => node.id), [...CREDIT_FREE_PROTOCOL_STEPS]);
  for (const node of nodes) {
    assert.equal(node.creditCost, 0);
    assert.equal(node.paidFallback, false);
    assert.equal(classifyAutonomyProvider(node.provider), "credit-free");
  }
});

test("maintainCreditFreeAutonomy refuses paid recovery and dispatches only when healthy", () => {
  const ready = maintainCreditFreeAutonomy({ now: new Date("2026-09-05T07:00:00.000Z") });
  assert.equal(ready.nextAction, "dispatch-credit-free");
  assert.equal(ready.paidFallback, false);
  assert.equal(ready.health.ok, true);

  const refused = maintainCreditFreeAutonomy({ allowPaidFallback: true });
  assert.equal(refused.nextAction, "refuse-paid-route");
  assert.equal(refused.health.reason, "paid-fallback-forbidden");

  const held = maintainCreditFreeAutonomy({ providers: ["ollama"] });
  assert.equal(held.nextAction, "hold-planned");
});

const EXECUTION_CONTRACT = Object.freeze({
  baseCommit: "a".repeat(40),
  allowedPaths: Object.freeze(["src", "test"]),
});

test("credit-free autonomy objectives never lease Codex", () => {
  const objective = buildAutonomyObjective({
    conversationId: "con-00000000-0000-0000-0000-000000000000",
    messageId: "msg-00000000-0000-0000-0000-000000000000",
    message: "Repair the runtime and verify the result.",
    requestedMode: "credit-free",
    creditFreeRequired: true,
    executionContract: EXECUTION_CONTRACT,
  });
  assert.equal(objective.creditFreeRequired, true);
  assert.equal(objective.creditCost, 0);
  assert.equal(objective.paidFallback, false);
  assert.deepEqual(objective.tasks.map((task) => task.id), [...CREDIT_FREE_PROTOCOL_STEPS]);
  assert.equal(objective.tasks.some((task) => task.capability === "codex.execute"), false);
  assert.equal(objective.tasks.some((task) => task.provider === "primary-codex-builder"), false);
  for (const task of objective.tasks) {
    assert.equal(task.creditFreeRequired, true);
    assert.equal(task.creditCost, 0);
    assert.equal(task.paidFallback, false);
    assert.equal(task.baseCommit, EXECUTION_CONTRACT.baseCommit);
  }
});

test("credit-free router admits deterministic workers and blocks Codex", () => {
  const manifest = {
    workers: [
      { id: "repository", costClass: "deterministic" },
      { id: "primary-codex-builder", costClass: "licensed-cloud" },
    ],
  };
  const router = createTaskRouter({
    rankRoutes: () => ({
      reason: null,
      candidates: [
        { workerId: "primary-codex-builder", costClass: "licensed-cloud" },
        { workerId: "repository", costClass: "deterministic" },
      ],
    }),
  });
  const blocked = router(manifest, { capability: "codex.execute", provider: "primary-codex-builder", creditFreeRequired: true, requestedMode: "local" }, { creditFreeRequired: true });
  assert.equal(blocked.status, "waiting");
  assert.equal(blocked.reason, "subscription-local-not-credit-free");

  const admitted = router(manifest, { capability: "repository.verify", provider: "repository", creditFreeRequired: true, requestedMode: "local" }, { creditFreeRequired: true });
  assert.equal(admitted.status, "routable");
  assert.equal(admitted.worker.id, "repository");
  assert.equal(admitted.creditFreeDecision.ok, true);
});
