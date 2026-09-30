import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readRepoFile(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function beforeMarker(text, marker, label) {
  const markerIndex = text.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${label} must retain its explicit historical boundary`);
  return text.slice(0, markerIndex);
}

function assertCurrentRailwayBoundary(text, label) {
  assert.match(
    text,
    /Railway[^\n]*(?:legacy evidence|legacy infrastructure)[^\n]*zero-route[^\n]*zero-influence[^\n]*zero-fallback[^\n]*zero-authority/i,
    `${label} must describe Railway as legacy evidence with the full zero-authority boundary`,
  );
  assert.doesNotMatch(
    text,
    /Railway[^\n]*(?:rollback|standby)/i,
    `${label} must not present Railway as a current rollback or standby path`,
  );
}

test('current authority surfaces keep Railway legacy-only without rollback semantics', () => {
  const readmeCurrent = beforeMarker(
    readRepoFile('README.md'),
    '## Historical review baseline',
    'README current authority section',
  );
  assertCurrentRailwayBoundary(readmeCurrent, 'README current authority section');

  const cutoverStatus = beforeMarker(
    readRepoFile('docs/CLOUDFLARE-WORKERS-CUTOVER.md'),
    '## Target path',
    'Cloudflare Workers current status',
  );
  assertCurrentRailwayBoundary(cutoverStatus, 'Cloudflare Workers current status');

  const runtimeCurrent = beforeMarker(
    readRepoFile('docs/CLOUD-ALWAYS-ON-RUNTIME.md'),
    'Historical Railway container/pin recovery',
    'always-on runtime current guidance',
  );
  assertCurrentRailwayBoundary(runtimeCurrent, 'always-on runtime current guidance');
});
