import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { evaluateLiveMainProtection, parseMainProtectionContract } from "../src/github-live-protection.mjs";

const contract = parseMainProtectionContract(await readFile(path.join(ROOT, "config/main-protection.contract.json"), "utf8"));

function ruleset(overrides = {}) {
  return {
    id: 22327855,
    enforcement: "active",
    target: "branch",
    conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      { type: "pull_request", parameters: { required_approving_review_count: 0 } },
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [
            { context: "Verify (ubuntu-latest)" },
            { context: "Verify (windows-latest)" },
            { context: "Verify unified Vercel workspace" },
          ],
        },
      },
    ],
    ...overrides,
  };
}

test("live main protection admits an active exact-head Verify ruleset", () => {
  const report = evaluateLiveMainProtection({ rulesets: [ruleset()], contract });
  assert.equal(report.ok, true);
  assert.equal(report.reason, "live-main-protection-attested");
  assert.equal(report.creditCost, 0);
  assert.equal(report.paidFallback, false);
});

test("live main protection fails closed without rulesets, force-push, or missing Verify contexts", () => {
  assert.equal(evaluateLiveMainProtection({ rulesets: [], contract }).reason, "main-unprotected");
  assert.equal(evaluateLiveMainProtection({ rulesets: [ruleset({ enforcement: "disabled" })], contract }).reason, "main-unprotected");
  assert.equal(evaluateLiveMainProtection({
    rulesets: [ruleset({ rules: [{ type: "deletion" }, { type: "pull_request" }, { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "Verify (ubuntu-latest)" }] } }] })],
    contract,
  }).reason, "main-force-push-not-blocked");
  assert.equal(evaluateLiveMainProtection({
    rulesets: [ruleset({ rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      { type: "pull_request" },
      { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "Verify (ubuntu-latest)" }] } },
    ] })],
    contract,
  }).reason, "main-required-checks-missing");
});

test("live main protection requires unified Vercel workspace with Ubuntu and Windows", () => {
  const report = evaluateLiveMainProtection({
    rulesets: [ruleset({ rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      { type: "pull_request" },
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [
            { context: "Verify (ubuntu-latest)" },
            { context: "Verify (windows-latest)" },
          ],
        },
      },
    ] })],
    contract,
  });
  assert.equal(report.reason, "main-required-checks-missing");
  assert.deepEqual(report.missing, ["Verify unified Vercel workspace"]);
});

test("tracked contract is the canonical exact-head Verify set", () => {
  assert.deepEqual(contract.requiredContexts, [
    "Verify (ubuntu-latest)",
    "Verify (windows-latest)",
    "Verify unified Vercel workspace",
  ]);
  assert.equal(contract.strictExactHead, true);
  assert.equal(contract.deletionAllowed, false);
  assert.equal(contract.forcePushAllowed, false);
});
