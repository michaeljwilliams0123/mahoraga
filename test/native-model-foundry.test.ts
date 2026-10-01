import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { trainNativeSmokeModel, loadNativeCheckpoint, predictNativeToken, evaluateCheckpointPromotion } from "../src/native-model-foundry.ts";
const digest = "a".repeat(64);
const input = () => ({ modelId: "mahoraga-smoke-1", seed: 42, epochs: 80, learningRate: 0.2, trainingCodeSha: "b".repeat(40), training: [{ sourceId: "synthetic-train", text: "abababababababababababababab", rights: "owner-authorized" as const, rightsEvidenceDigest: digest }], evaluation: [{ sourceId: "synthetic-heldout", text: "bababababababa", rights: "owner-authorized" as const, rightsEvidenceDigest: digest }] });
test("random initialized native weights learn on separate held-out bytes", () => {
 const run = trainNativeSmokeModel(input());
 assert.ok(run.metrics.heldoutAfter < run.metrics.heldoutBefore);
 assert.ok(run.metrics.trainingAfter < run.metrics.trainingBefore);
 assert.equal(run.checkpoint.manifest.initializationSeed, 42);
 assert.equal(run.checkpoint.manifest.promotionStatus, "candidate");
 assert.equal(run.checkpoint.manifest.creditCost, 0);
 assert.equal(predictNativeToken(run.checkpoint, "a").token, "b");
});
test("same run reproduces weights, manifests and save/load predictions", () => {
 const one = trainNativeSmokeModel(input()), two = trainNativeSmokeModel(input());
 assert.deepEqual(one, two);
 const loaded = loadNativeCheckpoint(JSON.stringify(one.checkpoint));
 assert.deepEqual(predictNativeToken(loaded, "a"), predictNativeToken(one.checkpoint, "a"));
 const tampered = JSON.parse(JSON.stringify(one.checkpoint)); tampered.weights[0] += 1;
 assert.throws(() => loadNativeCheckpoint(JSON.stringify(tampered)), /checkpoint-integrity/);
});
test("rights, contamination, capacity, and malformed checkpoint inputs fail closed", () => {
 const base = input();
 for (const patch of [{ training: [{ ...base.training[0]!, rights: "unknown" }] }, { evaluation: base.training }, { evaluation: [{ ...base.evaluation[0]!, text: base.training[0]!.text }] }, { epochs: 100_000 }, { seed: NaN }, { learningRate: Infinity }]) assert.throws(() => trainNativeSmokeModel({ ...base, ...patch } as never));
 assert.throws(() => loadNativeCheckpoint("{}"));
 const malicious = JSON.parse(JSON.stringify(trainNativeSmokeModel(base).checkpoint));
 malicious.manifest.token = "private-manifest-sentinel";
 const { fingerprint: _ignored, ...core } = malicious;
 malicious.fingerprint = createHash("sha256").update(JSON.stringify(core)).digest("hex");
 assert.throws(() => loadNativeCheckpoint(JSON.stringify(malicious)), /checkpoint-manifest-invalid/);
});
test("incumbent governed promotion requires independent evaluation and rollback", () => {
 const run = trainNativeSmokeModel(input());
 const context = { candidateDigest: run.checkpoint.fingerprint, evaluatorDigest: digest, evaluatedCheckpointDigest: run.checkpoint.fingerprint, independent: true, heldoutBefore: run.metrics.heldoutBefore, heldoutAfter: run.metrics.heldoutAfter, rollbackDigest: "c".repeat(64), incumbentAuthority: "epoch-1", expectedAuthority: "epoch-1" };
 assert.equal(evaluateCheckpointPromotion(context).eligible, true);
 for (const patch of [{ independent: false }, { rollbackDigest: "" }, { expectedAuthority: "epoch-2" }, { evaluatedCheckpointDigest: "d".repeat(64) }, { heldoutAfter: context.heldoutBefore }]) assert.equal(evaluateCheckpointPromotion({ ...context, ...patch }).eligible, false);
 assert.equal(run.checkpoint.manifest.promotionStatus, "candidate");
});
