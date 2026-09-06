import { readFile } from 'node:fs/promises';
import { evaluateMutationEnvelope, summarizeAuthorityProfile } from '../src/pdf-authority-profile.mjs';

const REQUIRED_ALLOWED_COSTS = new Set(['deterministic', 'local-model']);
const FORBIDDEN_COSTS = new Set(['metered-cloud']);

function fail(message) {
  console.error(`[pdf-authority] ${message}`);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

async function loadManifest() {
  const raw = await readFile(new URL('../mahoraga.manifest.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

function validateManifestCostModes(manifest) {
  const local = new Set(manifest?.costModes?.local || []);
  const hybrid = new Set(manifest?.costModes?.hybrid || []);

  for (const cost of REQUIRED_ALLOWED_COSTS) {
    assert(local.has(cost) || hybrid.has(cost), `manifest does not expose allowed local-first cost class: ${cost}`);
  }

  for (const cost of FORBIDDEN_COSTS) {
    assert(!local.has(cost), `local mode must not include forbidden cost class: ${cost}`);
  }
}

function validateCandidateGate() {
  const good = evaluateMutationEnvelope({
    id: 'self-check-good',
    targetNodeId: 'node_core_compute',
    source: 'export const execute = async (input) => input;',
    costClass: 'deterministic',
    signed: true,
    sandboxPassed: true,
    benchmarkPassed: true,
    rollbackCheckpoint: true,
    quorumVotes: 2,
    privateMesh: true,
    publicIngress: false,
  });

  assert(good.status === 'stageable', `expected safe deterministic mutation to be stageable, got ${good.status}`);
  assert(good.activation === 'staged-awaiting-owner-approval', 'candidate gate must stop at staged-awaiting-owner-approval');

  const bad = evaluateMutationEnvelope({
    id: 'self-check-bad',
    targetNodeId: 'node_core_compute',
    source: 'export const execute = async (input) => input;',
    costClass: 'metered-cloud',
    signed: false,
    sandboxPassed: true,
    benchmarkPassed: true,
    rollbackCheckpoint: true,
    quorumVotes: 2,
    privateMesh: false,
    publicIngress: true,
    usesRuntimeEval: true,
  });

  assert(bad.status === 'blocked', 'unsafe mutation envelope must be blocked');
  assert(bad.blockers.includes('metered-cloud-cost-class'), 'metered cloud mutation must be blocked');
  assert(bad.blockers.includes('unsafe-network-boundary'), 'public/untrusted mesh mutation must be blocked');
  assert(bad.blockers.includes('blind-runtime-eval'), 'blind runtime eval mutation must be blocked');
}

const manifest = await loadManifest();
validateManifestCostModes(manifest);
validateCandidateGate();

const summary = summarizeAuthorityProfile();
console.log(`[pdf-authority] profile=${summary.id} localFirst=${summary.localFirst} zeroMeteredCloud=${summary.zeroMeteredCloud} containment=${summary.containmentPreserved} activation=${summary.activationBoundary}`);
