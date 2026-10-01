import test from "node:test";
import assert from "node:assert/strict";
import { projectAcceptanceEvidence } from "../lib/acceptance-evidence.ts";
const sha = "a".repeat(40), now = Date.parse("2026-10-01T18:00:00Z");
const options = { expectedSha: sha, deploymentSha: sha, now };
const receipt = () => ({ schemaVersion: 1, kind: "cloudflare-execution-runtime-acceptance", status: "accepted", targetSha: sha, accessProtected: true, ready: true, durableStateVerified: true, runtimeAttestationVerified: true, trafficAuthorityVerified: true, railwayNoRouteVerified: true, railwayNoInfluenceVerified: true, staleShaRejected: true, executed: true, replayed: true, durableContinuityVerified: true, hardZeroBillingVerified: true, failClosedZeroBillingVerified: true, providerCognitionVerified: true, noRailwayFallbackVerified: true, providerId: "cloudflare-workers-ai", modelId: "@cf/zai-org/glm-4.7-flash", executionUniqueness: { logicalRequests: 3, providerExecutions: 1, receipts: 1, conflicts: 1, replays: 1, atMostOneVerified: true }, observedAt: new Date(now).toISOString() });
test("projects current complete evidence without conflating replay with execution", () => {
 const result = projectAcceptanceEvidence(receipt(), options);
 assert.equal(result.state, "observed"); assert.equal(result.providerCognitionVerified, true);
 assert.equal(result.executions, 1); assert.equal(result.replays, 1);
});
test("missing and partial evidence remain unobserved", () => {
 assert.equal(projectAcceptanceEvidence(undefined, options).state, "absent");
 assert.equal(projectAcceptanceEvidence({ providerCognitionVerified: true }, options).providerCognitionVerified, false);
 const partial = { ...receipt(), providerCognitionVerified: false };
 assert.equal(projectAcceptanceEvidence(partial, options).state, "partial");
});
test("stale source, deployment, clock and duplicate execution fail closed", () => {
 for (const [input, opts] of [[{ ...receipt(), targetSha: "b".repeat(40) }, options], [receipt(), { ...options, deploymentSha: "b".repeat(40) }], [{ ...receipt(), observedAt: "2026-09-30T18:00:00Z" }, options], [{ ...receipt(), executionUniqueness: { ...receipt().executionUniqueness, providerExecutions: 2 } }, options], [receipt(), { ...options, now: NaN }]] as const) {
  const result = projectAcceptanceEvidence(input, opts); assert.equal(result.state, "hold"); assert.equal(result.providerCognitionVerified, false);
 }
});
test("private or bypassed evidence never becomes displayed metadata", () => {
 for (const input of [{ ...receipt(), token: "private-sentinel" }, { ...receipt(), "x-bypass-applied": true }, { ...receipt(), providerId: "https://secret.example/token" }]) {
  const result = projectAcceptanceEvidence(input, options); assert.equal(result.state, "hold"); assert.doesNotMatch(JSON.stringify(result), /private-sentinel|secret.example/);
 }
});
