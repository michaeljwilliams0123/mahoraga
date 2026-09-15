import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const REQUIRED = ["Verify (ubuntu-latest)", "Verify (windows-latest)"];

async function controller() {
  return import("../scripts/railway-exact-sha-promotion.mjs");
}

function successfulChecks(sha = SHA_A) {
  return REQUIRED.map((name) => ({ name, head_sha: sha, status: "completed", conclusion: "success", completed_at: "2026-09-14T20:00:00Z" }));
}

function baseGate(overrides = {}) {
  return {
    actor: "michaeljwilliams0123",
    repository: "michaeljwilliams0123/mahoraga",
    ref: "refs/heads/main",
    checkoutSha: SHA_A,
    currentMainSha: SHA_A,
    checkRuns: successfulChecks(),
    ...overrides,
  };
}

test("promotion gate admits only owner-triggered exact current main with both required checks", async () => {
  const { evaluatePromotionGate } = await controller();
  assert.deepEqual(evaluatePromotionGate(baseGate()), { ok: true, targetSha: SHA_A, reason: "promotion-authorized" });
  assert.equal(evaluatePromotionGate(baseGate({ actor: "github-actions[bot]" })).reason, "owner-required");
  assert.equal(evaluatePromotionGate(baseGate({ repository: "other/repo" })).reason, "repository-mismatch");
  assert.equal(evaluatePromotionGate(baseGate({ ref: "refs/heads/dev" })).reason, "main-ref-required");
  assert.equal(evaluatePromotionGate(baseGate({ currentMainSha: SHA_B })).reason, "stale-main-checkout");
});

test("promotion gate fails closed for missing, stale, pending, skipped, or failed checks", async () => {
  const { evaluatePromotionGate } = await controller();
  assert.equal(evaluatePromotionGate(baseGate({ checkRuns: successfulChecks().slice(0, 1) })).reason, "required-check-missing");
  assert.equal(evaluatePromotionGate(baseGate({ checkRuns: successfulChecks(SHA_B) })).reason, "required-check-stale");
  for (const [status, conclusion] of [["in_progress", null], ["completed", "skipped"], ["completed", "failure"]]) {
    const checks = successfulChecks();
    checks[1] = { ...checks[1], status, conclusion };
    assert.equal(evaluatePromotionGate(baseGate({ checkRuns: checks })).reason, "required-check-not-successful");
  }
});

test("workflow is manual owner-only, input-free, fixed, and zero-model", async () => {
  const source = await readFile(path.join(ROOT, ".github", "workflows", "railway-promote.yml"), "utf8");
  assert.match(source, /workflow_dispatch:/);
  assert.doesNotMatch(source, /\binputs\s*:/);
  assert.match(source, /github\.actor == github\.repository_owner/);
  assert.match(source, /contents:\s*read/);
  assert.match(source, /checks:\s*read/);
  assert.match(source, /RAILWAY_PROJECT_TOKEN:\s*\$\{\{\s*secrets\.RAILWAY_PROJECT_TOKEN\s*\}\}/);
  assert.match(source, /node scripts\/railway-exact-sha-promotion\.mjs promote/);
  assert.doesNotMatch(source, /OPENAI|ANTHROPIC|MODEL|provider|schedule:|push:|pull_request:|workflow_run:/i);
});
