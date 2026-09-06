const DEFAULT_BUDGETS = Object.freeze({
  mutationBytes: 64 * 1024,
  proposalBytes: 128 * 1024,
  executionMs: 300_000,
  memoryBytes: 512 * 1024 * 1024,
  consensusQuorum: 2,
});

export const PDF_AUTHORITY_PROFILE = Object.freeze({
  id: 'pdf-authority-autonomy-layer',
  version: '1.0.0',
  source: 'autonomous - Google Search.pdf',
  mode: 'local-first-sovereign-candidate',
  defaultCostClass: 'deterministic',
  allowedCostClasses: ['deterministic', 'local-model'],
  escalationCostClasses: ['licensed-cloud'],
  forbiddenCostClasses: ['metered-cloud'],
  durableState: 'sqlite-wal-authoritative',
  accelerationState: ['memory-register', 'redis-cache'],
  networkBoundary: 'loopback-or-private-authenticated-mesh',
  activationBoundary: 'staged-awaiting-owner-approval',
  requiredStages: [
    'intake',
    'plan',
    'propose',
    'sandbox-test',
    'benchmark',
    'sign',
    'quorum',
    'stage',
    'rollback-checkpoint',
  ],
  prohibitedMechanics: [
    'public-unauthenticated-websocket',
    'ngrok-or-public-tunnel',
    'unrestricted-supervisor-shell',
    'caller-selected-executable-path',
    'blind-runtime-eval',
    'volatile-only-authoritative-state',
    'self-activation-of-protected-root',
    'secret-or-private-content-commit',
  ],
  budgets: DEFAULT_BUDGETS,
});

export function normalizeMutationEnvelope(envelope = {}) {
  return {
    id: String(envelope.id || envelope.proposalId || ''),
    targetPath: String(envelope.targetPath || envelope.target || ''),
    targetNodeId: String(envelope.targetNodeId || envelope.nodeId || ''),
    source: String(envelope.source || envelope.evolvedSource || ''),
    costClass: String(envelope.costClass || PDF_AUTHORITY_PROFILE.defaultCostClass),
    signed: Boolean(envelope.signed || envelope.signature),
    sandboxPassed: Boolean(envelope.sandboxPassed),
    benchmarkPassed: Boolean(envelope.benchmarkPassed),
    rollbackCheckpoint: Boolean(envelope.rollbackCheckpoint),
    quorumVotes: Number.isFinite(Number(envelope.quorumVotes)) ? Number(envelope.quorumVotes) : 0,
    privateMesh: envelope.privateMesh !== false,
    publicIngress: Boolean(envelope.publicIngress),
    usesRuntimeEval: Boolean(envelope.usesRuntimeEval),
    touchesProtectedRoot: Boolean(envelope.touchesProtectedRoot),
    commitsSecrets: Boolean(envelope.commitsSecrets),
  };
}

export function evaluateMutationEnvelope(envelope = {}, options = {}) {
  const normalized = normalizeMutationEnvelope(envelope);
  const budgets = { ...DEFAULT_BUDGETS, ...(options.budgets || {}) };
  const blockers = [];
  const warnings = [];

  if (!normalized.id) blockers.push('missing-proposal-id');
  if (!normalized.targetPath && !normalized.targetNodeId) blockers.push('missing-target');
  if (normalized.source.length === 0) blockers.push('empty-mutation-source');
  if (normalized.source.length > budgets.mutationBytes) blockers.push('mutation-too-large');
  if (PDF_AUTHORITY_PROFILE.forbiddenCostClasses.includes(normalized.costClass)) blockers.push('metered-cloud-cost-class');
  if (!PDF_AUTHORITY_PROFILE.allowedCostClasses.includes(normalized.costClass)) warnings.push('non-default-cost-class');
  if (!normalized.privateMesh || normalized.publicIngress) blockers.push('unsafe-network-boundary');
  if (normalized.usesRuntimeEval) blockers.push('blind-runtime-eval');
  if (normalized.commitsSecrets) blockers.push('secret-commit-risk');
  if (!normalized.sandboxPassed) blockers.push('sandbox-not-proven');
  if (!normalized.benchmarkPassed) blockers.push('benchmark-not-proven');
  if (!normalized.signed) blockers.push('unsigned-mutation-envelope');
  if (normalized.quorumVotes < budgets.consensusQuorum) blockers.push('quorum-not-met');
  if (!normalized.rollbackCheckpoint) blockers.push('rollback-checkpoint-missing');

  if (normalized.touchesProtectedRoot) {
    blockers.push('protected-root-requires-reviewed-bootstrap-pr');
  }

  return {
    profileId: PDF_AUTHORITY_PROFILE.id,
    status: blockers.length === 0 ? 'stageable' : 'blocked',
    activation: 'staged-awaiting-owner-approval',
    normalized,
    blockers,
    warnings,
  };
}

export function assertStageableMutation(envelope = {}, options = {}) {
  const result = evaluateMutationEnvelope(envelope, options);
  if (result.status !== 'stageable') {
    const error = new Error(`PDF authority mutation blocked: ${result.blockers.join(', ')}`);
    error.result = result;
    throw error;
  }
  return result;
}

export function summarizeAuthorityProfile() {
  return {
    id: PDF_AUTHORITY_PROFILE.id,
    localFirst: true,
    zeroMeteredCloud: true,
    containmentPreserved: true,
    durableState: PDF_AUTHORITY_PROFILE.durableState,
    activationBoundary: PDF_AUTHORITY_PROFILE.activationBoundary,
  };
}
