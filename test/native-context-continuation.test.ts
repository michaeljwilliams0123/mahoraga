import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { trainNativeContextModel, continueNativeContextModel, loadNativeContextCheckpoint, predictNativeContextToken } from '../src/native-context-model.ts';

const source = (text: string, sourceId: string) => ({text, sourceId, rights: 'owner-authorized' as const, rightsEvidenceDigest: 'a'.repeat(64)});
const samples = (pairs: string[], split: string) => ['a','b'].flatMap(first => pairs.map((pair,i) => source(first + pair + first, `${split}-${first}-${i}`)));
const rootInput = (seed = 42) => ({modelId: 'native-replay-root', seed, epochs: 80, learningRate: 0.08, contextLength: 3, embeddingSize: 8, hiddenSize: 16,
 trainingCodeSha: 'b'.repeat(40), training: samples(['cc','dd','ee','cd','dc'], 'train'), evaluation: samples(['ce','ec','de','ed'], 'heldout')});
function childInput(seed = 42) {
 const root = rootInput(seed);
 return {modelId: 'native-replay-child', seed, epochs: 50, learningRate: 0.08, trainingCodeSha: 'c'.repeat(40),
  parentData: {training: root.training, evaluation: root.evaluation},
  training: [...root.training, source('caca','new-a'), source('cbcb','new-b')],
  evaluation: [source('cada','adaptation-a'), source('cbdb','adaptation-b')]};
}
const reseal = (value: unknown) => { const raw = JSON.parse(JSON.stringify(value)); const {fingerprint: _ignored, ...core} = raw; raw.fingerprint = createHash('sha256').update(JSON.stringify(core)).digest('hex'); return raw; };

test('continuation learns from copied parent weights with immutable exact lineage and reproducibility', () => {
 const data = rootInput(), parent = trainNativeContextModel(data).checkpoint, before = JSON.stringify(parent), input = childInput();
 const child = continueNativeContextModel(parent, input), repeat = continueNativeContextModel(parent, input);
 assert.equal(JSON.stringify(parent), before); assert.deepEqual(child, repeat);
 assert.equal(child.checkpoint.manifest.schemaVersion, 2);
 assert.equal(child.checkpoint.manifest.parentModel, parent.fingerprint);
 assert.equal(child.checkpoint.manifest.rollbackCheckpoint, parent.fingerprint);
 assert.equal(child.checkpoint.manifest.generation, 1);
 assert.equal(child.checkpoint.manifest.rootCheckpoint, parent.fingerprint);
 assert.deepEqual(child.checkpoint.tokenizer, parent.tokenizer);
 assert.notDeepEqual(child.checkpoint.weights, parent.weights);
 assert.equal(child.checkpoint.manifest.productionActivated, false);
 assert.equal(child.checkpoint.manifest.creditCost, 0);
 assert.ok(Object.isFrozen(child.checkpoint.weights));
 assert.ok(child.metrics.trainingAfter < child.metrics.trainingBefore);
 assert.equal(predictNativeContextToken(loadNativeContextCheckpoint(JSON.stringify(child.checkpoint)), 'cad').token, 'a');
});

test('continuation initial loss equals the parent model and initialization seed survives a new shuffle seed', () => {
 const parent = trainNativeContextModel(rootInput()).checkpoint, data = childInput(7);
 const child = continueNativeContextModel(parent, data);
 assert.equal(child.checkpoint.manifest.initializationSeed, 42);
 assert.equal(child.checkpoint.manifest.seed, 7);
 const expected = data.evaluation.reduce((sum,s) => sum - Math.log(predictNativeContextToken(parent, s.text.slice(0,-1)).probability), 0) / data.evaluation.length;
 // These fixtures have correctly predicted parent labels, so selected probability is target probability.
 for (const s of data.evaluation) assert.equal(predictNativeContextToken(parent, s.text.slice(0,-1)).token, s.text.at(-1));
 assert.ok(Math.abs(child.metrics.heldoutBefore - expected) < 1e-10);
});

test('parent corpus/rights, vocabulary growth, old held-out leakage and historical source rewrites fail closed', () => {
 const parent = trainNativeContextModel(rootInput()).checkpoint, input = childInput();
 for (const patch of [
  {parentData: {...input.parentData, training: input.parentData.training.slice(1)}},
  {parentData: {...input.parentData, training: input.parentData.training.map((s,i) => i ? s : {...s, rightsEvidenceDigest: 'd'.repeat(64)})}},
  {training: [source('zccz','unknown-vocabulary')]},
  {training: [input.parentData.evaluation[0]!]},
  {training: [source(input.parentData.evaluation[0]!.text, 'renamed-old-heldout')]},
  {training: [source('aceb','old-context-new-label')]},
  {training: [source('ccca', input.parentData.training[0]!.sourceId)]},
  {training: [source(input.parentData.training[0]!.text, 'renamed-replay')]},
  {evaluation: [input.parentData.training[0]!]},
  {evaluation: [source(input.parentData.training[0]!.text, 'renamed-old-training')]},
 ]) assert.throws(() => continueNativeContextModel(parent, {...input, ...patch}));
});

test('history preserves earlier held-out reservations through successive generations and rejects resealed authority/lineage drift', () => {
 const parent = trainNativeContextModel(rootInput()).checkpoint, input = childInput(), child = continueNativeContextModel(parent,input).checkpoint;
 const next = {...input, modelId: 'native-replay-grandchild', parentData: {training: input.training, evaluation: input.evaluation},
  training: input.training, evaluation: [source('ccea', 'next-eval')]};
 const grandchild = continueNativeContextModel(child,next).checkpoint;
 assert.equal(grandchild.manifest.generation, 2);
 assert.equal(grandchild.manifest.parentModel, child.fingerprint);
 assert.equal(grandchild.manifest.rootCheckpoint, parent.fingerprint);
 assert.throws(() => continueNativeContextModel(grandchild,{...next,parentData:{training:next.training,evaluation:next.evaluation},training:[rootInput().evaluation[0]!]}));
 for (const mutation of [(r: any) => {r.manifest.rollbackCheckpoint = 'd'.repeat(64);}, (r: any) => {r.manifest.generation = 17;},
  (r: any) => {r.manifest.productionActivated = true;}, (r: any) => {r.manifest.trainingHistory.push(r.manifest.evaluationHistory[0]);},
  (r: any) => {r.manifest.trainingHistory.reverse();}, (r: any) => {r.manifest.privateToken = 'marker';}]) {
  const raw = reseal(child); mutation(raw); assert.throws(() => loadNativeContextCheckpoint(JSON.stringify(reseal(raw))));
 }
});

test('evaluation-only changes cannot affect continuation weights and v1 checkpoint bytes remain supported', () => {
 const parent = trainNativeContextModel(rootInput()).checkpoint, input = childInput();
 const one = continueNativeContextModel(parent,input), two = continueNativeContextModel(parent,{...input,evaluation:[source('cbea','different-heldout')]});
 assert.deepEqual(one.checkpoint.weights,two.checkpoint.weights);
 assert.deepEqual(loadNativeContextCheckpoint(JSON.stringify(parent)),parent);
 assert.equal(parent.manifest.schemaVersion,1); assert.equal(parent.manifest.parentModel,null);
});
