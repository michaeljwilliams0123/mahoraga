import { isMainThread, parentPort, workerData, threadId } from "node:worker_threads";
import { executeCloneJob } from "./cognitive-mitosis.ts";

if (!isMainThread && parentPort) {
  parentPort.postMessage(executeCloneJob(workerData, threadId));
  parentPort.close();
}
