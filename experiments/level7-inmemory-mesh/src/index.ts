/**
 * EXPERIMENT ONLY — Level 7 in-memory mesh unified boot loop.
 * Not production Mahoraga. See ../README.md and ../OVERRIDE.md.
 */
import { isMainThread, workerData } from "worker_threads";
import { VolatileWorkspaceEngine } from "./core/VolatileWorkspace";
import { DeepASTEngine } from "./metamorphic/DeepASTEngine";
import { MetamorphicCompilerPipeline } from "./metamorphic/CompilerPipeline";
import { SharedMemoryMatrix } from "./core/SharedMemoryMatrix";
import { PersistenceDaemon } from "./core/PersistenceDaemon";
import { RestoreBootstrap } from "./core/RestoreBootstrap";
import { TaskStreamQueue } from "./core/TaskStreamQueue";
import { MetricsRegistry } from "./core/MetricsRegistry";

const MUTATION_MS = Number(process.env.L7_MUTATION_MS || 10_000);
const INGEST_MS = Number(process.env.L7_INGEST_MS || 250);
const DRAIN_MS = Number(process.env.L7_DRAIN_MS || 50);
const SNAPSHOT_MS = Number(process.env.L7_SNAPSHOT_MS || 15_000);
const WORKER_POLL_MS = Number(process.env.L7_WORKER_POLL_MS || 1_000);

/** Keep ref so the experiment process stays alive until signal/timeout. */
function armInterval(fn: () => void, ms: number): NodeJS.Timeout {
  return setInterval(fn, ms);
}

