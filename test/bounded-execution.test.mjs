import test from "node:test";
import assert from "node:assert/strict";
import { createCancellationScope, deriveChildBudget, validateExecutionBudget } from "../src/bounded-execution.mjs";

const parent = {
  depth: 0,
  maximumDepth: 3,
  maximumChildWorkers: 2,
  maximumCycles: 8,
  maximumTokens: 32000,
  spendingClass: "licensed-cloud",
  inheritedDenyRules: ["network.socket", "process.spawn"],
  childAllowRules: ["repository.read", "repository.write"],
};

test("child execution budgets can only narrow parent authority and resources", () => {
  const child = deriveChildBudget(validateExecutionBudget(parent), { maximumChildWorkers: 1, maximumCycles: 4, maximumTokens: 8000, childAllowRules: ["repository.read"] });
  assert.equal(child.depth, 1);
  assert.equal(child.maximumTokens, 8000);
  assert.deepEqual(child.inheritedDenyRules, ["network.socket", "process.spawn"]);
  assert.deepEqual(child.childAllowRules, ["repository.read"]);
  assert.throws(() => deriveChildBudget(parent, { maximumTokens: 64000 }), /execution-budget-escalation/);
  assert.throws(() => deriveChildBudget({ ...parent, depth: 3 }, {}), /execution-depth-exhausted/);
});

test("cancellation propagates to every descendant scope", () => {
  const root = createCancellationScope();
  const child = root.child();
  const grandchild = child.child();
  root.cancel("owner-stop");
  assert.equal(child.cancelled, true);
  assert.equal(grandchild.reason, "owner-stop");
  assert.throws(() => grandchild.throwIfCancelled(), /execution-cancelled:owner-stop/);
});
