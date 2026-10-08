// Offline, zero-provider-credit experiment: learned action-conditioned state transitions.
// A simulator/benchmark candidate, never a live capability grant or consciousness claim.
import { createHash } from "node:crypto";

type Rights = "owner-authorized" | "public-domain" | "permissive-license";
export type NativeWorldEpisode = {
  episodeId: string; actionId: string; state: Record<string, number>; nextState: Record<string, number>;
  rights: Rights; rightsEvidenceDigest: string;
};
export type NativeWorldTrainingInput = {
  modelId: string; trainingCodeSha: string; seed: number; epochs: number; learningRate: number;
  features: string[]; actions: string[]; training: NativeWorldEpisode[]; evaluation: NativeWorldEpisode[];
};
type WorldManifest = {
  schemaVersion: 1; kind: "native-world-transition-candidate"; architecture: "action-conditioned-linear-residual-v1";
  modelId: string; trainingCodeSha: string; seed: number; epochs: number; learningRate: number;
  trainingDataDigest: string; evaluationDataDigest: string; rightsManifestDigest: string;
  configurationDigest: string; parameterCount: number; trainingExamples: number; evaluationExamples: number;
  knownLimitations: string[]; productionActivated: false; executionAuthorityGranted: false;
  creditCost: 0; qualification: "offline-heldout-only";
};
export type NativeWorldCheckpoint = {
  manifest: WorldManifest; features: string[]; actions: string[]; weights: number[]; fingerprint: string;
};
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const isDigest = (x: unknown): x is string => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const isId = (x: unknown): x is string => typeof x === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(x);
const isFeature = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(x);
function fail(code: string): never { throw new Error(code); }
function exact(value: unknown, keys: readonly string[], code: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) fail(code);
}
function values(value: unknown, features: readonly string[], bound: number): number[] {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== features.length ||
      Object.keys(value).some(key => !features.includes(key))) fail("native-world-state-invalid");
  return features.map(key => {
    const n = (value as Record<string, unknown>)[key];
    if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > bound) fail("native-world-state-invalid");
    return n;
  });
}
function vector(items: unknown, predicate: (item: unknown) => boolean, max: number, code: string): string[] {
  if (!Array.isArray(items) || items.length < 1 || items.length > max || items.some(item => !predicate(item)) || new Set(items).size !== items.length) fail(code);
  return [...items].sort();
}
function checkedEpisodes(items: unknown, features: readonly string[], actions: readonly string[]): NativeWorldEpisode[] {
  if (!Array.isArray(items) || items.length < 1 || items.length > 128) fail("native-world-dataset-invalid");
  const ids = new Set<string>();
  return items.map((item: unknown) => {
    exact(item, ["episodeId","actionId","state","nextState","rights","rightsEvidenceDigest"], "native-world-episode-invalid");
    if (!isId(item.episodeId) || ids.has(item.episodeId) || !actions.includes(String(item.actionId)) ||
        !["owner-authorized","public-domain","permissive-license"].includes(String(item.rights)) ||
        !isDigest(item.rightsEvidenceDigest)) fail("native-world-episode-invalid");
    ids.add(item.episodeId);
    const before = values(item.state, features, 1), after = values(item.nextState, features, 2);
    const state = Object.fromEntries(features.map((feature, i) => [feature, before[i]!]));
    const nextState = Object.fromEntries(features.map((feature, i) => [feature, after[i]!]));
    return { episodeId: item.episodeId, actionId: String(item.actionId), state, nextState,
      rights: item.rights as Rights, rightsEvidenceDigest: String(item.rightsEvidenceDigest) };
  });
}
function offset(actionIndex: number, output: number, features: number): number {
  return (actionIndex * features + output) * (features + 1);
}
function delta(weights: readonly number[], actionIndex: number, state: readonly number[], featureCount: number): number[] {
  return Array.from({ length: featureCount }, (_, output) => {
    const start = offset(actionIndex, output, featureCount);
    return weights[start]! + state.reduce((sum, value, i) => sum + value * weights[start + 1 + i]!, 0);
  });
}
function mse(weights: readonly number[], items: readonly NativeWorldEpisode[], features: readonly string[], actions: readonly string[]): number {
  let sum = 0;
  for (const item of items) {
    const state = values(item.state, features, 1), actual = values(item.nextState, features, 2);
    const predicted = delta(weights, actions.indexOf(item.actionId), state, features.length);
    for (let i = 0; i < features.length; i++) sum += ((state[i]! + predicted[i]!) - actual[i]!) ** 2;
  }
  return sum / (items.length * features.length);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value); for (const item of Object.values(value)) freeze(item);
  }
  return value;
}
/** Gradient-descent candidate. Its label is always OFFLINE, never production-readiness. */
export function trainNativeWorldModel(input: NativeWorldTrainingInput) {
  exact(input, ["modelId","trainingCodeSha","seed","epochs","learningRate","features","actions","training","evaluation"], "native-world-input-invalid");
  if (!isId(input.modelId) || typeof input.trainingCodeSha !== "string" || !/^[a-f0-9]{40}$/.test(input.trainingCodeSha) ||
      !Number.isSafeInteger(input.seed) || input.seed < 1 || input.seed > 0xffffffff ||
      !Number.isSafeInteger(input.epochs) || input.epochs < 1 || input.epochs > 250 ||
      typeof input.learningRate !== "number" || !Number.isFinite(input.learningRate) ||
      input.learningRate <= 0 || input.learningRate > 0.1) fail("native-world-config-invalid");
  const features = vector(input.features, isFeature, 4, "native-world-features-invalid");
  const actions = vector(input.actions, isId, 4, "native-world-actions-invalid");
  const training = checkedEpisodes(input.training, features, actions);
  const evaluation = checkedEpisodes(input.evaluation, features, actions);
  const trainingIds = new Set(training.map(e => e.episodeId));
  const transitions = new Set(training.map(e => hash([e.actionId,e.state,e.nextState])));
  for (const e of evaluation) {
    if (trainingIds.has(e.episodeId) || transitions.has(hash([e.actionId,e.state,e.nextState]))) fail("native-world-data-leakage");
  }
  if (actions.some(action => !training.some(e => e.actionId === action) || !evaluation.some(e => e.actionId === action))) fail("native-world-action-holdout-incomplete");
  let randomState = input.seed >>> 0;
  const random = () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) / 4294967296; };
  const weights = Array.from({ length: actions.length * features.length * (features.length + 1) }, () => (random() - .5) * .01);
  const trainingBefore = mse(weights, training, features, actions);
  const heldoutBefore = mse(weights, evaluation, features, actions);
  for (let epoch = 0; epoch < input.epochs; epoch++) {
    for (const e of training) {
      const state = values(e.state, features, 1), after = values(e.nextState, features, 2);
      const action = actions.indexOf(e.actionId), predicted = delta(weights, action, state, features.length);
      for (let i = 0; i < features.length; i++) {
        const gradient = Math.max(-10, Math.min(10, 2 * (state[i]! + predicted[i]! - after[i]!)));
        const start = offset(action, i, features.length);
        weights[start] = weights[start]! - input.learningRate * gradient;
        for (let j = 0; j < features.length; j++) weights[start + 1 + j] = weights[start + 1 + j]! - input.learningRate * gradient * state[j]!;
      }
    }
  }
  if (weights.some(x => !Number.isFinite(x) || Math.abs(x) > 10)) fail("native-world-weights-invalid");
  const trainingAfter = mse(weights, training, features, actions), heldoutAfter = mse(weights, evaluation, features, actions);
  const manifest: WorldManifest = {
    schemaVersion: 1, kind: "native-world-transition-candidate", architecture: "action-conditioned-linear-residual-v1",
    modelId: input.modelId, trainingCodeSha: input.trainingCodeSha, seed: input.seed,
    epochs: input.epochs, learningRate: input.learningRate,
    trainingDataDigest: hash(training), evaluationDataDigest: hash(evaluation),
    rightsManifestDigest: hash([...training, ...evaluation].map(({episodeId,rights,rightsEvidenceDigest}) => ({episodeId,rights,rightsEvidenceDigest}))),
    configurationDigest: hash({features,actions,seed:input.seed,epochs:input.epochs,learningRate:input.learningRate}),
    parameterCount: weights.length, trainingExamples: training.length, evaluationExamples: evaluation.length,
    knownLimitations: ["linear action-conditioned dynamics", "synthetic owner-authorized episodes only", "heldout distribution is hand-authored", "no live environment execution or independent evaluator", "not a general-intelligence or sentience test"],
    productionActivated: false, executionAuthorityGranted: false, creditCost: 0, qualification: "offline-heldout-only",
  };
  const core = { manifest, features, actions, weights };
  return freeze({ checkpoint: { ...core, fingerprint: hash(core) },
    metrics: { trainingBefore, trainingAfter, heldoutBefore, heldoutAfter,
      improved: trainingAfter < trainingBefore && heldoutAfter < heldoutBefore } });
}
export function loadNativeWorldCheckpoint(serialized: string): NativeWorldCheckpoint {
  if (typeof serialized !== "string" || Buffer.byteLength(serialized) > 65536) fail("native-world-checkpoint-invalid");
  let object: unknown;
  try { object = JSON.parse(serialized); } catch { fail("native-world-checkpoint-invalid"); }
  exact(object, ["manifest","features","actions","weights","fingerprint"], "native-world-checkpoint-invalid");
  const manifest = object.manifest;
  exact(manifest, ["schemaVersion","kind","architecture","modelId","trainingCodeSha","seed","epochs","learningRate",
    "trainingDataDigest","evaluationDataDigest","rightsManifestDigest","configurationDigest","parameterCount",
    "trainingExamples","evaluationExamples","knownLimitations","productionActivated","executionAuthorityGranted",
    "creditCost","qualification"], "native-world-checkpoint-invalid");
  const features = vector(object.features, isFeature, 4, "native-world-checkpoint-invalid");
  const actions = vector(object.actions, isId, 4, "native-world-checkpoint-invalid");
  if (JSON.stringify(features) !== JSON.stringify(object.features) || JSON.stringify(actions) !== JSON.stringify(object.actions) ||
      manifest.schemaVersion !== 1 || manifest.kind !== "native-world-transition-candidate" ||
      manifest.architecture !== "action-conditioned-linear-residual-v1" || manifest.qualification !== "offline-heldout-only" ||
      manifest.productionActivated !== false || manifest.executionAuthorityGranted !== false || manifest.creditCost !== 0 ||
      !isId(manifest.modelId) || typeof manifest.trainingCodeSha !== "string" || !/^[a-f0-9]{40}$/.test(manifest.trainingCodeSha) ||
      typeof manifest.seed !== "number" || !Number.isSafeInteger(manifest.seed) || manifest.seed < 1 || manifest.seed > 0xffffffff ||
      typeof manifest.epochs !== "number" || !Number.isSafeInteger(manifest.epochs) || manifest.epochs < 1 || manifest.epochs > 250 ||
      typeof manifest.learningRate !== "number" || !Number.isFinite(manifest.learningRate) || manifest.learningRate <= 0 || manifest.learningRate > .1 ||
      ![manifest.trainingDataDigest, manifest.evaluationDataDigest, manifest.rightsManifestDigest, manifest.configurationDigest].every(isDigest) ||
      typeof manifest.trainingExamples !== "number" || !Number.isSafeInteger(manifest.trainingExamples) || manifest.trainingExamples < 1 || manifest.trainingExamples > 128 ||
      typeof manifest.evaluationExamples !== "number" || !Number.isSafeInteger(manifest.evaluationExamples) || manifest.evaluationExamples < 1 || manifest.evaluationExamples > 128 ||
      !Array.isArray(manifest.knownLimitations) || manifest.knownLimitations.length < 1 ||
      manifest.knownLimitations.some((x: unknown) => typeof x !== "string" || x.length > 200) ||
      !Array.isArray(object.weights) || object.weights.length !== actions.length * features.length * (features.length + 1) ||
      manifest.parameterCount !== object.weights.length ||
      object.weights.some((x: unknown) => typeof x !== "number" || !Number.isFinite(x) || Math.abs(x) > 10) ||
      !isDigest(object.fingerprint)) fail("native-world-checkpoint-invalid");
  const core = { manifest, features: object.features, actions: object.actions, weights: object.weights };
  if (hash(core) !== object.fingerprint) fail("native-world-checkpoint-integrity");
  return freeze(object as NativeWorldCheckpoint);
}
export function predictNativeWorldState(checkpoint: NativeWorldCheckpoint, actionId: string, state: Record<string, number>) {
  const candidate = loadNativeWorldCheckpoint(JSON.stringify(checkpoint));
  const action = candidate.actions.indexOf(actionId);
  if (action < 0) fail("native-world-action-not-trained");
  const normalized = values(state, candidate.features, 1);
  const changes = delta(candidate.weights, action, normalized, candidate.features.length);
  if (changes.some(x => !Number.isFinite(x))) fail("native-world-prediction-invalid");
  return freeze({ kind: "native-world-offline-prediction" as const, checkpointFingerprint: candidate.fingerprint,
    actionId, predictedState: Object.fromEntries(candidate.features.map((key, i) => [key, normalized[i]! + changes[i]!])),
    executionAuthorityGranted: false as const });
}
