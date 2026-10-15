export type RuntimeObservation = Readonly<{
  host: string; sourceSha: string; authoritySha: string;
  healthy: boolean; stateCompatible: boolean;
}>;
export type ActivationContext = Readonly<{
  confirmedHost: string; targetSha: string; incumbentSha: string;
}>;
export type Checkpoint = Readonly<{
  id: string; host: string; sourceSha: string;
}>;
/**
 * Port for a future trusted Windows adapter. Resolving an operation promises that
 * its postconditions were independently verified; an attempted operation is not
 * enough. No production adapter or automatic entry point is installed here.
 */
export interface WindowsActivationAdapter {
  observeHost(): Promise<{ platform: string; host: string }>;
  authoritativeMain(): Promise<string>;
  observeProduction(): Promise<RuntimeObservation>;
  checkpoint(): Promise<Checkpoint>;
  verifyCheckpoint(checkpoint: Checkpoint): Promise<void>;
  rehearseRollback(checkpoint: Checkpoint): Promise<void>;
  stageCandidate(targetSha: string): Promise<void>;
  observeCandidate(): Promise<RuntimeObservation>;
  // Must authenticate and validate the canonical sovereign receipt against the
  // observed incumbent epoch, including independent verification, exact-head CI,
  // state compatibility and canary. Never use candidate rules to grant admission.
  admitWithIncumbent(context: ActivationContext, checkpoint: Checkpoint): Promise<void>;
  promote(targetSha: string): Promise<void>;
  restoreProduction(checkpoint: Checkpoint): Promise<void>;
  stopCandidate(): Promise<void>;
}
export type ActivationResult = Readonly<{
  state: 'activated' | 'held' | 'rolled-back' | 'rollback-failed';
  reason: string | null; checkpointId: string | null;
  candidateStopped: boolean;
}>;
class GateError extends Error {}
function requireGate(ok: boolean, reason: string): asserts ok {
  if (!ok) throw new GateError(reason);
}
function runtimeMatches(o: RuntimeObservation, host: string, source: string, authority: string) {
  return o.host === host && o.sourceSha === source && o.authoritySha === authority
    && o.healthy === true && o.stateCompatible === true;
}
/** Does not install a scheduled task, invoke models, mint admission or retry a mutation. */
export async function activateWindowsCandidate(
  c: ActivationContext, a: WindowsActivationAdapter,
): Promise<ActivationResult> {
  let checkpoint: Checkpoint | null = null;
  let productionMutationStarted = false;
  let candidateTouched = false;
  let outcome: ActivationResult;
  try {
    requireGate(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(c.confirmedHost)
      && /^[a-f0-9]{40}$/.test(c.targetSha) && /^[a-f0-9]{40}$/.test(c.incumbentSha), 'activation-context-invalid');
    const device = await a.observeHost();
    requireGate(device.platform === 'win32' && device.host === c.confirmedHost, 'target-device-mismatch');
    requireGate(await a.authoritativeMain() === c.targetSha, 'target-main-drift');
    const before = await a.observeProduction();
    requireGate(runtimeMatches(before, c.confirmedHost, c.incumbentSha, c.targetSha), 'incumbent-observation-invalid');
    const proposedCheckpoint = await a.checkpoint();
    requireGate(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(proposedCheckpoint.id)
      && proposedCheckpoint.host === c.confirmedHost && proposedCheckpoint.sourceSha === c.incumbentSha, 'checkpoint-binding-invalid');
    // Only validated, content-free checkpoint identifiers may enter public results.
    checkpoint = proposedCheckpoint;
    await a.verifyCheckpoint(checkpoint);
    await a.rehearseRollback(checkpoint);
    candidateTouched = true; // stage may partially start a candidate before throwing.
    await a.stageCandidate(c.targetSha);
    requireGate(runtimeMatches(await a.observeCandidate(), c.confirmedHost, c.targetSha, c.targetSha), 'candidate-canary-invalid');
    await a.admitWithIncumbent(c, checkpoint);
    // Re-observe authority, device and incumbent immediately before mutation.
    requireGate(await a.authoritativeMain() === c.targetSha, 'target-main-drift');
    const finalDevice = await a.observeHost();
    requireGate(finalDevice.platform === 'win32' && finalDevice.host === c.confirmedHost, 'target-device-mismatch');
    requireGate(runtimeMatches(await a.observeProduction(), c.confirmedHost, c.incumbentSha, c.targetSha), 'incumbent-drift');
    productionMutationStarted = true; // A rejected/timeout promotion may already have stopped 4782.
    await a.promote(c.targetSha);
    requireGate(runtimeMatches(await a.observeProduction(), c.confirmedHost, c.targetSha, c.targetSha), 'production-canary-invalid');
    outcome = { state: 'activated', reason: null, checkpointId: checkpoint.id, candidateStopped: false };
  } catch (error) {
    const reason = error instanceof GateError ? error.message : 'activation-operation-failed';
    if (productionMutationStarted && checkpoint) {
      try {
        await a.restoreProduction(checkpoint);
        requireGate(runtimeMatches(await a.observeProduction(), c.confirmedHost, c.incumbentSha, c.targetSha), 'rollback-canary-invalid');
        outcome = { state: 'rolled-back', reason, checkpointId: checkpoint.id, candidateStopped: false };
      } catch {
        outcome = { state: 'rollback-failed', reason: 'production-restore-unverified', checkpointId: checkpoint.id, candidateStopped: false };
      }
    } else {
      outcome = { state: 'held', reason, checkpointId: checkpoint?.id ?? null, candidateStopped: false };
    }
  }
  if (candidateTouched) {
    try { await a.stopCandidate(); outcome = { ...outcome, candidateStopped: true }; }
    catch { outcome = { ...outcome, reason: outcome.reason ?? 'candidate-teardown-unverified', candidateStopped: false }; }
  }
  return Object.freeze(outcome);
}
export function activationCompleted(result: ActivationResult): boolean {
  return result.state === 'activated' && result.reason === null && result.candidateStopped === true;
}
