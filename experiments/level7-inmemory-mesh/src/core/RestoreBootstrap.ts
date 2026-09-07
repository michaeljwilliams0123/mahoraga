/**
 * EXPERIMENT ONLY — hydrate VolatileWorkspace from on-disk snapshots.
 */
import * as fs from "fs/promises";
import * as path from "path";
import { VolatileWorkspaceEngine } from "./VolatileWorkspace";
import { MetamorphicCompilerPipeline } from "../metamorphic/CompilerPipeline";

export class RestoreBootstrap {
  private workspaceRef: VolatileWorkspaceEngine;
  private persistentDirectory: string;

  constructor(
    workspace: VolatileWorkspaceEngine,
    persistentDirectory: string = process.env.L7_SNAPSHOT_DIR || path.join(process.cwd(), "var", "snapshots")
  ) {
    this.workspaceRef = workspace;
    this.persistentDirectory = persistentDirectory;
  }

  /**
   * Scans physical storage on startup and reloads evolved logic into memory.
   */
  public async executeHydrationSequence(nodeId: string): Promise<boolean> {
    const targetFile = path.join(this.persistentDirectory, `${nodeId}_stable_bkp.ts`);

    try {
      await fs.access(targetFile);
      console.log(
        `[Bootstrap Hydration] Found verified snapshot for node [${nodeId}] on disk. Commencing memory restoration...`
      );
      const rawTextCode = await fs.readFile(targetFile, "utf-8");

      const compiledJs = MetamorphicCompilerPipeline.compileToMemory(rawTextCode);
      const instantiatedModule = MetamorphicCompilerPipeline.evaluateModule(compiledJs, nodeId);

      this.workspaceRef.mountInMemoryNode(nodeId, rawTextCode, instantiatedModule.execute);
      console.log(
        `[Bootstrap Success] Node [${nodeId}] successfully hydrated from persistent storage into memory grid.`
      );
      return true;
    } catch {
      console.log(
        `[Bootstrap Initial] No historical snapshots detected or file unreadable for [${nodeId}]. Initializing base templates.`
      );
      return false;
    }
  }
}
