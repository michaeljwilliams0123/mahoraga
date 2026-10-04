import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateStructuredOutput } from './structured-output.ts';
import { validateNativeDataSources } from './native-model-foundry.ts';
import type { NativeTrainingSource } from './native-model-foundry.ts';

export type NativeContextTrainingInput = {
 modelId: string; seed: number; epochs: number; learningRate: number; contextLength: number;
 embeddingSize: number; hiddenSize: number; trainingCodeSha: string;
 training: NativeTrainingSource[]; evaluation: NativeTrainingSource[];
};
type Configuration = Pick<NativeContextTrainingInput, 'seed' | 'epochs' | 'learningRate' | 'contextLength' | 'embeddingSize' | 'hiddenSize'>;
type SourceReference = {sourceId: string; contentDigest: string; contextDigest: string; rights: NativeTrainingSource['rights']; rightsEvidenceDigest: string};
export type NativeContextContinuationInput = Pick<NativeContextTrainingInput, 'modelId' | 'seed' | 'epochs' | 'learningRate' | 'trainingCodeSha' | 'training' | 'evaluation'> & {
 parentData: {training: NativeTrainingSource[]; evaluation: NativeTrainingSource[]};
};
type Manifest = Configuration & {
 schemaVersion: 1 | 2; modelId: string; architectureVersion: 'single-head-causal-context-v1'; tokenizerVersion: 'unicode-character-v1';
 tokenizerDigest: string; trainingDataManifest: string; evaluationDataManifest: string; dataRightsManifest: string;
 trainingCodeSha: string; trainingConfigurationSha: string; initializationSeed: number; parameterCount: number;
 trainingTokens: number; trainingExamples: number; evaluationExamples: number;
 optimizer: 'sgd-cross-entropy-clipped-v1'; learningRateSchedule: 'constant'; parentModel: string | null; trainingRunId: string;
 evaluationSuite: 'disjoint-context-last-token-v1'; knownLimitations: string[]; promotionStatus: 'candidate';
 rollbackCheckpoint: string | null; creditCost: 0; productionActivated: false;
 generation?: number; rootCheckpoint?: string; trainingHistory?: SourceReference[]; evaluationHistory?: SourceReference[];
};
export type NativeContextCheckpoint = { manifest: Manifest; tokenizer: string[]; weights: number[]; fingerprint: string };
const schema = JSON.parse(readFileSync(new URL('../model-foundry/contracts/context-checkpoint.schema.json', import.meta.url), 'utf8'));
const continuationSchema = JSON.parse(readFileSync(new URL('../model-foundry/contracts/context-continuation.schema.json', import.meta.url), 'utf8'));
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const dataManifest = (sources: NativeTrainingSource[]) => hash(sources.map(({ text, ...metadata }) => ({ ...metadata, contentDigest: hash(text) })));
const isDigest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const identifier = (value: unknown) => typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value);
function fail(code: string): never { throw new Error(code); }
function configuration(value: Configuration): Configuration {
 const { seed, epochs, learningRate, contextLength, embeddingSize, hiddenSize } = value;
 if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffffffff || !Number.isSafeInteger(epochs) || epochs < 1 || epochs > 200
  || !Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 0.25
  || !Number.isSafeInteger(contextLength) || contextLength < 2 || contextLength > 8
  || !Number.isSafeInteger(embeddingSize) || embeddingSize < 4 || embeddingSize > 16
  || !Number.isSafeInteger(hiddenSize) || hiddenSize < 4 || hiddenSize > 32) fail('context-training-config-invalid');
 return { seed, epochs, learningRate, contextLength, embeddingSize, hiddenSize };
}
function layout(vocabulary: number, c: Configuration) {
 let next = 0;
 const reserve = (size: number) => { const start = next; next += size; return start; };
 const d = c.embeddingSize, h = c.hiddenSize;
 const embedding = reserve(vocabulary * d), position = reserve(c.contextLength * d);
 const query = reserve(d * d), key = reserve(d * d), value = reserve(d * d);
 const hidden = reserve(h * d), hiddenBias = reserve(h), output = reserve(vocabulary * h), outputBias = reserve(vocabulary);
 return { embedding, position, query, key, value, hidden, hiddenBias, output, outputBias, count: next };
}
const dot = (a: number[], b: number[]) => a.reduce((sum, n, i) => sum + n * b[i]!, 0);
function softmax(logits: number[]) {
 const maximum = Math.max(...logits), values = logits.map(n => Math.exp(n - maximum));
 const sum = values.reduce((total, n) => total + n, 0);
 return values.map(n => n / sum);
}

