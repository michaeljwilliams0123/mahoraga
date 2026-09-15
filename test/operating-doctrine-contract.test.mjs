import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = join(root, 'config', 'operating-doctrine.json');

function loadContract() {
  assert.equal(existsSync(contractPath), true, 'operating doctrine contract must exist');
  return JSON.parse(readFileSync(contractPath, 'utf8'));
}

test('operating doctrine preserves truth boundaries and source authority', () => {
  const contract = loadContract();
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.sourceAuthority, 'github-main');
  assert.deepEqual(contract.authorityOrder, [
    'source', 'deployment', 'live-runtime', 'provider-readiness',
    'execution-authority', 'verification',
  ]);
});

test('SD00 is reference execution and cannot override source authority', () => {
  const contract = loadContract();
  assert.equal(contract.referencePlane.device, 'SD009WC7');
  assert.equal(contract.referencePlane.role, 'gold-standard-reference');
  assert.equal(contract.referencePlane.mayOverrideSourceAuthority, false);
});
test('convergence requires exact-head cross-platform verification and exact-SHA Railway promotion', () => {
  const contract = loadContract();
  assert.deepEqual(contract.convergence.requiredVerifyContexts, [
    'Verify (ubuntu-latest)', 'Verify (windows-latest)',
  ]);
  assert.equal(contract.convergence.cloud.canonicalProvider, 'railway');
  assert.equal(contract.convergence.cloud.requireExactMergedSha, true);
  assert.equal(contract.convergence.zeroCredit.allowPaidFallback, false);
});

test('real acceptance vertical cannot be replaced by simulator or UI evidence', () => {
  const contract = loadContract();
  assert.deepEqual(contract.acceptanceVertical.steps, [
    'owner-authenticated-request', 'encrypted-relay', 'authority-decision',
    'verified-zero-credit-provider-admission', 'real-model-execution',
    'optional-bounded-tool-broker', 'persisted-task-event-result',
    'verified-returned-answer',
  ]);
  assert.equal(contract.acceptanceVertical.simulatorEvidenceIsExecutionProof, false);
  assert.equal(contract.acceptanceVertical.uiEvidenceIsExecutionProof, false);
});

test('old work is mined for missing capability instead of blindly resurrected', () => {
  const contract = loadContract();
  assert.equal(contract.antiDuplication.requireCurrentMainComparison, true);
  assert.equal(contract.antiDuplication.blindStaleCherryPickAllowed, false);
  assert.deepEqual(contract.antiDuplication.comparisonEvidence, [
    'ancestry', 'path-history', 'focused-diff', 'current-tests',
  ]);
});