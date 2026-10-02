import { env, exports } from 'cloudflare:workers';
import { runInDurableObject, runDurableObjectAlarm } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker, { type ExecutionDurableObject } from '../deploy/cloudflare-execution-runtime/worker';

const ownerRequest = (type: string, payload: unknown) => new Request('https://execution.example/api/native/bridge', {
 method: 'POST', headers: { 'content-type': 'application/json', 'x-mahoraga-verified-owner': 'owner@example.com', 'x-mahoraga-verified-nonce': crypto.randomUUID() },
 body: JSON.stringify({ type, payload }),
});

describe('durable internal activity', () => {
 it('bootstrap persists a real alarm, processes a bounded plan and retains it after wake', async () => {
  const stub = env.EXECUTION_DO.getByName('internal-activity-test');
  await runInDurableObject<ExecutionDurableObject, void>(stub, async instance => { await instance.ensureInternalActivity(); });
  await runInDurableObject<ExecutionDurableObject, void>(stub, async (instance, state) => {
   expect(await state.storage.getAlarm()).not.toBeNull();
   for (let i = 0; i < 64; i++) state.storage.sql.exec('INSERT INTO internal_plan_candidates (fingerprint,created_at,payload) VALUES (?,?,?)', `old-${i}`, i, '{}');
   const row = state.storage.sql.exec<{ payload: string }>('SELECT payload FROM internal_activity_state WHERE id = 1').one();
   const saved = JSON.parse(row.payload); saved.nextWakeAt = Date.now() - 1;
   state.storage.sql.exec('UPDATE internal_activity_state SET payload = ? WHERE id = 1', JSON.stringify(saved));
   await state.storage.setAlarm(Date.now() + 60000);
  });
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  await runInDurableObject<ExecutionDurableObject, void>(stub, async (_instance, state) => {
   const saved = JSON.parse(state.storage.sql.exec<{ payload: string }>('SELECT payload FROM internal_activity_state WHERE id = 1').one().payload);
   expect(saved.wakeCount).toBe(1); expect(saved.artifactCount).toBe(1);
   const artifact = JSON.parse(state.storage.sql.exec<{ payload: string }>('SELECT payload FROM internal_plan_candidates ORDER BY created_at DESC LIMIT 1').one().payload);
   expect(state.storage.sql.exec<{ total: number }>('SELECT COUNT(*) AS total FROM internal_plan_candidates').one().total).toBe(64);
   expect(state.storage.sql.exec('SELECT fingerprint FROM internal_plan_candidates WHERE fingerprint = ?', 'old-0').toArray()).toHaveLength(0);
   expect(artifact.modelInvocations).toBe(0); expect(artifact.automaticMutationAllowed).toBe(false);
   expect(await state.storage.getAlarm()).toBeGreaterThan(Date.now());
   await state.storage.deleteAlarm();
  });
 });
 it('public callers cannot bootstrap or control internal work by spoofing metadata', async () => {
  for (const path of ['/api/internal/activity', '/api/internal/activity/bootstrap']) {
   const response = await exports.default.fetch(new Request(`https://execution.example${path}`, { method: 'POST', headers: { 'x-mahoraga-verified-owner': 'owner@example.com' } }));
   expect(response.status).toBe(404);
  }
  const spoofed = await exports.default.fetch(ownerRequest('internal-activity-control', { enabled: false }));
  expect(spoofed.status).toBe(403);
 });
 it('the verified owner can pause/resume, while malformed controls and missing identity fail closed', async () => {
  const stub = env.EXECUTION_DO.getByName('internal-control-test');
  await stub.ensureInternalActivity();
  for (const payload of [{ enabled: true, target: 'another-device' }, { enabled: 'true' }, {}]) {
   expect((await stub.fetch(ownerRequest('internal-activity-control', payload))).status).toBe(400);
  }
  expect((await stub.fetch(new Request('https://execution.example/api/native/bridge', { method: 'POST', body: JSON.stringify({ type: 'internal-activity-control', payload: { enabled: false } }) }))).status).toBe(403);
  const stopped = await stub.fetch(ownerRequest('internal-activity-control', { enabled: false }));
  expect((await stopped.json<{ enabled: boolean }>()).enabled).toBe(false);
  await stub.ensureInternalActivity();
  await runInDurableObject<ExecutionDurableObject, void>(stub, async (_instance, state) => { expect(await state.storage.getAlarm()).toBeNull(); });
  const resumed = await stub.fetch(ownerRequest('internal-activity-control', { enabled: true }));
  expect((await resumed.json<{ enabled: boolean }>()).enabled).toBe(true);
  await runInDurableObject<ExecutionDurableObject, void>(stub, async (_instance, state) => { expect(await state.storage.getAlarm()).not.toBeNull(); await state.storage.deleteAlarm(); });
 });
 it('cron bootstraps the production object and preserves a durable owner pause', async () => {
  await worker.scheduled({} as ScheduledController, env);
  const stub = env.EXECUTION_DO.getByName('execution-v1');
  await runInDurableObject<ExecutionDurableObject, void>(stub, async (instance, state) => {
   expect(state.storage.sql.exec('SELECT * FROM provider_state').toArray()).toHaveLength(0);
   expect(state.storage.sql.exec('SELECT * FROM turns').toArray()).toHaveLength(0);
   const row = JSON.parse(state.storage.sql.exec<{ payload: string }>('SELECT payload FROM internal_activity_state WHERE id = 1').one().payload);
   row.enabled = false; row.phase = 'paused'; row.nextWakeAt = null;
   state.storage.sql.exec('UPDATE internal_activity_state SET payload = ? WHERE id = 1', JSON.stringify(row));
   await state.storage.deleteAlarm(); await instance.ensureInternalActivity();
   expect(await state.storage.getAlarm()).toBeNull();
  });
 });
});
