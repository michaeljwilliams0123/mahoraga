import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const uiDependencies = existsSync(new URL('../node_modules/react/package.json', import.meta.url));
const uiOnly = { skip: uiDependencies ? false : 'Renderer runs in cloud-app verify, which installs the UI dependencies.' };

import type { InternalActivity } from '../lib/internal-activity.ts';
async function component() {
 const { createElement } = await import('react');
 const { renderToStaticMarkup } = await import('react-dom/server');
 const directory = await mkdtemp(join(tmpdir(), 'mahoraga-activity-card-'));
 try {
  execFileSync(process.execPath, [fileURLToPath(new URL('./bin/tsc', import.meta.resolve('typescript/package.json'))),
   fileURLToPath(new URL('../components/cockpit/InternalActivityCard.tsx', import.meta.url)),
   '--ignoreConfig', '--noCheck', '--jsx', 'react-jsx', '--module', 'esnext', '--target', 'es2022', '--outDir', directory]);
  const code = (await readFile(join(directory, 'InternalActivityCard.js'), 'utf8'))
   .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')));
  const Card = (await import(`data:text/javascript,${encodeURIComponent(code)}`)).InternalActivityCard;
  return { Card, renderToStaticMarkup, createElement };
 } finally { await rm(directory, { recursive: true, force: true }); }
}
test('unknown activity renders disabled controls and unverified metrics', uiOnly, async () => {
 const { Card, renderToStaticMarkup, createElement } = await component();
 const html = renderToStaticMarkup(createElement(Card, { activity: null, label: 'Background unverified', busy: false, error: null, onSetEnabled: async () => {} }));
 assert.match(html, /Background unverified/); assert.match(html, /disabled=""/); assert.match(html, /Not observed yet/);
 assert.doesNotMatch(html, /Background active/);
});
test('paused observations render owner stop and candidate-only plans', uiOnly, async () => {
 const { Card, renderToStaticMarkup, createElement } = await component();
 const activity = { schemaVersion: 1, sourceSha: 'a'.repeat(40), enabled: false, phase: 'paused', lastWakeAt: null, nextWakeAt: null,
  wakeCount: 0, artifactCount: 0, candidateActionCount: 0, lastError: null, snapshotFingerprint: null, artifactFingerprint: null,
  observedAt: new Date().toISOString(), durableState: 'cloudflare-do-sqlite', modelInvocations: 0 } as InternalActivity;
 const html = renderToStaticMarkup(createElement(Card, { activity, label: 'Background paused', busy: false, error: null, onSetEnabled: async () => {} }));
 assert.match(html, /Resume internal work/); assert.match(html, /Paused by owner/);
 assert.match(html, /builds candidate plans when observations change/); assert.doesNotMatch(html, /disabled=""/);
});
