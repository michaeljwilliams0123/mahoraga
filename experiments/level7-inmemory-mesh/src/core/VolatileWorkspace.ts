/**
 * EXPERIMENT ONLY — in-memory virtual file / function-pointer workspace.
 */
import type { VirtualFile } from "../types/framework";

export class VolatileWorkspaceEngine {
  private memoryFileSystem: Map<string, VirtualFile> = new Map();

  /**
   * Registers an executable code variant into active process memory.
   * Bypasses physical disk I/O for the live pointer (snapshots are separate).
   */
  public mountInMemoryNode(
    nodeId: string,
    sourceCode: string,
    executableContext: (payload: unknown) => unknown | Promise<unknown>
  ): void {
    this.memoryFileSystem.set(nodeId, {
      path: `mem://sys/nodes/${nodeId}.vm`,
      compiledBytes: executableContext,
      rawText: sourceCode,
      entropyScore: 0.0
    });
    console.log(`[Volatile Fabric] Node [${nodeId}] mounted directly to V8 memory pointer.`);
  }

  /** Shallow-copy the live VirtualFile so a failed mutate can remount prior state. */
  public snapshotVirtualFile(nodeId: string): VirtualFile | undefined {
    const file = this.memoryFileSystem.get(nodeId);
    if (!file) return undefined;
    return {
      path: file.path,
      compiledBytes: file.compiledBytes,
      rawText: file.rawText,
      entropyScore: file.entropyScore
    };
  }

  /** Restore a previously snapshotted VirtualFile (fail-closed remount). */
  public remountVirtualFile(nodeId: string, prior: VirtualFile): void {
    this.memoryFileSystem.set(nodeId, {
      path: prior.path,
      compiledBytes: prior.compiledBytes,
      rawText: prior.rawText,
      entropyScore: prior.entropyScore
    });
    console.log(
      `[Volatile Fabric] Node [${nodeId}] remounted prior verified pointer (fail-closed restore).`
    );
  }

  /**
   * Fail-closed hot-swap: invoke-verify the candidate BEFORE replacing the live
   * pointer. Prior good mount stays mounted until verification succeeds.
   * Returns the verification output on success.
   */
  public async mountVerifiedVariant(
    nodeId: string,
    sourceCode: string,
    executableContext: (payload: unknown) => unknown | Promise<unknown>,
    verifyPayload: unknown = 50
  ): Promise<unknown> {
    const prior = this.snapshotVirtualFile(nodeId);
    // Verify candidate off-pointer first so a bad execute never becomes live.
    let evaluationOutput: unknown;
    try {
      evaluationOutput = await executableContext(verifyPayload);
    } catch (err) {
      if (prior) {
        this.remountVirtualFile(nodeId, prior);
      }
      throw err;
    }
    // Only swap the live pointer after successful verify.
    this.mountInMemoryNode(nodeId, sourceCode, executableContext);
    return evaluationOutput;
  }

  public readMemoryText(nodeId: string): string {
    const file = this.memoryFileSystem.get(nodeId);
    if (!file) {
      return `export const execute = async (input: any) => { return input; };`;
    }
    return file.rawText;
  }

  public async invokeMemoryPointer(nodeId: string, payload: unknown): Promise<unknown> {
    const activePointer = this.memoryFileSystem.get(nodeId);
    if (!activePointer) {
      throw new Error(`Memory Routing Fault: Pointer target [${nodeId}] is null or unallocated.`);
    }
    return activePointer.compiledBytes(payload);
  }

  /** Drop all mounts (used by smoke restore path before re-hydrate). */
  public clearAllMounts(): void {
    this.memoryFileSystem.clear();
  }

  /** Snapshot helpers used by PersistenceDaemon. */
  public listNodeIds(): string[] {
    return Array.from(this.memoryFileSystem.keys());
  }

  public getVirtualFile(nodeId: string): VirtualFile | undefined {
    return this.memoryFileSystem.get(nodeId);
  }
}

/** Alias matching architecture paste naming. */
export { VolatileWorkspaceEngine as VolatileWorkspace };
