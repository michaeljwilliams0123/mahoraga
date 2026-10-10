import test from 'node:test';
import assert from 'node:assert/strict';
import { executeGrokbotCollective, type GrokbotAssignment, type GrokbotContext } from '../src/grokbot-cognition.ts';
// @ts-expect-error Existing governed JavaScript entry point.
import { executeCognitiveCapability } from '../src/cognitive-worker.mjs';

function context(): GrokbotContext {
  const binding = { objectiveDigest: 'a'.repeat(64), authorityDigest: 'b'.repeat(64), sourceSha: 'c'.repeat(40), trustEpoch: 'epoch-1', evaluatorFingerprint: 'd'.repeat(64), costClass: 'deterministic', audience: 'owner-only', securityBoundary: 'unchanged' };
  return { parentAgentId: 'parent-agent', authorityBinding: { ...binding, validUntil: new Date(Date.now() + 60_000).toISOString() }, currentBinding: { ...binding, observedAt: new Date().toISOString() } };
}
function assignment(agentId = 'assurance-child'): GrokbotAssignment {
  return { agentId, capability: 'cognitive.assess', input: { metacognition: { evidenceCoverage: 0.9, calibratedConfidence: 0.9, knownUnknowns: [], materialConflictCount: 0, reversible: true } } };
}
test('collective executes isolated children in assignment order without changing parent input', async () => {
  const assignments = [assignment(), assignment('second-child')], before = structuredClone(assignments);
  const out = await executeGrokbotCollective(assignments, context());
  assert.deepEqual(assignments, before);
  assert.deepEqual(out.children.map(child => child.agentId), assignments.map(child => child.agentId));
  assert.ok(out.children.every(child => child.threadId > 0 && child.result.verified === true));
  assert.notEqual(out.children[0]!.threadId, out.children[1]!.threadId);
  assert.equal(out.children[0]!.duty, 'assurance');
  assert.equal(out.modelInvocations, 0);
  assert.equal(out.cleanedUp, true);
});
test('existing cognitive entry routes explicitly selected child and retains empirical result', async () => {
  const child = assignment();
  const out = await executeCognitiveCapability(child.capability, { capabilityInput: child.input }, { grokbot: { ...context(), agentId: child.agentId } });
  assert.equal(out.assessment.action, 'proceed');
  assert.equal(out.grokbot.agentId, child.agentId);
  assert.ok(out.grokbot.threadId > 0);
  assert.equal(out.receiptMetadata.routeWorker, 'cognitive-core');
});
test('authority drift or expiry rejects before execution', async () => {
  const expired = context(); expired.authorityBinding.validUntil = new Date(Date.now() - 1).toISOString();
  await assert.rejects(executeGrokbotCollective([assignment()], expired), /binding-stale/);
  const drift = context(); drift.currentBinding.sourceSha = 'e'.repeat(40);
  await assert.rejects(executeGrokbotCollective([assignment()], drift), /bot-authority-drift/);
});
test('collective rejects duplicate identities, recursion, unknown capabilities and oversized teams', async () => {
  await assert.rejects(executeGrokbotCollective([assignment(), assignment()], context()), /assignments-invalid/);
  await assert.rejects(executeGrokbotCollective([assignment('parent-agent')], context()), /assignments-invalid/);
  await assert.rejects(executeGrokbotCollective(Array.from({length:5}, (_,i) => assignment(`child-${i}`)), context()), /assignments-invalid/);
  await assert.rejects(executeGrokbotCollective([{...assignment(), capability:'assistant.respond'}], context()), /capability-invalid/);
  await assert.rejects(executeGrokbotCollective([{...assignment(), input:{grokbot:{agentId:'recursive'}}}], context()), /input-fields-invalid/);
});
test('task data cannot choose a child or supply authority', async () => {
  await assert.rejects(executeCognitiveCapability('cognitive.assess', { capabilityInput: { ...assignment().input, grokbot: context() } }), /grokbot-host-context-required/);
});
test('cancel and timeout terminate workers; invalid child results fail the entire team', async () => {
  const abort = new AbortController(); abort.abort();
  await assert.rejects(executeGrokbotCollective([assignment()], context(), {signal:abort.signal}), /cancelled/);
  await assert.rejects(executeGrokbotCollective([assignment()], context(), {timeoutMs:1}), /timeout/);
  await assert.rejects(executeGrokbotCollective([{...assignment(),input:{metacognition:{}}}, assignment('second-child')], context()), /worker-failed/);
});
test('child input rejects executable, environment and secret-bearing payloads', async () => {
  for (const key of ['env', 'credentials', 'executable']) {
    await assert.rejects(executeGrokbotCollective([{...assignment(),input:{metacognition:{[key]:'forbidden'}}}], context()), /sensitive-state/);
  }
});
test('predict, deliberate and transfer use their bounded child handlers', async () => {
  const assignments = [
    { agentId: 'predict-child', capability: 'cognitive.predict', input: {counterfactual:{observedState:{queue:3},stateUncertainty:0.1,action:{actionId:'repair',effects:{queue:-1},uncertainty:0.1}}} },
    { agentId: 'deliberate-child', capability: 'cognitive.deliberate', input: {positions:[{individualId:'evidence-agent',conclusion:'repair',confidence:0.9,evidenceRefs:['ev:a'],assumptions:[],unknowns:[],dissentTags:[]}]} },
    { agentId: 'transfer-child', capability: 'cognitive.transfer', input: {transfer:{sourceDomain:'source',trials:[{domain:'source',baseline:0.8,candidate:0.8,heldOut:false},{domain:'target-one',baseline:0.5,candidate:0.8,heldOut:true},{domain:'target-two',baseline:0.5,candidate:0.8,heldOut:true}]}} },
  ];
  const result = await executeGrokbotCollective(assignments, context(), {maximumParallel:1});
  assert.ok(result.children.every(child => child.result.verified === true));
});
test('stale host observations fail even while the original binding remains valid', async () => {
  const stale = context(); stale.currentBinding.observedAt = new Date(Date.now()-61_000).toISOString();
  await assert.rejects(executeGrokbotCollective([assignment()], stale), /observation-stale/);
});
test('cycle can feed a learning child while unverified outcomes remain held', async () => {
  // @ts-expect-error Existing governed JavaScript identity contract.
  const { createCognitiveIndividual } = await import('../src/cognitive-individual.mjs');
  const member = createCognitiveIndividual({ individualId:'analyst-agent',parentAgentId:'mahoraga-core',displayName:'Analyst',archetype:'analyst',perspective:'Evidence first',communicationStyle:'evidence-first',traits:{curiosity:0.7},epistemicPosture:{evidenceThreshold:0.8,uncertaintyTolerance:0.4,dissentDisposition:'surface-material-dissent'},perspectiveTags:['evidence'],privateEpisodicRefs:[] });
  const cognitiveInput = {members:[member],requiredPerspectiveTags:['evidence'],positions:[{individualId:'analyst-agent',conclusion:'repair',confidence:0.9,evidenceRefs:['ev:a'],assumptions:[],unknowns:[],dissentTags:[]}],metacognition:assignment().input.metacognition,observedState:{queue:3},stateUncertainty:0.1,proposedAction:{actionId:'repair',effects:{queue:-1},uncertainty:0.1},plannerSnapshot:{workers:[],activeLeases:[],repository:{verified:true},taskCounts:{},objectives:[],providers:[]}};
  const run = await executeGrokbotCollective([{agentId:'cycle-child',capability:'cognitive.cycle',input:{cognitiveInput}}], context());
  const cycle = run.children[0]!.result.cycle as Record<string, unknown>;
  const learned = await executeGrokbotCollective([{agentId:'learning-child',capability:'cognitive.learn',input:{learningInput:{cycle,verification:{verified:false,sourceFingerprint:cycle.fingerprint,evidenceRefs:[]}}}}], context());
  assert.equal((learned.children[0]!.result.learning as Record<string, unknown>).promotable, false);
  assert.equal(learned.children[0]!.duty, 'assurance');
});
