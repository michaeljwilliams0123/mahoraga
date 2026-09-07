/**
 * EXPERIMENT ONLY — non-blocking snapshot of volatile rawText to local disk.
 * Default directory: ./var/snapshots (configurable via L7_SNAPSHOT_DIR).
 */
import * as fs from "fs/promises";
import * as path from "path";
import type { VolatileWorkspaceEngine } from "./VolatileWorkspace";

export class PersistenceDaemon {
  private workspaceRef: VolatileWorkspaceEngine;
  private intervalMs: number;
  private persistentDirectory: string;
  private timer: NodeJS.Timeout | null = null;
  private writing = false;

  constructor(
    workspace: VolatileWorkspaceEngine,
    intervalMs: number = 15_000,
    persistentDirectory: string = process.env.L7_SNAPSHOT_DIR || path.join(process.cwd(), "var", "snapshots")
  ) {
    this.workspaceRef = workspace;
    this.intervalMs = intervalMs;
    this.persistentDirectory = persistentDirectory;
  }

  public getSnapshotDirectory(): string {
    return this.persistentDirectory;
  }

  public startSnapshotingLoop(): void {
    void this.ensureDir();
    if (this.timer) {
      return;
    }
    console.log(
      `[PersistenceDaemon] Non-blocking snapshot loop every ${this.intervalMs}ms -> ${this.persistentDirectory}`
    );
    this.timer = setInterval(() => {
      void this.checkpointOnce();
    }, this.intervalMs);
    // Do not keep the process alive solely for snapshots during short smokes.
    this.timer.unref?.();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.persistentDirectory, { recursive: true });
  }

  public async checkpointOnce(): Promise<void> {
    if (this.writing) {
      return;
    }
    this.writing = true;
    try {
      await this.ensureDir();
      for (const nodeId of this.workspaceRef.listNodeIds()) {
        const file = this.workspaceRef.getVirtualFile(nodeId);
        if (!file) continue;
        const target = path.join(this.persistentDirectory, `${nodeId}_stable_bkp.ts`);
        const header = `// L7 snapshot ${new Date().toISOString()} node=${nodeId}\n`;
        const tmp = `${target}.tmp`;
        await fs.writeFile(tmp, header + file.rawText + "\n", "utf-8");
        await fs.rename(tmp, target);
      }
      console.log(
        `[PersistenceDaemon] Snapshot checkpoint complete (${this.workspaceRef.listNodeIds().length} node(s)).`
      );
    } catch (err) {
      console.error("[PersistenceDaemon] Snapshot failed:", err);
    } finally {
      this.writing = false;
    }
  }
}
