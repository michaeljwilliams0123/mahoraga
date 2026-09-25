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
test('convergence requires exact-head verification and Cloudflare acceptance with Railway rollback only', () => {
  const contract = loadContract();
  assert.deepEqual(contract.convergence.requiredVerifyContexts, [
    'Verify (ubuntu-latest)', 'Verify (windows-latest)',
  ]);
  assert.equal(contract.convergence.cloud.canonicalProvider, 'cloudflare');
  assert.equal(contract.convergence.cloud.rollbackProvider, 'railway');
  assert.equal(contract.convergence.cloud.independentTrafficProofRequired, true);
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
function readRepoFile(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

test('agent entry points require the operating doctrine', () => {
  const doctrinePath = 'docs/MAHORAGA-OPERATING-DOCTRINE.md';
  assert.match(readRepoFile('AGENTS.md'), new RegExp(doctrinePath.replaceAll('/', '\\/')));
  assert.match(readRepoFile('.github/copilot-instructions.md'), new RegExp(doctrinePath.replaceAll('/', '\\/')));
});

test('human doctrine preserves reference-plane, readiness, and real-execution boundaries', () => {
  const doctrine = readRepoFile('docs/MAHORAGA-OPERATING-DOCTRINE.md');
  assert.match(doctrine, /SD009WC7/);
  assert.match(doctrine, /gold-standard reference/i);
  assert.match(doctrine, /\/api\/live/);
  assert.match(doctrine, /\/api\/ready/);
  assert.match(doctrine, /simulator.*not.*execution proof/i);
  assert.match(doctrine, /UI.*not.*execution proof/i);
});

test('owner-authenticated tunnels remain bounded apertures rather than raw loopback exposure', () => {
  const contract = loadContract();
  assert.equal(contract.networkApertures.ownerAuthenticatedTunnelsAllowed, true);
  assert.equal(contract.networkApertures.requireBoundedLease, true);
  assert.equal(contract.networkApertures.rawLoopbackPublicExposureAllowed, false);
  const doctrine = readRepoFile('docs/MAHORAGA-OPERATING-DOCTRINE.md');
  assert.match(doctrine, /owner-authenticated tunnels.*bounded Mahoraga apertures/i);
  assert.match(doctrine, /raw `4782\/4783`.*prohibited/i);
});

test('human doctrine requires governed release-baseline mirrors to move with source files', () => {
  const doctrine = readRepoFile('docs/MAHORAGA-OPERATING-DOCTRINE.md');
  assert.match(doctrine, /state\/release-baseline/);
  assert.match(doctrine, /mirror.*exact/i);
});
