import type { CapabilityObservationState } from './capability-observer';

export type ExecutionStatusKind = 'offline' | 'reconnecting' | 'verifying' | 'provider-standby' | 'idle';
export type ExecutionStatus = { kind: ExecutionStatusKind; label: string; tone: 'red' | 'yellow' | 'amber' | 'green' };

/** Separates transport reachability from provider admission so a network blip never reads as provider degradation. */
export function deriveExecutionStatus(input: { connected: boolean; observation: CapabilityObservationState | null; assistantReady: boolean }): ExecutionStatus {
  const { connected, observation, assistantReady } = input;
  if (observation?.link === 'offline') return { kind: 'offline', label: 'Offline', tone: 'red' };
  if (observation?.link === 'reconnecting') return { kind: 'reconnecting', label: 'Reconnecting', tone: 'yellow' };
  if (!connected) return { kind: 'offline', label: 'Offline', tone: 'red' };
  if (observation === null || observation.phase === 'loading') return { kind: 'verifying', label: 'Verifying', tone: 'yellow' };
  if (!assistantReady) return { kind: 'provider-standby', label: 'Provider Standby', tone: 'amber' };
  return { kind: 'idle', label: 'Idle', tone: 'green' };
}
