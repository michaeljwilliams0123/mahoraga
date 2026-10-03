import test from 'node:test';
import assert from 'node:assert/strict';
import { runNativeContextQualification } from '../scripts/native-context-experiment.ts';

test('fixed-seed experiment reports actual held-out recall and bounded evidence without activation', () => {
 const receipt = runNativeContextQualification('a'.repeat(40));
 assert.equal(receipt.status, 'qualified-experiment');
 assert.deepEqual(receipt.runs.map(run => run.seed), [7,42,1337]);
 assert.equal(receipt.oneTokenAccuracyCeiling, 0.5);
 for (const run of receipt.runs) {
  assert.equal(run.heldoutAccuracy, 1); assert.equal(run.saveLoadEqual, true);
  assert.ok(run.heldoutAfter < run.heldoutBefore); assert.match(run.checkpointDigest, /^[a-f0-9]{64}$/);
 }
 assert.equal(receipt.providerInvocations, 0); assert.equal(receipt.creditCost, 0);
 assert.equal(receipt.executionAuthorityGranted, false); assert.equal(receipt.productionActivated, false);
 assert.throws(() => runNativeContextQualification('invalid'), /source-invalid/);
 assert.doesNotMatch(JSON.stringify(receipt), /rightsEvidenceDigest|"weights"|"text"/);
});
