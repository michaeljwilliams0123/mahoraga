import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ROOT } from "./config.mjs";

const execFileAsync = promisify(execFile);

// Read-only reconciliation evidence for the planner and unified workspace.
export async function observeWorldState({ manifest, database, supervisor }) {
  const tasks = database.listTasks(500);
  const activeLeases = tasks.filter((task) => ["running", "verifying"].includes(task.status)).map((task) => ({ id: task.id, workerId: task.assignedWorker, leaseExpiresAt: task.leaseExpiresAt, taskArea: task.taskArea }));
  const repository = await gitEvidence();
  return {
    observedAt: new Date().toISOString(),
    runtime: { host: manifest.runtime.host, port: manifest.runtime.port, ...supervisor.health() },
    workers: supervisor.status(), recordedWorkers: database.listWorkerState(), activeLeases,
    taskCounts: countBy(tasks, (task) => task.status), objectives: database.listObjectives(100),
    repository, browser: supervisor.status().find((worker) => worker.workerId === "browser") ?? null,
    providers: manifest.connections.map((connection) => ({ id: connection.id, state: connection.state, authenticationState: connection.authenticationState, capabilities: connection.capabilities, latencyMs: connection.latencyMs, error: connection.error })),
  };
}

async function gitEvidence() {
  try {
    const [head, remote] = await Promise.all([
      execFileAsync("git", ["-C", ROOT, "rev-parse", "HEAD"], { windowsHide: true, timeout: 5000 }),
      execFileAsync("git", ["-C", ROOT, "remote", "-v"], { windowsHide: true, timeout: 5000 }),
    ]);
    return { head: head.stdout.trim(), remotes: remote.stdout.trim() ? remote.stdout.trim().split(/\r?\n/) : [], verified: true };
  } catch { return { head: null, remotes: [], verified: false }; }
}

function countBy(values, selector) { return Object.fromEntries(values.reduce((result, value) => { const key = selector(value); result.set(key, (result.get(key) ?? 0) + 1); return result; }, new Map())); }
