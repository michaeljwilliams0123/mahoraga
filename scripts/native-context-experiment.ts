import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { trainNativeContextModel, predictNativeContextToken, loadNativeContextCheckpoint } from '../src/native-context-model.ts';

/** Hand-authored synthetic qualification only. No provider calls, runtime registration or promotion. */
export function runNativeContextQualification(trainingCodeSha: string) {
 if (!/^[a-f0-9]{40}$/.test(trainingCodeSha)) throw new Error('context-experiment-source-invalid');
 const rightsEvidenceDigest = createHash('sha256').update('Mahoraga hand-authored synthetic selective recall task, version 1').digest('hex');
 const samples = (pairs: string[], split: string) => ['a','b'].flatMap(first => pairs.map((pair, i) => ({sourceId: `${split}-${first}-${i}`, text: first + pair + first, rights: 'owner-authorized' as const, rightsEvidenceDigest})));
 const training = samples(['cc','dd','ee','cd','dc'], 'train'), evaluation = samples(['ce','ec','de','ed'], 'heldout');
 const lastTokenGroups = new Map<string, Map<string, number>>();
 for (const sample of evaluation) {
  const last = sample.text.at(-2)!, target = sample.text.at(-1)!, group = lastTokenGroups.get(last) ?? new Map<string, number>();
  group.set(target, (group.get(target) ?? 0) + 1); lastTokenGroups.set(last, group);
 }
 const oneTokenAccuracyCeiling = [...lastTokenGroups.values()].reduce((n, group) => n + Math.max(...group.values()), 0) / evaluation.length;
 const runs = [7,42,1337].map(seed => {
  const run = trainNativeContextModel({modelId: 'mahoraga-context-recall', seed, epochs: 100, learningRate: 0.08, contextLength: 3, embeddingSize: 8, hiddenSize: 16, trainingCodeSha, training, evaluation});
  const restored = loadNativeContextCheckpoint(JSON.stringify(run.checkpoint));
  const predictions = evaluation.map(sample => predictNativeContextToken(restored, sample.text.slice(0,-1)));
  const heldoutAccuracy = predictions.filter((value, i) => value.token === evaluation[i]!.text.at(-1)).length / evaluation.length;
  const saveLoadEqual = evaluation.every((sample, i) => JSON.stringify(predictions[i]) === JSON.stringify(predictNativeContextToken(run.checkpoint, sample.text.slice(0,-1))));
  const qualified = heldoutAccuracy === 1 && heldoutAccuracy > oneTokenAccuracyCeiling && run.metrics.heldoutAfter < run.metrics.heldoutBefore && saveLoadEqual;
  return {seed, qualified, heldoutAccuracy, ...run.metrics, checkpointDigest: restored.fingerprint, parameterCount: restored.weights.length,
   saveLoadEqual, meanFirstPositionAttention: predictions.reduce((sum, value) => sum + value.attention[0]!, 0) / predictions.length};
 });
 return {schemaVersion: 1, status: runs.every(run => run.qualified) ? 'qualified-experiment' : 'experiment-failed',
  task: 'synthetic-selective-recall-heldout-recombination-v1', architectureVersion: 'single-head-causal-context-v1', sourceSha: trainingCodeSha,
  trainingExamples: training.length, heldoutExamples: evaluation.length, oneTokenAccuracyCeiling, runs,
  creditCost: 0, providerInvocations: 0, productionActivated: false, executionAuthorityGranted: false,
  limitations: ['three-token synthetic task only', 'held-out recombinations share the taught recall rule', 'not independent general-intelligence evaluation', 'no production inference or promotion']};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
 try {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const git = (args: string[]) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','ignore']}).trim();
  git(['ls-files','--error-unmatch','src/native-context-model.ts','scripts/native-context-experiment.ts','model-foundry/contracts/context-checkpoint.schema.json']);
  if (git(['status','--porcelain','--untracked-files=no'])) throw new Error('context-experiment-clean-source-required');
  const result = runNativeContextQualification(git(['rev-parse','HEAD']));
  console.log(JSON.stringify(result,null,2));
  if (result.status !== 'qualified-experiment') process.exitCode = 1;
 } catch { console.error('context-experiment-source-or-qualification-unverified'); process.exitCode = 1; }
}
