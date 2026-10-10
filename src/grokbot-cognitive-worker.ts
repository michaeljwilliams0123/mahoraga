import { parentPort, threadId, workerData } from 'node:worker_threads';
// @ts-expect-error Existing governed JavaScript cognitive executor.
import { executeCognitiveCapability } from './cognitive-worker.mjs';

if (!parentPort || threadId < 1) throw new Error('grokbot-worker-thread-required');
// Only the parent's allowlisted cognitive input crosses this fixed entry point.
// No authority grants, host environment, task envelope, or nested delegation.
const result = await executeCognitiveCapability(workerData.assignment.capability, { capabilityInput: workerData.assignment.input });
parentPort.postMessage({ jobId: workerData.jobId, threadId, result });
