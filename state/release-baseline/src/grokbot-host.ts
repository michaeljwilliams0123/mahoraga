import { createHash } from 'node:crypto';
import type { GrokbotContext } from './grokbot-cognition.ts';
// @ts-expect-error Existing governed JavaScript cognitive executor.
import { executeCognitiveCapability } from './cognitive-worker.mjs';

type Task = { id: string; capability: string; expectedSourceCommit?: string | null; capabilityInput?: Record<string, unknown> };
type Admission = { schemaVersion: 1; kind: 'grokbot-cognitive-admission'; taskDigest: string; context: GrokbotContext & {agentId: string} };
const capabilities = new Set(['cognitive.assess','cognitive.deliberate','cognitive.predict','cognitive.transfer','cognitive.cycle','cognitive.learn']);
const evaluatorVersion = 'grokbot-deterministic-v1';

/** Only the trusted supervisor calls this issuer, after the existing router admits the task. */
export function createGrokbotAdmission({task, authorityDecision, provenance}: {task: Task; authorityDecision: unknown; provenance: unknown}): Admission {
  const authority = record(authorityDecision), source = record(provenance);
  const provider = record(authority?.provider), owner = record(authority?.owner), request = record(authority?.request);
  if (!capabilities.has(task.capability) || authority?.kind !== 'authority-decision-v1' || authority.decision !== 'allow' || owner?.confirmationRequired !== false || request?.capability !== task.capability || provider?.id !== 'cognitive-core' || provider.costClass !== 'deterministic') fail('grokbot-host-authority-invalid');
  if (!source || source.state !== 'current' || typeof source.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(source.sourceCommit) || source.sourceCommit !== source.expectedSourceCommit || source.sourceCommit !== task.expectedSourceCommit) fail('grokbot-host-provenance-invalid');
  if (!task.id || !task.capabilityInput) fail('grokbot-host-task-invalid');
  const now = Date.now(), taskDigest = digestTask(task);
  const binding = {
    objectiveDigest: taskDigest, authorityDigest: digest(authority), sourceSha: source.sourceCommit,
    // This is the deterministic evaluator generation, not a sovereign core-promotion epoch.
    // No operational scope or new trust authority is created by this binding.
    trustEpoch: `${evaluatorVersion}:${source.sourceCommit}`,
    evaluatorFingerprint: digest({evaluatorVersion,sourceCommit:source.sourceCommit}),
    costClass:'deterministic',audience:'owner-only',securityBoundary:'unchanged',
  };
  return {
    schemaVersion:1,kind:'grokbot-cognitive-admission',taskDigest,
    context:{parentAgentId:'cognitive-core',agentId:`grokbot-${taskDigest.slice(0,24)}`,
      authorityBinding:{...binding,validUntil:new Date(now+15_000).toISOString()},
      currentBinding:{...binding,observedAt:new Date(now).toISOString()}},
  };
}

/** Admission comes from the separate parent IPC field, never from the task body. */
export async function executeAdmittedGrokbotCapability(capability: string, task: Task, value: unknown) {
  const admission = value as Admission | null;
  if (!capabilities.has(capability) || task.capability !== capability || !admission || admission.schemaVersion !== 1 || admission.kind !== 'grokbot-cognitive-admission' || admission.taskDigest !== digestTask(task) || admission.context?.authorityBinding?.objectiveDigest !== admission.taskDigest || admission.context.authorityBinding.sourceSha !== task.expectedSourceCommit || admission.context.parentAgentId !== 'cognitive-core' || admission.context.agentId !== `grokbot-${admission.taskDigest.slice(0,24)}`) fail('grokbot-admission-invalid');
  return executeCognitiveCapability(capability,task,{grokbot:admission.context});
}
function digestTask(task: Task) { return digest({id:task.id,capability:task.capability,input:task.capabilityInput}); }
function digest(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function fail(code: string): never { throw new TypeError(code); }
