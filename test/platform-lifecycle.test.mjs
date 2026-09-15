import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  canonicalResource,
  routablePlatformResources,
  validatePlatformLifecycle,
} from '../src/platform-lifecycle.mjs';

const registryPath = new URL('../config/platform-lifecycle.json', import.meta.url);

async function registry() {
  return validatePlatformLifecycle(JSON.parse(await readFile(registryPath, 'utf8')));
}

test('platform lifecycle fixes one canonical resource per authority role', async () => {
  const value = await registry();
  const canonical = value.resources.filter((item) => item.canonical);
  const roles = canonical.map((item) => item.authorityRole);
  assert.equal(new Set(roles).size, roles.length);
  assert.equal(canonicalResource(value, 'runtime.production').providerResourceId, '0498b161-a6b7-4750-8c54-8c99e0167fa7');
  assert.equal(canonicalResource(value, 'source.primary').providerResourceId, '1343333190');
});

test('retired resources can never route or become canonical', async () => {
  const value = await registry();
  for (const item of value.resources.filter((entry) => entry.lifecycle === 'retired')) {
    assert.equal(item.routingEligible, false);
    assert.equal(item.canonical, false);
  }
  assert.equal(routablePlatformResources(value).some((item) => item.provider === 'vercel'), false);
});
test('display names never determine authority', async () => {
  const value = await registry();
  const changed = structuredClone(value);
  const runtime = changed.resources.find((item) => item.logicalId === 'runtime.production');
  runtime.displayName = 'renamed-human-label-only';
  const validated = validatePlatformLifecycle(changed);
  const selected = canonicalResource(validated, 'runtime.production');
  assert.equal(selected.providerResourceId, '0498b161-a6b7-4750-8c54-8c99e0167fa7');
  assert.equal(selected.canonical, true);
});

test('duplicate canonical authority roles fail closed', async () => {
  const value = await registry();
  const duplicate = structuredClone(value);
  const source = duplicate.resources.find((item) => item.logicalId === 'source.primary');
  duplicate.resources.push({ ...source, logicalId: 'source.duplicate', providerResourceId: '9999999999' });
  assert.throws(() => validatePlatformLifecycle(duplicate), { code: 'platform-lifecycle-canonical-conflict' });
});