import test from "node:test";
import assert from "node:assert/strict";
import { readIncumbentTrustEpochFile, parseIncumbentTrustEpoch, selectSovereignReceiptPath, attachIncumbentSovereignEvidence } from "../src/incumbent-trust-epoch.mjs";
import { ROOT } from "../src/config.mjs";

test("incumbent epoch on disk is schema-valid and bound to a full commit", async () => {
  const epoch = await readIncumbentTrustEpochFile(ROOT);
  assert.equal(epoch.epochId, "epoch-1");
  assert.match(epoch.trustedCommit, /^[a-f0-9]{40}$/);
  assert.match(epoch.verifierFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(epoch.rollbackCheckpointId, "rollback-3-6-0");
  assert.equal(epoch.policyGeneration, 1);
});

test("candidate label-only epoch payloads are rejected", () => {
  assert.throws(() => parseIncumbentTrustEpoch({ epochId: "epoch-1" }), /sovereign-trust-epoch-invalid/);
});

test("exactly one sovereign receipt path is selected from changed files", () => {
  assert.equal(selectSovereignReceiptPath(["cloud-app/app/page.tsx"]), null);
  assert.equal(
    selectSovereignReceiptPath(["coordination/sovereign-receipts/head.json", "src/autonomy-policy.mjs"]),
    "coordination/sovereign-receipts/head.json",
  );
  assert.throws(
    () => selectSovereignReceiptPath([
      "coordination/sovereign-receipts/a.json",
      "coordination/sovereign-receipts/b.json",
    ]),
    /sovereign-receipt-ambiguous/,
  );
});

test("incumbent epoch is attached from trusted main, never invented from a label", () => {
  const epoch = parseIncumbentTrustEpoch({
    schemaVersion: 1,
    epochId: "epoch-1",
    trustedCommit: "a".repeat(40),
    verifierFingerprint: "b".repeat(64),
    rollbackCheckpointId: "rollback-3-6-0",
    policyGeneration: 1,
    activatedAt: "2026-09-05T09:10:00.000Z",
  });
  const attached = attachIncumbentSovereignEvidence({ number: 128, headSha: "c".repeat(40) }, { trustedEpoch: epoch });
  assert.deepEqual(attached.trustedEpoch, epoch);
  assert.equal(attached.sovereignEvolution, null);
});
