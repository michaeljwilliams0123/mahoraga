import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { trainNativeContextModel, loadNativeContextCheckpoint, predictNativeContextToken, nativeContextLossGradient } from '../src/native-context-model.ts';

const digest = 'a'.repeat(64);
function source(text: string, id: string) {
 return { sourceId: id, text, rights: 'owner-authorized' as const, rightsEvidenceDigest: digest };
}
function input(seed = 42) {
 const examples = (pairs: string[], split: string) => ['a', 'b'].flatMap(first => pairs.map((pair, i) => source(first + pair + first, `${split}-${first}-${i}`)));
 return { modelId: 'mahoraga-context-recall', seed, epochs: 100, learningRate: 0.08, contextLength: 3, embeddingSize: 8, hiddenSize: 16,
  trainingCodeSha: 'b'.repeat(40), training: examples(['cc','dd','ee','cd','dc'], 'train'), evaluation: examples(['ce','ec','de','ed'], 'heldout') };
}
function reseal(checkpoint: unknown) {
 const raw = JSON.parse(JSON.stringify(checkpoint)); const { fingerprint: _ignored, ...core } = raw;
 raw.fingerprint = createHash('sha256').update(JSON.stringify(core)).digest('hex'); return raw;
}

test('random-initialized causal attention learns held-out context retrieval beyond one-token information', () => {
 const data = input(), run = trainNativeContextModel(data);
 assert.ok(run.metrics.trainingAfter < run.metrics.trainingBefore * 0.2);
 assert.ok(run.metrics.heldoutAfter < run.metrics.heldoutBefore * 0.2);
 for (const item of data.evaluation) assert.equal(predictNativeContextToken(run.checkpoint, item.text.slice(0, -1)).token, item.text.at(-1));
 // Every final context character occurs with both labels equally: a one-token predictor is bounded at 50% here.
 for (const last of ['c','d','e']) {
  const items = data.evaluation.filter(item => item.text.at(-2) === last);
  assert.equal(items.filter(item => item.text.at(-1) === 'a').length, items.length / 2);
 }
 assert.equal(run.checkpoint.manifest.productionActivated, false);
 assert.equal(run.checkpoint.manifest.creditCost, 0);
 assert.ok(Object.isFrozen(run.checkpoint.weights));
});

test('identical seed/data/config reproduce the native checkpoint and save/load prediction', () => {
 const one = trainNativeContextModel(input()), two = trainNativeContextModel(input());
 assert.deepEqual(one, two);
 const loaded = loadNativeContextCheckpoint(JSON.stringify(one.checkpoint));
 assert.deepEqual(predictNativeContextToken(loaded, 'ace'), predictNativeContextToken(one.checkpoint, 'ace'));
 assert.equal(predictNativeContextToken(loaded, 'ace').checkpointDigest, one.checkpoint.fingerprint);
});

test('evaluation text never changes learned weights or the training-only vocabulary', () => {
 const base = input(), one = trainNativeContextModel(base);
 const two = trainNativeContextModel({ ...base, evaluation: [source('a?ca', 'unseen-evaluation')] });
 assert.deepEqual(one.checkpoint.weights, two.checkpoint.weights);
 assert.deepEqual(one.checkpoint.tokenizer, two.checkpoint.tokenizer);
 assert.equal(two.checkpoint.tokenizer.includes('?'), false);
 assert.equal(two.metrics.unknownEvaluationContextTokens, 1);
});

test('backpropagation through embeddings, positions, attention and readout agrees with finite differences', () => {
 const checkpoint = trainNativeContextModel({ ...input(), epochs: 1, embeddingSize: 4, hiddenSize: 4 }).checkpoint;
 const analytic = nativeContextLossGradient(checkpoint, 'acd', 'a');
 const epsilon = 1e-5;
 for (let i = 0; i < checkpoint.weights.length; i++) {
  const plus = reseal(checkpoint), minus = reseal(checkpoint);
  plus.weights[i] += epsilon; minus.weights[i] -= epsilon;
  const numeric = (nativeContextLossGradient(reseal(plus), 'acd', 'a').loss - nativeContextLossGradient(reseal(minus), 'acd', 'a').loss) / (2 * epsilon);
  assert.ok(Math.abs(numeric - analytic.gradient[i]!) < 2e-6, `parameter ${i}: analytic=${analytic.gradient[i]} numeric=${numeric}`);
 }
});

test('the same held-out recall task learns under multiple predeclared initialization seeds', () => {
 for (const seed of [7, 1337]) {
  const data = input(seed), run = trainNativeContextModel(data);
  for (const item of data.evaluation) assert.equal(predictNativeContextToken(run.checkpoint, item.text.slice(0, -1)).token, item.text.at(-1), `seed ${seed}`);
 }
});

test('source rights, effective-context contamination and compute budgets fail closed', () => {
 const base = input();
 for (const patch of [{ contextLength: 100 }, { embeddingSize: 1024 }, { hiddenSize: 1024 }, { epochs: 201 }, { learningRate: Infinity }, { seed: 0 },
  { training: [{ ...base.training[0]!, rights: 'unverified' }] }, { evaluation: base.training },
  { evaluation: [source(base.training[0]!.text, 'different-source-same-text')] },
  { evaluation: [source(base.training[0]!.text.slice(0, -1) + 'b', 'same-context-different-label')] },
  { training: [...base.training, source(base.training[0]!.text, 'duplicate-effective-context')] },
  { training: [source('short', 'wrong-width')] }]) assert.throws(() => trainNativeContextModel({ ...base, ...patch } as never));
});

test('checkpoint tampering, dimension drift, unexpected metadata and authority claims are rejected even if resealed', () => {
 const checkpoint = trainNativeContextModel(input()).checkpoint;
 const tampered = JSON.parse(JSON.stringify(checkpoint)); tampered.weights[0] += 0.01;
 assert.throws(() => loadNativeContextCheckpoint(JSON.stringify(tampered)), /context-checkpoint-integrity/);
 for (const change of [(raw: typeof tampered) => { raw.manifest.contextLength = 9; }, (raw: typeof tampered) => { raw.weights.pop(); },
  (raw: typeof tampered) => { raw.manifest.productionActivated = true; }, (raw: typeof tampered) => { raw.manifest.creditCost = 1; },
  (raw: typeof tampered) => { raw.manifest.privateToken = 'private-marker'; }, (raw: typeof tampered) => { raw.weights[0] = 101; },
  (raw: typeof tampered) => { raw.manifest.architectureVersion = 'unproved-general-intelligence'; }]) {
  const raw = JSON.parse(JSON.stringify(checkpoint)); change(raw);
  assert.throws(() => loadNativeContextCheckpoint(JSON.stringify(reseal(raw))));
 }
 assert.throws(() => loadNativeContextCheckpoint(' '.repeat(1_048_577)));
});

test('inference is bounded, provider-independent, and cannot consume a future supervised target', () => {
 const run = trainNativeContextModel(input());
 const predicted = predictNativeContextToken(run.checkpoint, 'ace');
 assert.equal(predicted.nativeWeights, true); assert.equal(predicted.productionActivated, false); assert.equal(predicted.creditCost, 0);
 assert.ok(predicted.probability > 0 && predicted.probability <= 1);
 assert.ok(Math.abs(predicted.attention.reduce((sum, n) => sum + n, 0) - 1) < 1e-10);
 assert.equal(predicted.attention.length, 3);
 assert.throws(() => predictNativeContextToken(run.checkpoint, 'acea'), /context-input-invalid/);
 assert.throws(() => predictNativeContextToken(run.checkpoint, ''), /context-input-invalid/);
});
