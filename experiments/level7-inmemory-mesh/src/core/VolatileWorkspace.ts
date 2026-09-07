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
