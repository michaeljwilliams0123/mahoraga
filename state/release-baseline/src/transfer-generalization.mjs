import { createHash } from 'node:crypto';

export function evaluateTransferGeneralization({ sourceDomain, trials = [], maximumSourceRegression = 0.03 } = {}) {
  const source = slug(sourceDomain, 'transfer-source-invalid');
  const limit = score(maximumSourceRegression, 'transfer-regression-limit-invalid');
  if (!Array.isArray(trials) || trials.length < 3 || trials.length > 256) fail('transfer-trials-invalid');
  const normalized = trials.map(normalizeTrial).sort((a, b) => a.domain.localeCompare(b.domain));
  const sourceTrials = normalized.filter((trial) => trial.domain === source && trial.heldOut === false);
  if (sourceTrials.length < 1) fail('transfer-source-trial-missing');
  const sourceRegression = Math.max(...sourceTrials.map((trial) => Number((trial.baseline - trial.candidate).toFixed(12))));
  const heldOut = normalized.filter((trial) => trial.heldOut === true && trial.domain !== source);
  const improvedHeldOutDomains = [...new Set(heldOut.filter((trial) => trial.candidate > trial.baseline).map((trial) => trial.domain))].sort();
  let reason = 'transfer-insufficient';
  let promotable = false;
  if (sourceRegression > limit) reason = 'source-regression-exceeded';
  else if (improvedHeldOutDomains.length >= 2) { reason = 'empirical-transfer-demonstrated'; promotable = true; }
  const core = { schemaVersion: 1, kind: 'transfer-generalization-evaluation', sourceDomain: source, trials: normalized, maximumSourceRegression: limit, sourceRegression, improvedHeldOutDomains, promotable, reason };
  return deepFreeze({ ...core, fingerprint: digest(core) });
}

function normalizeTrial(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('transfer-trial-invalid');
  if (typeof value.heldOut !== 'boolean') fail('transfer-trial-invalid');
  return deepFreeze({ domain: slug(value.domain, 'transfer-trial-invalid'), baseline: score(value.baseline, 'transfer-trial-invalid'), candidate: score(value.candidate, 'transfer-trial-invalid'), heldOut: value.heldOut });
}
function score(value, code) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) fail(code); return value; }
function slug(value, code) { if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{1,95}$/.test(value)) fail(code); return value; }
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
