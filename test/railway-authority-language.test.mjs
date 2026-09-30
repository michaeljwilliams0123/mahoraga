import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readRepoFile(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function stripSection(text, heading, nextHeading) {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing historical section: ${heading}`);
  const end = text.indexOf(nextHeading, start + heading.length);
  assert.notEqual(end, -1, `missing section after historical block: ${nextHeading}`);
  return text.slice(0, start) + text.slice(end);
}

function assertCurrentRailwayBoundary(text, label) {
  assert.match(
    text,
    /Railway[^\n]*(?:legacy evidence|legacy infrastructure)[^\n]*zero-route[^\n]*zero-influence[^\n]*zero-fallback[^\n]*zero-authority/i,
    `${label} must describe Railway as legacy evidence with the full zero-authority boundary`,
  );
  assert.doesNotMatch(
    text,
    /Railway[^.\n]*(?:rollback|standby)/i,
    `${label} must not present Railway as a current rollback or standby path`,
  );
}

test('current authority surfaces keep Railway legacy-only without rollback semantics', () => {
  let readmeCurrent = readRepoFile('README.md');
  readmeCurrent = stripSection(
    readmeCurrent,
    '## Historical review baseline (2026-09-18)',
    '## Capability-first architecture',
  );
  readmeCurrent = stripSection(
    readmeCurrent,
    '## Historical Railway production model (rollback reference)',
    '## Observed cloud status during this README reconciliation',
  );
  assertCurrentRailwayBoundary(readmeCurrent, 'README current authority sections');

  const cutover = readRepoFile('docs/CLOUDFLARE-WORKERS-CUTOVER.md');
  assertCurrentRailwayBoundary(cutover, 'Cloudflare Workers current status');

  const runtime = readRepoFile('docs/CLOUD-ALWAYS-ON-RUNTIME.md');
  const historicalMarker = 'Historical Railway container/pin recovery';
  const historicalIndex = runtime.indexOf(historicalMarker);
  assert.notEqual(historicalIndex, -1, 'always-on runtime must retain its explicit historical boundary');
  assertCurrentRailwayBoundary(runtime.slice(0, historicalIndex), 'always-on runtime current guidance');

  const cloudOnly = readRepoFile('docs/CLOUD-ONLY-DEPLOYMENT.md');
  assertCurrentRailwayBoundary(cloudOnly, 'cloud-only deployment guidance');

  const composio = readRepoFile('docs/COMPOSIO-INTEGRATION.md');
  assertCurrentRailwayBoundary(composio, 'Composio runtime boundary');

  const hardZero = readRepoFile('docs/CLOUDFLARE-HARD-ZERO-INFERENCE.md');
  assertCurrentRailwayBoundary(hardZero, 'hard-zero cognition boundary');

  const operatorVersions = readRepoFile('operator-deck/src/lib/fleet/versions.ts');
  assertCurrentRailwayBoundary(operatorVersions, 'operator deck workspace note');

  const polyglot = readRepoFile('docs/migrations/POLYGLOT-MIGRATION.md');
  assertCurrentRailwayBoundary(polyglot, 'polyglot migration standing invariants');
});
