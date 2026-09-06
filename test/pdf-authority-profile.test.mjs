import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PDF_AUTHORITY_PROFILE,
  evaluateMutationEnvelope,
  assertStageableMutation,
  summarizeAuthorityProfile,
} from '../src/pdf-authority-profile.mjs';

test('PDF authority profile preserves local-first zero-metered autonomy', () => {
  const summary = summarizeAuthorityProfile();

  assert.equal(summary.id, 'pdf-authority-autonomy-layer');
  assert.equal(summary.localFirst, true);
  assert.equal(summary.zeroMeteredCloud, true);
  assert.equal(summary.containmentPreserved, true);
  assert.equal(summary.activationBoundary, 'staged-awaiting-owner-approval');
  assert.deepEqual(PDF_AUTHORITY_PROFILE.allowedCostClasses, ['deterministic', 'local-model']);
});

test('stageable mutation requires signed, tested, benchmarked, quorum-backed rollback checkpoint', () => {
  const result = assertStageableMutation({
    id: 'proposal-001',
    targetPath: 'src/generated/example.mjs',
    source: 'export const execute = async (input) => input;',
    costClass: 'local-model',
    signed: true,
    sandboxPassed: true,
    benchmarkPassed: true,
    rollbackCheckpoint: true,
    quorumVotes: 2,
    privateMesh: true,
  });

  assert.equal(result.status, 'stageable');
  assert.equal(result.activation, 'staged-awaiting-owner-approval');
  assert.equal(result.blockers.length, 0);
});

test('unsafe or credit-consuming mutation paths are blocked', () => {
  const result = evaluateMutationEnvelope({
    id: 'proposal-unsafe',
    targetPath: 'src/generated/example.mjs',
    source: 'export const execute = async (input) => input;',
    costClass: 'metered-cloud',
    signed: false,
    sandboxPassed: false,
    benchmarkPassed: false,
    rollbackCheckpoint: false,
    quorumVotes: 0,
    privateMesh: false,
    publicIngress: true,
    usesRuntimeEval: true,
    commitsSecrets: true,
  });

  assert.equal(result.status, 'blocked');
  assert(result.blockers.includes('metered-cloud-cost-class'));
  assert(result.blockers.includes('unsafe-network-boundary'));
  assert(result.blockers.includes('blind-runtime-eval'));
  assert(result.blockers.includes('secret-commit-risk'));
});

test('protected-root changes stay behind reviewed bootstrap activation', () => {
  const result = evaluateMutationEnvelope({
    id: 'proposal-protected',
    targetPath: 'src/autonomy-policy.mjs',
    source: 'export const execute = async (input) => input;',
    costClass: 'deterministic',
    signed: true,
    sandboxPassed: true,
    benchmarkPassed: true,
    rollbackCheckpoint: true,
    quorumVotes: 2,
    privateMesh: true,
    touchesProtectedRoot: true,
  });

  assert.equal(result.status, 'blocked');
  assert(result.blockers.includes('protected-root-requires-reviewed-bootstrap-pr'));
});
