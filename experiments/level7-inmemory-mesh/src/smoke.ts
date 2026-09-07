/**
 * EXPERIMENT ONLY — bounded L7_WORKERS=0 smoke:
 * mount → mutate (fail-closed verify) → checkpoint → restore → invoke.
 * Exits 0 on success, non-zero on failure. No infinite loops.
 */
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { VolatileWorkspaceEngine } from "./core/VolatileWorkspace";
import { PersistenceDaemon } from "./core/PersistenceDaemon";
import { RestoreBootstrap } from "./core/RestoreBootstrap";
import { DeepASTEngine } from "./metamorphic/DeepASTEngine";
import { MetamorphicCompilerPipeline } from "./metamorphic/CompilerPipeline";

const TARGET = "node_core_compute";
const BASELINE = `export const execute = async (n: any) => { return n * 2; };`;

async function fail(msg: string, code = 1): Promise<never> {
  console.error(`[smoke] FAIL: ${msg}`);
  process.exit(code);
}

async function main(): Promise<void> {
  process.env.L7_WORKERS = process.env.L7_WORKERS ?? "0";
  if (process.env.L7_WORKERS !== "0") {
    console.warn(`[smoke] forcing L7_WORKERS=0 (was ${process.env.L7_WORKERS})`);
    process.env.L7_WORKERS = "0";
  }

  const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), "l7-mesh-smoke-"));
  process.env.L7_SNAPSHOT_DIR = snapshotDir;

  console.log(`[smoke] L7_WORKERS=${process.env.L7_WORKERS} snapshotDir=${snapshotDir}`);

  const workspace = new VolatileWorkspaceEngine();
  const astEngine = new DeepASTEngine(TARGET);

  // 1) Mount baseline
  const initialJs = MetamorphicCompilerPipeline.compileToMemory(BASELINE);
  const initialModule = MetamorphicCompilerPipeline.evaluateModule(initialJs, TARGET);
  workspace.mountInMemoryNode(TARGET, BASELINE, initialModule.execute);
  const boot = await workspace.invokeMemoryPointer(TARGET, 21);
  if (boot !== 42) {
    await fail(`baseline invoke(21) expected 42, got ${String(boot)}`);
  }
  console.log(`[smoke] mount OK invoke(21)=${boot}`);

  // 2) One fail-closed mutation via DeepASTEngine + CompilerPipeline
  const currentText = workspace.readMemoryText(TARGET);
  const envelope = astEngine.compileDeepOptimizations(currentText);
  const compiled = MetamorphicCompilerPipeline.compileToMemory(envelope.evolvedSource);
  const moduleInst = MetamorphicCompilerPipeline.evaluateModule(compiled, TARGET);
  const mutatedOut = await workspace.mountVerifiedVariant(
    TARGET,
    envelope.evolvedSource,
    moduleInst.execute,
    50
  );
  console.log(`[smoke] mutate+verify OK invoke(50)=${mutatedOut}`);

  const afterMutate = await workspace.invokeMemoryPointer(TARGET, 7);
  if (afterMutate !== 14) {
    await fail(`post-mutate invoke(7) expected 14, got ${String(afterMutate)}`);
  }

  // 3) Checkpoint
  const daemon = new PersistenceDaemon(workspace, 60_000, snapshotDir);
  await daemon.checkpointOnce();
  const snapPath = path.join(snapshotDir, `${TARGET}_stable_bkp.ts`);
  await fs.access(snapPath);
  console.log(`[smoke] checkpoint OK ${snapPath}`);

  // 4) Clear + restore via RestoreBootstrap
  workspace.clearAllMounts();
  try {
    await workspace.invokeMemoryPointer(TARGET, 1);
    await fail("expected invoke to fail after clearAllMounts");
  } catch {
    console.log("[smoke] clearAllMounts OK (pointer null as expected)");
  }

  const restore = new RestoreBootstrap(workspace, snapshotDir);
  const hydrated = await restore.executeHydrationSequence(TARGET);
  if (!hydrated) {
    await fail("RestoreBootstrap.executeHydrationSequence returned false");
  }

  const restored = await workspace.invokeMemoryPointer(TARGET, 21);
  if (restored !== 42) {
    await fail(`restored invoke(21) expected 42, got ${String(restored)}`);
  }
  console.log(`[smoke] restore OK invoke(21)=${restored}`);

  try {
    await fs.rm(snapshotDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  console.log("[smoke] PASS mount → mutate → checkpoint → restore");
  process.exit(0);
}

main().catch((err) => {
  console.error("[smoke] FAIL: uncaught", err);
  process.exit(1);
});