/** Only preceding context is supplied. The supervised target never enters embeddings or attention. */
function forward(weights: number[], ids: number[], vocabulary: number, c: Configuration) {
 const o = layout(vocabulary, c), d = c.embeddingSize, h = c.hiddenSize;
 const x = ids.map((id, i) => Array.from({ length: d }, (_, j) => weights[o.embedding + id * d + j]! + weights[o.position + i * d + j]!));
 const project = (start: number, vector: number[]) => Array.from({ length: d }, (_, j) => vector.reduce((sum, n, k) => sum + weights[start + j * d + k]! * n, 0));
 const last = x.at(-1)!, q = project(o.query, last), keys = x.map(row => project(o.key, row)), values = x.map(row => project(o.value, row));
 const attention = softmax(keys.map(key => dot(q, key) / Math.sqrt(d)));
 const pooled = last.map((n, j) => n + values.reduce((sum, row, i) => sum + attention[i]! * row[j]!, 0));
 const hidden = Array.from({ length: h }, (_, j) => Math.tanh(weights[o.hiddenBias + j]! + pooled.reduce((sum, n, k) => sum + weights[o.hidden + j * d + k]! * n, 0)));
 const logits = Array.from({ length: vocabulary }, (_, j) => weights[o.outputBias + j]! + hidden.reduce((sum, n, k) => sum + weights[o.output + j * h + k]! * n, 0));
 return { o, x, q, keys, values, attention, pooled, hidden, logits, probabilities: softmax(logits) };
}
function lossValue(logits: number[], target: number) {
 const maximum = Math.max(...logits);
 return maximum + Math.log(logits.reduce((sum, n) => sum + Math.exp(n - maximum), 0)) - logits[target]!;
}
function gradient(weights: number[], ids: number[], target: number, vocabulary: number, c: Configuration) {
 const f = forward(weights, ids, vocabulary, c), { o, x, q, keys, values, attention, pooled, hidden } = f;
 const d = c.embeddingSize, h = c.hiddenSize, grad = Array<number>(weights.length).fill(0);
 const dh = Array<number>(h).fill(0), dp = Array<number>(d).fill(0), dx = x.map(() => Array<number>(d).fill(0));
 const add = (i: number, n: number) => { grad[i] = grad[i]! + n; };
 for (let j = 0; j < vocabulary; j++) {
  const delta = f.probabilities[j]! - Number(j === target); add(o.outputBias + j, delta);
  for (let k = 0; k < h; k++) { add(o.output + j * h + k, delta * hidden[k]!); dh[k] = dh[k]! + weights[o.output + j * h + k]! * delta; }
 }
 for (let j = 0; j < h; j++) {
  const delta = dh[j]! * (1 - hidden[j]! ** 2); add(o.hiddenBias + j, delta);
  for (let k = 0; k < d; k++) { add(o.hidden + j * d + k, delta * pooled[k]!); dp[k] = dp[k]! + weights[o.hidden + j * d + k]! * delta; }
 }
 const da = values.map(row => dot(dp, row)), average = dot(attention, da), dq = Array<number>(d).fill(0);
 const backProject = (start: number, delta: number[], row: number[], rowGradient: number[]) => {
  for (let j = 0; j < d; j++) for (let k = 0; k < d; k++) {
   add(start + j * d + k, delta[j]! * row[k]!);
   rowGradient[k] = rowGradient[k]! + weights[start + j * d + k]! * delta[j]!;
  }
 };
 for (let i = 0; i < ids.length; i++) {
  const ds = attention[i]! * (da[i]! - average) / Math.sqrt(d);
  for (let j = 0; j < d; j++) dq[j] = dq[j]! + ds * keys[i]![j]!;
  backProject(o.key, q.map(n => ds * n), x[i]!, dx[i]!);
  backProject(o.value, dp.map(n => attention[i]! * n), x[i]!, dx[i]!);
 }
 backProject(o.query, dq, x.at(-1)!, dx.at(-1)!);
 for (let j = 0; j < d; j++) dx.at(-1)![j] = dx.at(-1)![j]! + dp[j]!;
 for (let i = 0; i < ids.length; i++) for (let j = 0; j < d; j++) { add(o.embedding + ids[i]! * d + j, dx[i]![j]!); add(o.position + i * d + j, dx[i]![j]!); }
 return { loss: lossValue(f.logits, target), gradient: grad };
}
function encode(tokenizer: string[], text: string) { return [...text].map(token => Math.max(0, tokenizer.indexOf(token))); }
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }

