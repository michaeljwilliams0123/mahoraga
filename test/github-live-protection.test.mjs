import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { evaluateLiveMainProtection, parseLiveRulesetsResponse, parseMainProtectionContract } from "../src/github-live-protection.mjs";

const contract = parseMainProtectionContract(await readFile(path.join(ROOT, "config/main-protection.contract.json"), "utf8"));
const advisoryContract = Object.freeze({ ...contract, liveEnforcementRequired: false });
const strictContract = Object.freeze({ ...contract, liveEnforcementRequired: true });

function ruleset(overrides = {}) {
  return {
    id: 22502690,
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

test("explicit advisory contract admits an intentionally absent ruleset", () => {
  const report = evaluateLiveMainProtection({ rulesets: [], contract: advisoryContract });
  assert.equal(report.ok, true);
  assert.equal(report.status, "advisory-unprotected");
  assert.equal(report.reason, "live-main-protection-temporarily-advisory");
  assert.deepEqual(report.requiredContexts, [
    "Verify (ubuntu-latest)",
    "Verify (windows-latest)",
  ]);
  assert.equal(report.creditCost, 0);
  assert.equal(report.paidFallback, false);
});

test("private free-plan ruleset unavailability is observable only in advisory mode", () => {
  const response = {
    status: 403,
    payload: { message: "Upgrade to GitHub Pro or make this repository public to enable this feature." },
  };
  assert.deepEqual(parseLiveRulesetsResponse(response, advisoryContract), []);
  assert.throws(() => parseLiveRulesetsResponse(response, strictContract), /live-protection-unobserved/);
  assert.throws(() => parseLiveRulesetsResponse({ status: 403, payload: { message: "Forbidden" } }, advisoryContract), /live-protection-unobserved/);
});

test("strict live enforcement still fails closed when a ruleset is required", () => {
  const report = evaluateLiveMainProtection({ rulesets: [], contract: strictContract });
  assert.equal(report.ok, false);
  assert.equal(report.status, "unprotected");
  assert.equal(report.reason, "main-unprotected");
});

test("advisory mode does not excuse a malformed active ruleset", () => {
  assert.equal(evaluateLiveMainProtection({
    rulesets: [ruleset({ rules: [{ type: "deletion" }, { type: "pull_request" }, { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "Verify (ubuntu-latest)" }] } }] })],
    contract: advisoryContract,
  }).reason, "main-force-push-not-blocked");
  assert.equal(evaluateLiveMainProtection({
    rulesets: [ruleset({ rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      { type: "pull_request" },
      { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "Verify (ubuntu-latest)" }] } },
    ] })],
    contract: advisoryContract,
  }).reason, "main-required-checks-missing");
});

test("live main protection does not require the unified Vercel workspace", () => {
  const report = evaluateLiveMainProtection({ rulesets: [ruleset()], contract });
  assert.equal(report.ok, true);
  assert.deepEqual(report.requiredContexts, [
    "Verify (ubuntu-latest)",
    "Verify (windows-latest)",
  ]);
});

test("live main protection fails closed when an observational job is a required check", () => {
  const report = evaluateLiveMainProtection({
    rulesets: [ruleset({
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
    })],
    contract,
  });
  assert.equal(report.ok, false);
  assert.equal(report.reason, "main-required-checks-extra");
  assert.deepEqual(report.extra, ["Verify unified Vercel workspace"]);
  assert.equal(report.creditCost, 0);
  assert.equal(report.paidFallback, false);
});

test("tracked contract preserves exact-head Verify policy while private-plan enforcement is unavailable", () => {
  assert.deepEqual(contract.requiredContexts, [
    "Verify (ubuntu-latest)",
    "Verify (windows-latest)",
  ]);
  assert.equal(contract.liveEnforcementRequired, false);
  assert.equal(contract.strictExactHead, true);
  assert.equal(contract.deletionAllowed, false);
  assert.equal(contract.forcePushAllowed, false);
});
