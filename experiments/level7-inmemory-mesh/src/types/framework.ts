/**
 * EXPERIMENT ONLY — types for the Level 7 in-memory mesh scaffold.
 * Not part of production Mahoraga control-plane contracts.
 */

export interface MutationEnvelope {
  targetNodeId: string;
  evolvedSource: string;
  generationTimestamp: number;
  notes?: string;
}

export interface EvaluatedModule {
  /** Hot-swappable entrypoint invoked by VolatileWorkspace. */
  execute: (payload: unknown) => unknown | Promise<unknown>;
  /** Optional extras from evaluated source. */
  [key: string]: unknown;
}

export interface VirtualFile {
  path: string;
  compiledBytes: (payload: unknown) => unknown | Promise<unknown>;
  rawText: string;
  entropyScore: number;
}

export interface DataTask {
  taskId: string;
  payload: unknown;
  timestamp: number;
}

export interface SnapshotRecord {
  nodeId: string;
  rawText: string;
  savedAt: number;
  path: string;
}
