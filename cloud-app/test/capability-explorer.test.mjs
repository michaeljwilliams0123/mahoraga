import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
const source = readFileSync(new URL("../lib/capability-families.ts", import.meta.url), "utf8");
const api = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`);
const route = (capability, extra = {}) => ({ capability, routable: true, workerIds: ["worker"], costClass: "deterministic", ...extra });
test("explorer never treats disconnected cached routes as available", () => {
  assert.equal(typeof api.projectCapabilityExplorer, "function");
  const [row] = api.projectCapabilityExplorer(false, [route("cognitive.predict")]);
  assert.equal(row.state, "unobserved");
  assert.equal(row.starter, null);
});
test("explorer preserves every route and explains disabled and paid routes", () => {
  const rows = api.projectCapabilityExplorer(true, [route("repository.inspect"), route("cognitive.predict", { enabled: false, providerReasonCode: "provider-held" }), route("assistant.respond", { costClass: "licensed-cloud" })]);
  assert.deepEqual(rows.map(row => row.state), ["routable", "unavailable", "core-only"]);
  assert.equal(rows[1].reason, "provider-held");
  assert.equal(rows[1].starter, null);
  assert.equal(rows[2].starter, null);
});
test("starters are limited to observed deterministic planning and prediction", () => {
  const rows = api.projectCapabilityExplorer(true, [route("cognitive.predict"), route("cognitive.cycle"), route("repository.write"), route("cognitive.predict", { costClass: "cloud-open-weight" })]);
  assert.match(rows[0].starter, /^\/predict /);
  assert.match(rows[1].starter, /^\/cycle /);
  assert.doesNotThrow(() => JSON.parse(rows[0].starter.slice(9)));
  assert.doesNotThrow(() => JSON.parse(rows[1].starter.slice(7)));
  assert.equal(rows[2].starter, null);
  assert.equal(rows[3].starter, null);
});

test('cognitive workbench reports all registered cognitive abilities without inventing routes', () => {
 const rows = api.projectCognitiveAbilities(true, [route('cognitive.predict'), route('cognitive.cycle')], 'ready');
 assert.deepEqual(rows.map(row => row.capability), ['cognitive.predict', 'cognitive.cycle', 'cognitive.assess', 'cognitive.deliberate', 'cognitive.transfer', 'cognitive.learn']);
 assert.deepEqual(rows.map(row => row.state), ['routable', 'routable', 'unavailable', 'unavailable', 'unavailable', 'unavailable']);
 assert.match(rows[0].starter, /^\/predict /);
 assert.match(rows[1].starter, /^\/cycle /);
 assert.equal(rows[3].starter, null);
 assert.equal(rows[3].reason, 'route-not-reported');
});

test('cognitive workbench requires a current observation before enabling a draft', () => {
 const routes = [route('cognitive.cycle')];
 for (const phase of ['loading', undefined]) {
  const row = api.projectCognitiveAbilities(true, routes, phase).find(row => row.capability === 'cognitive.cycle');
  assert.equal(row.state, 'unobserved'); assert.equal(row.starter, null);
 }
 const offline = api.projectCognitiveAbilities(false, routes, 'ready');
 assert.ok(offline.every(row => row.state === 'unobserved' && row.starter === null));
 const failed = api.projectCognitiveAbilities(true, routes, 'error');
 assert.ok(failed.every(row => row.state === 'unavailable' && row.starter === null && row.reason === 'runtime-observation-failed'));
});

test('cognitive workbench respects disabled and paid routes and never offers unsupported chat commands', () => {
 const rows = api.projectCognitiveAbilities(true, [route('cognitive.predict', { enabled: false }), route('cognitive.cycle', {costClass:'licensed-cloud'}), route('cognitive.deliberate')], 'ready');
 assert.equal(rows[0].state, 'unavailable'); assert.equal(rows[0].starter, null);
 assert.equal(rows[1].state, 'core-only'); assert.equal(rows[1].starter, null);
 assert.equal(rows[3].state, 'routable'); assert.equal(rows[3].starter, null);
});
