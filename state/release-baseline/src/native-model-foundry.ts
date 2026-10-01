import { readFileSync } from "node:fs";
import { validateStructuredOutput } from "./structured-output.ts";
import { createHash } from "node:crypto";
type Source = { sourceId: string; text: string; rights: "owner-authorized" | "public-domain" | "permissive-license"; rightsEvidenceDigest: string };
type TrainingInput = { modelId: string; seed: number; epochs: number; learningRate: number; trainingCodeSha: string; training: Source[]; evaluation: Source[] };
type Manifest = { schemaVersion: 1; modelId: string; architectureVersion: "dense-bigram-softmax-v1"; tokenizerVersion: "unicode-character-v1"; tokenizerDigest: string; trainingDataManifest: string; evaluationDataManifest: string; dataRightsManifest: string; trainingCodeSha: string; trainingConfigurationSha: string; initializationSeed: number; parameterCount: number; trainingTokens: number; optimizer: "sgd-cross-entropy-v1"; learningRateSchedule: "constant"; parentModel: null; trainingRunId: string; evaluationSuite: "disjoint-source-next-token-v1"; knownLimitations: string[]; promotionStatus: "candidate"; rollbackCheckpoint: null; creditCost: 0; productionActivated: false };
export type NativeCheckpoint = { manifest: Manifest; tokenizer: string[]; weights: number[]; fingerprint: string };
const CHECKPOINT_SCHEMA = JSON.parse(readFileSync(new URL("../model-foundry/contracts/checkpoint.schema.json", import.meta.url), "utf8"));
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const identifier = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9-]{0,79}$/.test(value);
function fail(code: string): never { throw new Error(code); }
function sources(items: Source[]): void {
 if (!Array.isArray(items) || items.length < 1 || items.length > 32) fail("foundry-data-invalid");
 const ids = new Set<string>(); let bytes = 0;
 for (const item of items) {
  if (!item || Object.keys(item).sort().join(",") !== "rights,rightsEvidenceDigest,sourceId,text" || !identifier(item.sourceId) || ids.has(item.sourceId) || !["owner-authorized", "public-domain", "permissive-license"].includes(item.rights) || !digest(item.rightsEvidenceDigest) || typeof item.text !== "string" || [...item.text].length < 2) fail("foundry-data-rights-invalid");
  ids.add(item.sourceId); bytes += Buffer.byteLength(item.text);
 }
 if (bytes > 8192) fail("foundry-data-too-large");
}
function pairs(items: Source[], tokenizer: string[]): [number, number][] {
 const index = new Map(tokenizer.map((token, id) => [token, id]));
 return items.flatMap(item => {
  const ids = [...item.text].map(token => index.get(token) ?? 0);
  return ids.slice(1).map((token, i) => [ids[i]!, token] as [number, number]);
 });
}
function probabilities(weights: readonly number[], row: number, size: number): number[] {
 const logits = weights.slice(row * size, (row + 1) * size), maximum = Math.max(...logits);
 const values = logits.map(value => Math.exp(value - maximum)), total = values.reduce((sum, value) => sum + value, 0);
 return values.map(value => value / total);
}
function loss(weights: number[], dataset: [number, number][], size: number): number {
 return dataset.reduce((sum, [x, y]) => sum - Math.log(Math.max(1e-15, probabilities(weights, x, size)[y]!)), 0) / dataset.length;
}
/** A real trainable next-token baseline, not a transformer, general reasoner, or production route. */
export function trainNativeSmokeModel(input: TrainingInput) {
 if (!input || Object.keys(input).sort().join(",") !== "epochs,evaluation,learningRate,modelId,seed,training,trainingCodeSha" || !identifier(input.modelId) || !Number.isSafeInteger(input.seed) || input.seed < 1 || input.seed > 0xffffffff || !Number.isSafeInteger(input.epochs) || input.epochs < 1 || input.epochs > 200 || !Number.isFinite(input.learningRate) || input.learningRate <= 0 || input.learningRate > 1 || !/^[a-f0-9]{40}$/.test(input.trainingCodeSha)) fail("foundry-training-config-invalid");
 sources(input.training); sources(input.evaluation);
 const trainIds = new Set(input.training.map(item => item.sourceId)), trainBytes = new Set(input.training.map(item => hash(item.text)));
 if (input.evaluation.some(item => trainIds.has(item.sourceId) || trainBytes.has(hash(item.text)))) fail("foundry-train-eval-contamination");
 const vocabulary = [...new Set(input.training.flatMap(item => [...item.text]))].sort();
 if (vocabulary.length > 127) fail("foundry-tokenizer-capacity");
 const tokenizer = ["<unk>", ...vocabulary], size = tokenizer.length;
 const training = pairs(input.training, tokenizer), evaluation = pairs(input.evaluation, tokenizer);
 let state = input.seed >>> 0;
 const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
 const weights = Array.from({ length: size * size }, () => (random() - 0.5) * 0.02);
 const trainingBefore = loss(weights, training, size), heldoutBefore = loss(weights, evaluation, size);
 for (let epoch = 0; epoch < input.epochs; epoch++) {
  for (const [x, y] of training) {
   const predicted = probabilities(weights, x, size);
   for (let token = 0; token < size; token++) weights[x * size + token] = weights[x * size + token]! - input.learningRate * (predicted[token]! - Number(token === y));
  }
 }
 const metrics = { trainingBefore, trainingAfter: loss(weights, training, size), heldoutBefore, heldoutAfter: loss(weights, evaluation, size) };
 const manifest: Manifest = {
  schemaVersion: 1, modelId: input.modelId, architectureVersion: "dense-bigram-softmax-v1", tokenizerVersion: "unicode-character-v1", tokenizerDigest: hash(tokenizer),
  trainingDataManifest: hash(input.training.map(({ text, ...metadata }) => ({ ...metadata, contentDigest: hash(text) }))),
  evaluationDataManifest: hash(input.evaluation.map(({ text, ...metadata }) => ({ ...metadata, contentDigest: hash(text) }))),
  dataRightsManifest: hash([...input.training, ...input.evaluation].map(({ sourceId, rights, rightsEvidenceDigest }) => ({ sourceId, rights, rightsEvidenceDigest }))),
  trainingCodeSha: input.trainingCodeSha, trainingConfigurationSha: hash({ seed: input.seed, epochs: input.epochs, learningRate: input.learningRate }), initializationSeed: input.seed,
  parameterCount: weights.length, trainingTokens: training.length, optimizer: "sgd-cross-entropy-v1", learningRateSchedule: "constant", parentModel: null,
  trainingRunId: hash({ modelId: input.modelId, training: hash(input.training), evaluation: hash(input.evaluation), seed: input.seed, epochs: input.epochs, learningRate: input.learningRate, trainingCodeSha: input.trainingCodeSha }),
  evaluationSuite: "disjoint-source-next-token-v1", knownLimitations: ["one-token context", "synthetic smoke model", "no general reasoning qualification", "rights assertions require independent provenance review", "disjoint bytes do not prove semantic non-contamination"], promotionStatus: "candidate", rollbackCheckpoint: null, creditCost: 0, productionActivated: false,
 };
 const core = { manifest, tokenizer, weights };
 return freeze({ checkpoint: { ...core, fingerprint: hash(core) }, metrics });
}
export function loadNativeCheckpoint(serialized: string): NativeCheckpoint {
 if (typeof serialized !== "string" || Buffer.byteLength(serialized) > 1_048_576) fail("checkpoint-invalid");
 let raw: NativeCheckpoint;
 try { raw = JSON.parse(serialized); } catch { fail("checkpoint-invalid"); }
 if (!raw || Object.keys(raw).sort().join(",") !== "fingerprint,manifest,tokenizer,weights" || !raw.manifest || !Array.isArray(raw.tokenizer) || raw.tokenizer.length < 2 || raw.tokenizer.length > 128 || raw.tokenizer[0] !== "<unk>" || raw.tokenizer.slice(1).some(token => typeof token !== "string" || [...token].length !== 1) || new Set(raw.tokenizer).size !== raw.tokenizer.length || !Array.isArray(raw.weights) || raw.weights.length !== raw.tokenizer.length ** 2 || raw.weights.some(value => !Number.isFinite(value) || typeof value !== "number" || Math.abs(value) > 100) || raw.manifest.schemaVersion !== 1 || raw.manifest.architectureVersion !== "dense-bigram-softmax-v1" || raw.manifest.tokenizerVersion !== "unicode-character-v1" || raw.manifest.promotionStatus !== "candidate" || raw.manifest.productionActivated !== false || raw.manifest.parameterCount !== raw.weights.length || raw.manifest.tokenizerDigest !== hash(raw.tokenizer)) fail("checkpoint-invalid");
 try { validateStructuredOutput(raw.manifest, CHECKPOINT_SCHEMA); } catch { fail("checkpoint-manifest-invalid"); }
 if (![raw.manifest.tokenizerDigest, raw.manifest.trainingDataManifest, raw.manifest.evaluationDataManifest, raw.manifest.dataRightsManifest, raw.manifest.trainingConfigurationSha, raw.manifest.trainingRunId].every(digest) || !identifier(raw.manifest.modelId) || !/^[a-f0-9]{40}$/.test(raw.manifest.trainingCodeSha) || raw.manifest.optimizer !== "sgd-cross-entropy-v1" || raw.manifest.learningRateSchedule !== "constant" || raw.manifest.evaluationSuite !== "disjoint-source-next-token-v1" || raw.manifest.creditCost !== 0 || !Number.isSafeInteger(raw.manifest.initializationSeed) || raw.manifest.initializationSeed < 1 || raw.manifest.initializationSeed > 0xffffffff || raw.manifest.trainingTokens < 1 || raw.manifest.trainingTokens > 8192) fail("checkpoint-manifest-invalid");
 const { fingerprint, ...core } = raw;
 if (!digest(fingerprint) || fingerprint !== hash(core)) fail("checkpoint-integrity");
 return freeze(raw);
}
export function predictNativeToken(checkpoint: NativeCheckpoint, previous: string) {
 const checked = loadNativeCheckpoint(JSON.stringify(checkpoint));
 if (typeof previous !== "string" || [...previous].length !== 1) fail("foundry-context-invalid");
 const index = checked.tokenizer.indexOf(previous), values = probabilities(checked.weights, index < 0 ? 0 : index, checked.tokenizer.length);
 const selected = values.indexOf(Math.max(...values));
 return Object.freeze({ token: checked.tokenizer[selected]!, probability: values[selected]!, checkpointDigest: checked.fingerprint, nativeWeights: true, creditCost: 0, productionActivated: false });
}
/** Eligibility only. This function cannot change incumbent state or activate a model. */
export function evaluateCheckpointPromotion(input: { candidateDigest: string; evaluatorDigest: string; evaluatedCheckpointDigest: string; independent: boolean; heldoutBefore: number; heldoutAfter: number; rollbackDigest: string; incumbentAuthority: string; expectedAuthority: string }) {
 const eligible = digest(input.candidateDigest) && digest(input.evaluatorDigest) && digest(input.rollbackDigest) && input.evaluatedCheckpointDigest === input.candidateDigest && input.independent === true && Number.isFinite(input.heldoutBefore) && Number.isFinite(input.heldoutAfter) && input.heldoutAfter >= 0 && input.heldoutAfter < input.heldoutBefore && identifier(input.incumbentAuthority) && input.incumbentAuthority === input.expectedAuthority && input.rollbackDigest !== input.candidateDigest;
 return Object.freeze({ eligible, reason: eligible ? "candidate-eligible-for-incumbent-review" : "candidate-promotion-evidence-insufficient", activated: false });
}
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }
