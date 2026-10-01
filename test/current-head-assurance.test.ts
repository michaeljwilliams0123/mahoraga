import test from "node:test";
import assert from "node:assert/strict";
import { validateCurrentHeadAssurance, validatePromotionExecutor } from "../src/current-head-assurance.ts";
const sha = "a".repeat(40), now = Date.parse("2026-10-01T18:00:00Z"), observedAt = new Date(now).toISOString();
const ledger = () => ({ repositoryIdentity: "michaeljwilliams0123/mahoraga", branch: "main", commitSha: sha, workflowVersion: "verify-v1", commands: [{ id: "verify", conclusion: "success" }], observedAt });
const context = () => ({ repositoryIdentity: "michaeljwilliams0123/mahoraga", commitSha: sha, observedAt });
test("matching old ledgers do not prove current main", () => {
 assert.equal(validateCurrentHeadAssurance({ github: ledger(), gitlab: ledger(), authoritativeMain: { ...context(), commitSha: "b".repeat(40) } }, { now }).reason, "secondary-assurance-stale-source");
 assert.equal(validateCurrentHeadAssurance({ github: ledger(), gitlab: ledger() }, { now }).reason, "authoritative-main-unavailable");
});
test("fresh current evidence accepts GitLab passed as equivalent to GitHub success", () => {
 const peer = { ...ledger(), commands: [{ id: "verify", conclusion: "passed" }] };
 assert.equal(validateCurrentHeadAssurance({ github: ledger(), gitlab: peer, authoritativeMain: context() }, { now }).ok, true);
});
test("malformed, stale, future, empty and duplicate command evidence fail", () => {
 for (const peer of [{ ...ledger(), observedAt: "2026-09-30T18:00:00Z" }, { ...ledger(), observedAt: "2026-10-02T18:00:00Z" }, { ...ledger(), commands: [] }, { ...ledger(), commands: [ledger().commands[0], ledger().commands[0]] }, { ...ledger(), commands: null }]) assert.equal(validateCurrentHeadAssurance({ github: ledger(), gitlab: peer, authoritativeMain: context() }, { now }).ok, false);
});
const executor = () => ({ objectiveId: "objective-1", sourceSha: sha, verifyRunId: 42, verifyConclusion: "success", identity: "github-hosted-ubuntu", labels: ["ubuntu-latest"], provenanceDigest: "c".repeat(64), capability: "cloudflare.deploy", observedAt, health: "healthy", authorityVersion: "epoch-1", deploymentId: "deployment-1", independent: true });
test("promotion rechecks identity and present authority immediately before mutation", () => {
 const prior = executor(), current = executor();
 assert.equal(validatePromotionExecutor({ prior, current, expectedSha: sha, authorityVersion: "epoch-1", objectiveId: "objective-1" }, { now }).ok, true);
 for (const patch of [{ identity: "identity-twin" }, { provenanceDigest: "d".repeat(64) }, { authorityVersion: "epoch-2" }, { deploymentId: "deployment-2" }, { observedAt: "2026-09-30T18:00:00Z" }, { independent: false }, { health: "unknown" }]) assert.equal(validatePromotionExecutor({ prior, current: { ...current, ...patch }, expectedSha: sha, authorityVersion: "epoch-1", objectiveId: "objective-1" }, { now }).ok, false);
});