export function trainNativeContextModel(input: NativeContextTrainingInput) { return trainContext(input, null); }

/** Warm-start a copied candidate; no registry mutation, authority or activation. Parent corpora bind prior history. */
export function continueNativeContextModel(parent: NativeContextCheckpoint, input: NativeContextContinuationInput) {
 const checked = loadNativeContextCheckpoint(JSON.stringify(parent)), m = checked.manifest;
 if (!input || Object.keys(input).sort().join(',') !== 'epochs,evaluation,learningRate,modelId,parentData,seed,training,trainingCodeSha'
  || !input.parentData || Object.keys(input.parentData).sort().join(',') !== 'evaluation,training') fail('context-continuation-input-invalid');
 validateNativeDataSources(input.parentData.training); validateNativeDataSources(input.parentData.evaluation);
 if (dataManifest(input.parentData.training) !== m.trainingDataManifest || dataManifest(input.parentData.evaluation) !== m.evaluationDataManifest) fail('context-parent-data-mismatch');
 if ((m.generation ?? 0) >= 16) fail('context-lineage-budget-exceeded');
 const references = (sources: NativeTrainingSource[]) => sources.map(s => sourceReference(s, checked.tokenizer));
 const history = {training: m.trainingHistory ?? references(input.parentData.training), evaluation: m.evaluationHistory ?? references(input.parentData.evaluation)};
 if (m.schemaVersion === 2 && [...references(input.parentData.training).map(s => ({s,items:history.training})),
  ...references(input.parentData.evaluation).map(s => ({s,items:history.evaluation}))].some(({s,items}) => !items.some(prior => sameReference(prior,s)))) fail('context-parent-history-mismatch');
 return trainContext({modelId:input.modelId, seed:input.seed, epochs:input.epochs, learningRate:input.learningRate, trainingCodeSha:input.trainingCodeSha,
  training:input.training, evaluation:input.evaluation, contextLength:m.contextLength, embeddingSize:m.embeddingSize, hiddenSize:m.hiddenSize}, checked, history);
}
function sourceReference(source: NativeTrainingSource, tokenizer: string[]): SourceReference {
 return {sourceId:source.sourceId, contentDigest:hash(source.text), contextDigest:hash(encode(tokenizer, source.text).slice(0,-1)), rights:source.rights, rightsEvidenceDigest:source.rightsEvidenceDigest};
}
function mergeHistory(previous: SourceReference[], current: SourceReference[]): SourceReference[] {
 const byId = new Map(previous.map(s => [s.sourceId,s]));
 for (const source of current) {
  const prior = byId.get(source.sourceId);
  if (prior ? !sameReference(prior,source) : [...byId.values()].some(s => s.contextDigest === source.contextDigest || s.contentDigest === source.contentDigest)) fail('context-historical-source-rewrite');
  byId.set(source.sourceId,source);
 }
 if (byId.size > 512) fail('context-lineage-budget-exceeded');
 return [...byId.values()].sort((a,b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0);
}
function sameReference(a: SourceReference,b: SourceReference) { return a.sourceId===b.sourceId && a.contentDigest===b.contentDigest && a.contextDigest===b.contextDigest && a.rights===b.rights && a.rightsEvidenceDigest===b.rightsEvidenceDigest; }
function validateHistory(training: SourceReference[], evaluation: SourceReference[]) {
 const valid = (items: SourceReference[]) => Array.isArray(items) && items.length >= 1 && items.length <= 512
  && items.every(s => s && Object.keys(s).sort().join(',') === 'contentDigest,contextDigest,rights,rightsEvidenceDigest,sourceId'
   && identifier(s.sourceId) && [s.contentDigest,s.contextDigest,s.rightsEvidenceDigest].every(isDigest)
   && ['owner-authorized','public-domain','permissive-license'].includes(s.rights))
  && new Set(items.map(s => s.sourceId)).size === items.length && new Set(items.map(s => s.contextDigest)).size === items.length
  && items.every((s,i) => i === 0 || items[i-1]!.sourceId < s.sourceId);
 if (!valid(training) || !valid(evaluation)) fail('context-lineage-invalid');
 const ids = new Set(training.map(s => s.sourceId)), bytes = new Set(training.map(s => s.contentDigest)), contexts = new Set(training.map(s => s.contextDigest));
 if (evaluation.some(s => ids.has(s.sourceId) || bytes.has(s.contentDigest) || contexts.has(s.contextDigest))) fail('context-historical-evaluation-contamination');
}
function trainContext(input: NativeContextTrainingInput, parent: NativeContextCheckpoint | null, history?: {training:SourceReference[];evaluation:SourceReference[]}) {
 if (!input || Object.keys(input).sort().join(',') !== 'contextLength,embeddingSize,epochs,evaluation,hiddenSize,learningRate,modelId,seed,training,trainingCodeSha'
  || !identifier(input.modelId) || !/^[a-f0-9]{40}$/.test(input.trainingCodeSha)) fail('context-training-config-invalid');
 const config = configuration(input);
 validateNativeDataSources(input.training); validateNativeDataSources(input.evaluation);
 const trainIds = new Set(input.training.map(s => s.sourceId)), trainTexts = new Set(input.training.map(s => hash(s.text)));
 if (input.evaluation.some(s => trainIds.has(s.sourceId) || trainTexts.has(hash(s.text)))) fail('context-train-eval-contamination');
 if ([...input.training, ...input.evaluation].some(s => [...s.text].length !== config.contextLength + 1)) fail('context-data-width-invalid');
 const tokens = [...new Set(input.training.flatMap(s => [...s.text]))].sort();
 if (tokens.length > 127) fail('context-tokenizer-capacity');
 const tokenizer = parent ? [...parent.tokenizer] : ['<unk>', ...tokens], vocabulary = tokenizer.length;
 if (parent && input.training.some(s => [...s.text].some(token => !tokenizer.includes(token)))) fail('context-continuation-vocabulary-growth');
 const dataset = (sources: NativeTrainingSource[]) => sources.map(s => { const ids = encode(tokenizer, s.text); return { context: ids.slice(0, -1), target: ids.at(-1)! }; });
 const training = dataset(input.training), evaluation = dataset(input.evaluation);
 const trainContexts = new Set(training.map(s => hash(s.context))), evalContexts = new Set(evaluation.map(s => hash(s.context)));
 if (trainContexts.size !== training.length || evalContexts.size !== evaluation.length || evaluation.some(s => trainContexts.has(hash(s.context)))) fail('context-effective-input-contamination');
 const lineage = history ? {training:mergeHistory(history.training,input.training.map(s => sourceReference(s,tokenizer))),
  evaluation:mergeHistory(history.evaluation,input.evaluation.map(s => sourceReference(s,tokenizer)))} : null;
 if (lineage) validateHistory(lineage.training,lineage.evaluation);
 const o = layout(vocabulary, config); let state = config.seed >>> 0;
 const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
 const weights = parent ? [...parent.weights] : Array<number>(o.count).fill(0);
 const initialize = (start: number, end: number, scale: number) => { for (let i = start; i < end; i++) weights[i] = (random() * 2 - 1) * scale; };
 if (!parent) {
  initialize(o.embedding, o.query, 0.5);
  initialize(o.query, o.hidden, Math.sqrt(3 / config.embeddingSize));
  initialize(o.hidden, o.hiddenBias, Math.sqrt(6 / (config.hiddenSize + config.embeddingSize)));
  initialize(o.output, o.outputBias, Math.sqrt(6 / (config.hiddenSize + vocabulary)));
 }
 const measure = (samples: typeof training) => samples.reduce((sum, sample) => sum + lossValue(forward(weights, sample.context, vocabulary, config).logits, sample.target), 0) / samples.length;
 const trainingBefore = measure(training), heldoutBefore = measure(evaluation);
 for (let epoch = 0; epoch < config.epochs; epoch++) {
  const order = Array.from({ length: training.length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!]; }
  for (const i of order) {
   const sample = training[i]!, result = gradient(weights, sample.context, sample.target, vocabulary, config);
   const norm = Math.hypot(...result.gradient), scale = norm > 5 ? 5 / norm : 1;
   if (!Number.isFinite(norm)) fail('context-training-nonfinite');
   for (let j = 0; j < weights.length; j++) weights[j] = weights[j]! - config.learningRate * scale * result.gradient[j]!;
  }
 }
 if (weights.some(n => !Number.isFinite(n) || Math.abs(n) > 100)) fail('context-training-nonfinite');
 const manifest: Manifest = { ...config, schemaVersion: parent ? 2 : 1, modelId: input.modelId, architectureVersion: 'single-head-causal-context-v1', tokenizerVersion: 'unicode-character-v1',
  tokenizerDigest: hash(tokenizer), trainingDataManifest: dataManifest(input.training), evaluationDataManifest: dataManifest(input.evaluation),
  dataRightsManifest: hash([...input.training, ...input.evaluation].map(({sourceId, rights, rightsEvidenceDigest}) => ({sourceId, rights, rightsEvidenceDigest}))),
  trainingCodeSha: input.trainingCodeSha, trainingConfigurationSha: hash(config), initializationSeed: parent?.manifest.initializationSeed ?? config.seed, parameterCount: weights.length,
  trainingTokens: training.length * config.contextLength, trainingExamples: training.length, evaluationExamples: evaluation.length,
  optimizer: 'sgd-cross-entropy-clipped-v1', learningRateSchedule: 'constant', parentModel: parent?.fingerprint ?? null,
  trainingRunId: hash({modelId: input.modelId, config, training: dataManifest(input.training), evaluation: dataManifest(input.evaluation), code: input.trainingCodeSha, ...(parent ? {parent:parent.fingerprint} : {})}),
  evaluationSuite: 'disjoint-context-last-token-v1', knownLimitations: ['single query and attention head', 'last-token supervision only', 'bounded synthetic context experiment', 'no general reasoning qualification', 'digests do not authenticate rights or evaluator'],
  promotionStatus: 'candidate', rollbackCheckpoint: parent?.fingerprint ?? null, creditCost: 0, productionActivated: false,
  ...(parent && lineage ? {generation:(parent.manifest.generation ?? 0)+1, rootCheckpoint:parent.manifest.rootCheckpoint ?? parent.fingerprint,
   trainingHistory:lineage.training,evaluationHistory:lineage.evaluation} : {}) };
 const core = { manifest, tokenizer, weights };
 const checkpoint = loadNativeContextCheckpoint(JSON.stringify({...core, fingerprint: hash(core)}));
 return freeze({ checkpoint, metrics: {trainingBefore, trainingAfter: measure(training), heldoutBefore, heldoutAfter: measure(evaluation),
  unknownEvaluationContextTokens: evaluation.reduce((n, s) => n + s.context.filter(id => id === 0).length, 0), unknownEvaluationTargets: evaluation.filter(s => s.target === 0).length} });
}

export function loadNativeContextCheckpoint(serialized: string): NativeContextCheckpoint {
 if (typeof serialized !== 'string' || Buffer.byteLength(serialized) > 1_048_576) fail('context-checkpoint-invalid');
 let raw: NativeContextCheckpoint;
 try { raw = JSON.parse(serialized); } catch { fail('context-checkpoint-invalid'); }
 if (!raw || Object.keys(raw).sort().join(',') !== 'fingerprint,manifest,tokenizer,weights' || !raw.manifest) fail('context-checkpoint-invalid');
 try { validateStructuredOutput(raw.manifest, raw.manifest.schemaVersion === 2 ? continuationSchema : schema); } catch { fail('context-checkpoint-manifest-invalid'); }
 const m = raw.manifest, config = configuration(m);
 if (!identifier(m.modelId) || !/^[a-f0-9]{40}$/.test(m.trainingCodeSha) || !Number.isSafeInteger(m.initializationSeed) || m.initializationSeed < 1 || m.initializationSeed > 0xffffffff || (m.schemaVersion === 1 && m.initializationSeed !== config.seed)
  || m.trainingConfigurationSha !== hash(config) || ![m.tokenizerDigest,m.trainingDataManifest,m.evaluationDataManifest,m.dataRightsManifest,m.trainingRunId].every(isDigest)
  || !Array.isArray(raw.tokenizer) || raw.tokenizer.length < 2 || raw.tokenizer.length > 128 || raw.tokenizer[0] !== '<unk>'
  || raw.tokenizer.slice(1).some(t => typeof t !== 'string' || [...t].length !== 1) || new Set(raw.tokenizer).size !== raw.tokenizer.length
  || JSON.stringify(raw.tokenizer.slice(1)) !== JSON.stringify(raw.tokenizer.slice(1).sort()) || m.tokenizerDigest !== hash(raw.tokenizer)
  || !Array.isArray(raw.weights) || raw.weights.length !== layout(raw.tokenizer.length, config).count || m.parameterCount !== raw.weights.length
  || raw.weights.some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 100)
  || m.trainingTokens !== m.trainingExamples * m.contextLength) fail('context-checkpoint-invalid');
 if (m.schemaVersion === 2) {
  if (!isDigest(m.parentModel) || m.parentModel !== m.rollbackCheckpoint || !isDigest(m.rootCheckpoint)
   || !Number.isSafeInteger(m.generation) || m.generation! < 1 || m.generation! > 16
   || (m.generation === 1 && m.rootCheckpoint !== m.parentModel) || !m.trainingHistory || !m.evaluationHistory
   || m.trainingHistory.length < m.trainingExamples || m.evaluationHistory.length < m.evaluationExamples) fail('context-lineage-invalid');
  validateHistory(m.trainingHistory,m.evaluationHistory);
 }
 const { fingerprint, ...core } = raw;
 if (!isDigest(fingerprint) || fingerprint !== hash(core)) fail('context-checkpoint-integrity');
 return freeze(raw);
}
function checkedInput(checkpoint: NativeContextCheckpoint, context: string) {
 const checked = loadNativeContextCheckpoint(JSON.stringify(checkpoint));
 if (typeof context !== 'string' || [...context].length < 1 || [...context].length > checked.manifest.contextLength) fail('context-input-invalid');
 return {checked, ids: encode(checked.tokenizer, context)};
}
export function predictNativeContextToken(checkpoint: NativeContextCheckpoint, context: string) {
 const {checked, ids} = checkedInput(checkpoint, context), f = forward(checked.weights, ids, checked.tokenizer.length, checked.manifest);
 const selected = f.probabilities.indexOf(Math.max(...f.probabilities));
 return freeze({token: checked.tokenizer[selected]!, probability: f.probabilities[selected]!, attention: f.attention,
  checkpointDigest: checked.fingerprint, nativeWeights: true, creditCost: 0, productionActivated: false});
}
/** Offline numerical verification/training inspection only; never an authority or runtime route. */
export function nativeContextLossGradient(checkpoint: NativeContextCheckpoint, context: string, target: string) {
 const {checked, ids} = checkedInput(checkpoint, context);
 if (typeof target !== 'string' || [...target].length !== 1) fail('context-target-invalid');
 return freeze(gradient(checked.weights, ids, encode(checked.tokenizer, target)[0]!, checked.tokenizer.length, checked.manifest));
}
/** Bounded offline measurement. Source/rights digests and scores do not grant independent evaluator authority. */
export function evaluateNativeContextModel(checkpoint: NativeContextCheckpoint, sources: NativeTrainingSource[]) {
 const checked = loadNativeContextCheckpoint(JSON.stringify(checkpoint)); validateNativeDataSources(sources);
 if (sources.some(s => [...s.text].length !== checked.manifest.contextLength + 1)) fail('context-data-width-invalid');
 let loss = 0, correct = 0, unknownTokens = 0;
 for (const source of sources) {
  const ids = encode(checked.tokenizer,source.text), target = ids.at(-1)!, f = forward(checked.weights,ids.slice(0,-1),checked.tokenizer.length,checked.manifest);
  loss += lossValue(f.logits,target); correct += Number(f.probabilities.indexOf(Math.max(...f.probabilities)) === target); unknownTokens += ids.filter(id => id === 0).length;
 }
 return freeze({loss:loss / sources.length, accuracy:correct / sources.length, unknownTokens, examples:sources.length, checkpointDigest:checked.fingerprint, dataManifest:dataManifest(sources),
  creditCost:0, productionActivated:false, executionAuthorityGranted:false});
}
