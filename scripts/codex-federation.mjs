#!/usr/bin/env node
import path from 'node:path';
import { listCodexWorkers, createFederationRecord, readManifest } from '../src/codex-federation.mjs';

const cmd = process.argv[2] || 'help';
if (cmd === 'list') {
  const manifest = readManifest(path.resolve(process.cwd(), 'mahoraga.manifest.json'));
  const workers = listCodexWorkers(manifest);
  console.log(JSON.stringify({ count: workers.length, workers }, null, 2));
} else if (cmd === 'create') {
  const primary = process.argv[3] || 'primary-local-codex';
  const secondary = process.argv[4] || 'primary-cloud-codex';
  const note = process.argv.slice(5).join(' ') || '';
  const result = createFederationRecord({ primary, secondary, note });
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('Usage: node scripts/codex-federation.mjs <list|create> [primary] [secondary] [note]');
  process.exitCode = 2;
}
