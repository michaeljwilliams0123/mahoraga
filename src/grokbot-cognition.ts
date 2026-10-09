import { createHash, randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
// @ts-expect-error Existing governed JavaScript authority contract.
import { resolveBotOperationalAuthority } from './owner-authority.mjs';

type Binding = { objectiveDigest: string; authorityDigest: string; sourceSha: string; trustEpoch: string; evaluatorFingerprint: string; costClass: string; audience: string; securityBoundary: string };
/** Trusted host evidence, never read from capabilityInput or a remote task. */
export type GrokbotContext = { parentAgentId: string; authorityBinding: Binding & { validUntil: string }; currentBinding: Binding & { observedAt: string } };
export type GrokbotAssignment = { agentId: string; capability: string; input: Record<string, unknown> };
type Options = { signal?: AbortSignal; timeoutMs?: number; maximumParallel?: number };
export type ChildReceipt = { agentId: string; parentAgentId: string; capability: string; duty: string; threadId: number; inputDigest: string; result: Record<string, unknown>; fingerprint: string };
const routes: Record<string, { duty: string; fields: string[] }> = {
  'cognitive.assess': { duty: 'assurance', fields: ['metacognition'] },
  'cognitive.deliberate': { duty: 'coordinator', fields: ['positions'] },
  'cognitive.predict': { duty: 'coordinator', fields: ['counterfactual'] },
  'cognitive.transfer': { duty: 'assurance', fields: ['transfer'] },
  'cognitive.cycle': { duty: 'coordinator', fields: ['cognitiveInput'] },
  'cognitive.learn': { duty: 'assurance', fields: ['learningInput'] },
};
const slug = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Fixed deterministic cognitive workers, not model providers or operational/tool agents. */
export async function executeGrokbotCollective(assignments: readonly GrokbotAssignment[], context: GrokbotContext, options: Options = {}) {
  const parallel = options.maximumParallel ?? 2, timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(parallel) || parallel < 1 || parallel > 4 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) fail('grokbot-limits-invalid');
  if (!context || !slug.test(context.parentAgentId)) fail('grokbot-context-invalid');
  if (!Array.isArray(assignments) || assignments.length < 1 || assignments.length > 4 || new Set(assignments.map(a => a?.agentId)).size !== assignments.length) fail('grokbot-assignments-invalid');
  const snapshot = structuredClone(assignments), trusted = structuredClone(context);
  // Validate the whole wave before launching any worker; no caller-selected entry points.
  for (const assignment of snapshot) {
    if (!assignment || !slug.test(assignment.agentId) || assignment.agentId === trusted.parentAgentId || Object.keys(assignment).sort().join(',') !== 'agentId,capability,input') fail('grokbot-assignments-invalid');
    const route = Object.hasOwn(routes, assignment.capability) ? routes[assignment.capability] : undefined;
    if (!route) fail('grokbot-capability-invalid');
    if (!assignment.input || Array.isArray(assignment.input) || Object.keys(assignment.input).some(key => !route.fields.includes(key))) fail('grokbot-input-fields-invalid');
    jsonState(assignment.input);
    if (Buffer.byteLength(JSON.stringify(assignment.input)) > 262_144) fail('grokbot-input-too-large');
    authorize(assignment, trusted);
  }
  if (options.signal?.aborted) fail('grokbot-cancelled');
  const controller = new AbortController(), abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const children: ChildReceipt[] = [];
  const deadline = Date.now() + timeoutMs;
  try {
    for (let offset = 0; offset < snapshot.length; offset += parallel) {
      const outcomes = await Promise.allSettled(snapshot.slice(offset, offset + parallel).map(async assignment => {
        try {
          authorize(assignment, trusted);
          const remaining = deadline - Date.now();
          if (remaining <= 0) fail('grokbot-timeout');
          return await runChild(assignment, trusted, remaining, controller.signal);
        } catch (error) { controller.abort(); throw error; }
      }));
      const failure = outcomes.find(outcome => outcome.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      for (const outcome of outcomes) if (outcome.status === 'fulfilled') children.push(outcome.value);
    }
    const core = { kind: 'grokbot-cognitive-collective', schemaVersion: 1, parentAgentId: trusted.parentAgentId, children, cleanedUp: true, modelInvocations: 0, creditCost: 0, paidFallback: false, truthDomain: 'verification' };
    return freeze({ ...core, fingerprint: digest(core) });
  } finally { controller.abort(); options.signal?.removeEventListener('abort', abort); }
}
function authorize(assignment: GrokbotAssignment, context: GrokbotContext) {
  if (context.currentBinding.costClass !== 'deterministic') fail('grokbot-cost-class-invalid');
  const observation = Date.parse(context.currentBinding.observedAt);
  if (!Number.isFinite(observation) || Date.now() - observation > 60_000) fail('grokbot-observation-stale');
  const decision = resolveBotOperationalAuthority({
    bot: { agentId: assignment.agentId, ownerApprovalRequired: false, platformAuthorizationRequired: true },
    requestedScope: null, capabilityScopes: [], platformScopes: [],
    authorityBinding: context.authorityBinding, currentBinding: context.currentBinding,
  });
  if (!decision.authorized || !decision.driftVerified || decision.confirmationRequired) fail(decision.reason ?? 'grokbot-authority-denied');
}
async function runChild(assignment: GrokbotAssignment, context: GrokbotContext, timeoutMs: number, signal: AbortSignal): Promise<ChildReceipt> {
  if (signal.aborted) fail('grokbot-cancelled');
  const jobId = randomUUID(), inputDigest = digest(assignment.input);
  const worker = new Worker(new URL('./grokbot-cognitive-worker.ts', import.meta.url), {
    workerData: { jobId, assignment }, env: {}, execArgv: [], stdout: true, stderr: true,
    resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
  });
  worker.stdout.resume(); worker.stderr.resume();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await new Promise<ChildReceipt>((resolve, reject) => {
      abort = () => reject(new Error('grokbot-cancelled'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      timer = setTimeout(() => reject(new Error('grokbot-timeout')), timeoutMs);
      worker.once('error', () => reject(new Error('grokbot-worker-failed')));
      worker.once('exit', () => reject(new Error('grokbot-worker-exited-without-result')));
      worker.once('message', raw => {
        try {
          if (!raw || raw.jobId !== jobId || raw.threadId !== worker.threadId || raw.result?.verified !== true) fail('grokbot-result-invalid');
          authorize(assignment, context); // Expiry during execution invalidates the result too.
          const core = { agentId: assignment.agentId, parentAgentId: context.parentAgentId, capability: assignment.capability, duty: routes[assignment.capability]!.duty, threadId: raw.threadId as number, inputDigest, result: raw.result as Record<string, unknown> };
          resolve({ ...core, fingerprint: digest(core) });
        } catch (error) { reject(error); }
      });
    });
  } finally { clearTimeout(timer); if (abort) signal.removeEventListener('abort', abort); await worker.terminate(); }
}
function jsonState(value: unknown, depth = 0, seen = new Set<object>()): void {
  if (depth > 32) fail('grokbot-state-invalid');
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return;
  if (!value || typeof value !== 'object' || seen.has(value) || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) fail('grokbot-state-invalid');
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (/^(credentials?|secrets?|tokens?|authorization|password|clientsecret|connectionstring|executable|execargv|env)$/i.test(key.replace(/[_-]/g, ''))) fail('grokbot-sensitive-state');
    jsonState(child, depth + 1, seen);
  }
  seen.delete(value);
}
function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }
function fail(code: string): never { throw new TypeError(code); }
