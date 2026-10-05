import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { transformSync } from 'next/dist/build/swc/index.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const helper = dataModule(stripTypeScriptTypes(readFileSync(new URL('../lib/capability-families.ts', import.meta.url), 'utf8')));
const code = transformSync(readFileSync(new URL('../components/workspace/CapabilityReadinessPanel.tsx', import.meta.url), 'utf8'), { jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } }).code.replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime'))).replace(/['"]@\/lib\/capability-families['"]/, JSON.stringify(helper));
const { CapabilityReadinessPanel } = await import(dataModule(code));
const routes = ['assistant.respond', 'cognitive.predict', 'cognitive.cycle'].map(capability => ({ capability, routable: capability !== 'assistant.respond', costClass: 'deterministic', workerIds: [] }));
const render = (connected, observation) => renderToStaticMarkup(createElement(CapabilityReadinessPanel, { connected, capabilities: routes, observation, onRefresh: () => {}, onChooseStarter: () => {} }));
test('prediction and planning stay usable when generation is unavailable', () => {
  const html = render(true, { phase: 'ready', observedAt: '2026-10-05T19:00:00Z', capabilities: routes });
  assert.match(html, /Runtime connected/);
  assert.match(html, /<button type="button">Draft prediction scenario/);
  assert.match(html, /<button type="button">Draft planning scenario/);
  assert.match(html, /<button type="button" disabled="">Draft a generation request/);
});
test('disconnected Pages identifies the runtime boundary and disables every draft', () => {
  const html = render(false, null);
  assert.match(html, /authenticated Cloudflare runtime executes requests/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 4);
  assert.doesNotMatch(html, /<p>Available<\/p>/);
});
