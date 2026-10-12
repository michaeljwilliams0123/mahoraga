import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { preflightReadonlyActivation } from "../scripts/cloudflare-readonly-activation-preflight.mjs";

const nowMs = Date.parse("2026-10-12T18:00:00Z");
const accountId = "a".repeat(32);
const auditToken = "dedicated-read-only-token-test-".repeat(2);
const version = "12345678-1234-1234-1234-123456789abc";
const deploymentId = "43215678-1234-1234-1234-123456789abc";
const attestation = () => ({
  schemaVersion: 1, evidenceSource: "cloudflare-account-api",
  accountIdHash: createHash("sha256").update(accountId).digest("hex"),
  defaultUsageModel: "standard", billableAccountSubscriptionCount: 0,
  verifiedAt: nowMs - 3000, expiresAt: nowMs + 90 * 60000,
});
const proof = (overrides = {}) => ({
  success: true, result: { deployments: [{
    id: deploymentId, created_on: new Date(nowMs - 60_000).toISOString(),
    versions: [{ version_id: version, percentage: 100 }], ...overrides,
  }] },
});
const fakeFetch = async (input, init) => {
  assert.equal(String(input), "https://api.cloudflare.com/client/v4/accounts/" + accountId
    + "/workers/scripts/mahoraga-owner-gateway/deployments");
  assert.equal(init.method, "GET");
  assert.equal(init.redirect, "error");
  assert.equal(new Headers(init.headers).get("authorization"), "Bearer " + auditToken);
  assert.equal(new Headers(init.headers).get("cache-control"), "no-store");
  return Response.json(proof());
};
const input = (extra = {}) => ({
  accountId, auditToken, billingAttestation: attestation(),
  fetchImpl: fakeFetch, nowMs, ...extra,
});

test("preflight accepts only real 100%-traffic account observation and keeps authority separate", async () => {
  const receipt = await preflightReadonlyActivation(input());
  assert.equal(receipt.status, "admitted-for-deployment-only");
  assert.equal(receipt.accountBillingZeroCredit, true);
  assert.equal(receipt.requestedCapability, "cloud.inspect");
  assert.equal(receipt.executionAuthorityGranted, false);
  assert.equal(receipt.deploymentId, deploymentId);
  assert.equal(receipt.versionId, version);
  assert.equal(receipt.trafficPercentage, 100);
  assert.doesNotMatch(JSON.stringify(receipt), /dedicated-read-only-token-test|Bearer|accountIdHash|CLOUDFLARE_/);
});

test("missing credentials fail before any network request or partial deployment", async () => {
  let called = false;
  const noFetch = async () => { called = true; throw new Error("network-access-unexpected"); };
  for (const bad of [{ auditToken: "" }, { auditToken: "short" }, { accountId: "not-id" }]) {
    await assert.rejects(preflightReadonlyActivation(input({ ...bad, fetchImpl: noFetch })),
      /readonly-inspection-credentials-unavailable/);
  }
  assert.equal(called, false);
});

test("stale, foreign, future, and billable billing proofs fail without any API request", async () => {
  let called = false;
  const noFetch = async () => { called = true; throw new Error("unexpected-call"); };
  for (const bill of [
    { ...attestation(), accountIdHash: "b".repeat(64) },
    { ...attestation(), billableAccountSubscriptionCount: 1 },
    { ...attestation(), verifiedAt: nowMs + 6000 },
    { ...attestation(), expiresAt: nowMs + 60000 },
    { ...attestation(), evidenceSource: "self-declared" },
    {},
  ]) {
    await assert.rejects(preflightReadonlyActivation(input({ billingAttestation: bill, fetchImpl: noFetch })),
      /readonly-inspection-billing-proof-unavailable/);
  }
  assert.equal(called, false);
});

test("denied, failed and malformed upstream reads hold provider admission", async () => {
  for (const response of [
    Response.json({ success: false }, { status: 403 }),
    Response.json({ success: true, result: { deployments: [] } }),
    Response.json(proof({ created_on: new Date(nowMs + 5001).toISOString() })),
    Response.json(proof({ versions: [{ version_id: version, percentage: 50 }] })),
    Response.json(proof({ versions: [{ version_id: version, percentage: 50 }, { version_id: version, percentage: 50 }] })),
    Response.json(proof({ id: "bad" })),
    new Response("not-json"),
  ]) {
    await assert.rejects(preflightReadonlyActivation(input({ fetchImpl: async () => response.clone() })),
      /readonly-inspection-(read-unavailable|proof-invalid)/);
  }
  await assert.rejects(preflightReadonlyActivation(input({
    fetchImpl: async () => { throw new Error("Bearer " + auditToken); },
  })), /readonly-inspection-read-unavailable/);
});

test("activation preflight runs before any deployment mutation and only when enabled", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const text = readFileSync(path.join(root, ".github/workflows/cloudflare-execution-runtime.yml"), "utf8");
  const preflight = text.indexOf("name: Preflight opt-in read-only action provider");
  const billing = text.indexOf("cloudflare-zero-credit-attestation.mjs");
  const mutator = text.indexOf("name: Deploy isolated budgeted Workers AI provider");
  assert.ok(billing >= 0 && preflight > billing && mutator > preflight);
  const block = text.slice(preflight, mutator);
  assert.match(block, /if: env.MAHORAGA_READONLY_PROVIDER_ENABLED == 'true'/);
  assert.match(block, /node scripts\/cloudflare-readonly-activation-preflight.mjs/);
  assert.doesNotMatch(block, /wrangler.*deploy|secret put/);
});