async function executeMetamorphicRuntime(): Promise<void> {
  const targetNodeId = "node_core_compute";

  if (isMainThread) {
    console.log("=== Launching Level 7 Highly Autonomous Multi-Threaded Mesh (EXPERIMENT) ===");
    console.log(`[L7] L7_WORKERS=${process.env.L7_WORKERS ?? "(default)"} cwd=${process.cwd()}`);

    const workspace = new VolatileWorkspaceEngine();
    const astEngine = new DeepASTEngine(targetNodeId);
    const requestedWorkers = Number(process.env.L7_WORKERS ?? "0");
    const threadSyncMatrix = new SharedMemoryMatrix(
      Number.isFinite(requestedWorkers) ? requestedWorkers : 0
    );
    const taskQueue = new TaskStreamQueue();
    const metrics = new MetricsRegistry();
    metrics.setActiveVariant(threadSyncMatrix.getActiveVariantIndex());

    // 1. Crash Recovery Layer
    const recoveryEngine = new RestoreBootstrap(workspace);
    const systemHydrated = await recoveryEngine.executeHydrationSequence(targetNodeId);

    if (!systemHydrated) {
      const baselineCode = `export const execute = async (n: any) => { return n * 2; };`;
      const initialJs = MetamorphicCompilerPipeline.compileToMemory(baselineCode);
      const initialModule = MetamorphicCompilerPipeline.evaluateModule(initialJs, targetNodeId);
      workspace.mountInMemoryNode(targetNodeId, baselineCode, initialModule.execute);
      console.log("[L7] Baseline node_core_compute mounted (n => n * 2).");
    }

    // Quick self-check so smoke logs prove invoke works.
    const smokeOut = await workspace.invokeMemoryPointer(targetNodeId, 21);
    console.log(`[L7] Boot self-check invoke(21) => ${smokeOut}`);

    // 2. Non-blocking persistence
    const backupDaemon = new PersistenceDaemon(workspace, SNAPSHOT_MS);
    backupDaemon.startSnapshotingLoop();
    // Immediate first checkpoint for observability during short smokes
    await backupDaemon.checkpointOnce();
    metrics.setSnapshotCount(workspace.listNodeIds().length);

    // 3. Mock telemetry ingestion
    armInterval(() => {
      const generatedMockPayload = Math.floor(Math.random() * 100);
      taskQueue.pushTaskStream(generatedMockPayload);
      metrics.setQueueDepth(taskQueue.getQueueDepth());
    }, INGEST_MS);

    // 4. Autonomous metamorphic optimization cycle (fail-closed: verify before swap)
    let mutationIndex = 1;
    armInterval(() => {
      void (async () => {
        mutationIndex += 1;
        console.log("\n[Optimization Pulse] Inspecting active memory V8 pointer state...");
        const currentText = workspace.readMemoryText(targetNodeId);
        const optimizationEnvelope = astEngine.compileDeepOptimizations(currentText);
        try {
          const compiled = MetamorphicCompilerPipeline.compileToMemory(
            optimizationEnvelope.evolvedSource
          );
          const moduleInst = MetamorphicCompilerPipeline.evaluateModule(compiled, targetNodeId);
          // Keep prior good mount until candidate verifies; only then swap.
          const evaluationOutput = await workspace.mountVerifiedVariant(
            targetNodeId,
            optimizationEnvelope.evolvedSource,
            moduleInst.execute,
            50
          );
          threadSyncMatrix.atomicSwapActiveVariant(mutationIndex);
          metrics.setActiveVariant(mutationIndex);
          metrics.incMutationOk();
          console.log(
            `[Verification Success] Fail-closed swap committed; invoke(50) => ${evaluationOutput}`
          );
        } catch (err) {
          metrics.incMutationFail();
          console.error(
            "[Mutation Dropped] Verify failed — prior good pointer kept (fail-closed, no live swap).",
            err
          );
        }
      })();
    }, MUTATION_MS);

    // 5. Task stream drain
    armInterval(() => {
      void (async () => {
        const nextJob = taskQueue.pullNextAvailableTask();
        if (!nextJob) return;
        try {
          const result = await workspace.invokeMemoryPointer(targetNodeId, nextJob.payload);
          console.log(
            `[Stream Processor] Handled task [${nextJob.taskId}] -> Input: ${nextJob.payload} | Output: ${result}`
          );
        } catch {
          console.error(`[Execution Fault] Task [${nextJob.taskId}] failed inside sandboxed pointer.`);
        } finally {
          taskQueue.markTaskComplete();
          metrics.setQueueDepth(taskQueue.getQueueDepth());
        }
      })();
    }, DRAIN_MS);

    // 6. Periodic metrics flush / log of contracted names
    armInterval(() => {
      metrics.setQueueDepth(taskQueue.getQueueDepth());
      metrics.setActiveVariant(threadSyncMatrix.getActiveVariantIndex());
      metrics.setSnapshotCount(workspace.listNodeIds().length);
      console.log(`[L7 Metrics] ${JSON.stringify(metrics.snapshot())}`);
    }, Math.max(SNAPSHOT_MS, 5_000));

    console.log(
      `[L7] Mesh loops armed (mutation=${MUTATION_MS}ms ingest=${INGEST_MS}ms drain=${DRAIN_MS}ms snapshot=${SNAPSHOT_MS}ms).`
    );
    console.log("[L7] EXPERIMENT boot complete — runtime is volatile; Ctrl+C or timeout to stop.");
  } else {
    const shared = workerData?.sharedBuffer as SharedArrayBuffer | undefined;
    if (!shared) {
      console.error("[L7 Worker] Missing sharedBuffer in workerData");
      return;
    }
    const sharedArray = new Int32Array(shared);
    const threadId = workerData?.threadId;
    console.log(`[L7 Worker ${threadId}] monitoring Atomics variant flag`);
    armInterval(() => {
      const activeVariantId = Atomics.load(sharedArray, 0);
      console.log(`[L7 Worker ${threadId}] activeVariant=${activeVariantId}`);
    }, WORKER_POLL_MS);
  }
}

executeMetamorphicRuntime().catch((criticalFailure) => {
  console.error("[CRITICAL KERNEL FAULT] Metamorphic mesh engine failed:", criticalFailure);
  process.exit(1);
});
