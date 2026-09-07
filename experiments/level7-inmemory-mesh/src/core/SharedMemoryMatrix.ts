/**
 * EXPERIMENT ONLY — SharedArrayBuffer + Atomics mesh sync.
 * Workers are optional: set L7_WORKERS=0 (or numWorkers=0) to disable spawning
 * so smoke/unit runs do not fork-bomb when the entry script re-enters.
 */
import { Worker, isMainThread } from "worker_threads";
import * as path from "path";

export class SharedMemoryMatrix {
  private sharedBuffer: SharedArrayBuffer;
  private int32Array: Int32Array;
  private threadPool: Set<Worker> = new Set();

  constructor(numWorkers: number = 4) {
    this.sharedBuffer = new SharedArrayBuffer(1024);
    this.int32Array = new Int32Array(this.sharedBuffer);
    // Index 0 = active variant state flag
    this.int32Array[0] = 1;

    const envWorkers = process.env.L7_WORKERS;
    let effective = numWorkers;
    if (envWorkers !== undefined && envWorkers !== "") {
      const parsed = Number(envWorkers);
      if (!Number.isNaN(parsed)) {
        effective = Math.max(0, Math.floor(parsed));
      }
    }

    if (isMainThread && effective > 0) {
      this.spawnExecutionCluster(effective);
    } else if (isMainThread && effective === 0) {
      console.log("[Core Fabric] Workers disabled (L7_WORKERS=0 or numWorkers=0). Shared buffer remains local.");
    }
  }

  private spawnExecutionCluster(numWorkers: number): void {
    // Prefer compiled entry so workers share the same boot script.
    const scriptPath = path.join(__dirname, "..", "index.js");

    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker(scriptPath, {
        workerData: { sharedBuffer: this.sharedBuffer, threadId: i }
      });
      worker.on("error", (err) => {
        console.error(`[Core Fabric] Worker [${i}] error:`, err);
      });
      this.threadPool.add(worker);
      console.log(`[Core Fabric] Spawned parallel processing Worker Thread Context [${i}]`);
    }
  }

  public atomicSwapActiveVariant(variantIdx: number): void {
    Atomics.store(this.int32Array, 0, variantIdx);
    console.log(`[Atomics Lock] Broad-spectrum memory pointer shifted to Variant [${variantIdx}]`);
  }

  public getActiveVariantIndex(): number {
    return Atomics.load(this.int32Array, 0);
  }

  public getSharedBuffer(): SharedArrayBuffer {
    return this.sharedBuffer;
  }

  public async shutdown(): Promise<void> {
    const workers = Array.from(this.threadPool);
    this.threadPool.clear();
    await Promise.all(
      workers.map(
        (w) =>
          new Promise<void>((resolve) => {
            w.once("exit", () => resolve());
            void w.terminate();
          })
      )
    );
  }
}
