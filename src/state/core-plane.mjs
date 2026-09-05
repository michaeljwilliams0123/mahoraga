import { randomUUID } from "node:crypto";

export function createAdminCognitivePlane({
  port,
  stateStore,
  telemetryRegistry,
  contentVault,
  snapshot = async () => ({ workers: [], tasks: [], driftRisk: "STABLE" }),
  intervalMs = 3_000,
  now = () => Date.now(),
} = {}) {
  if (port !== 4783) throw new TypeError("uccp-candidate-port-required");
  if (!stateStore || typeof stateStore.recordLease !== "function" || typeof stateStore.health !== "function") throw new TypeError("uccp-state-store-required");
  if (!telemetryRegistry || typeof telemetryRegistry.update !== "function") throw new TypeError("uccp-telemetry-registry-required");
  if (!contentVault || typeof contentVault.put !== "function" || typeof contentVault.metadata !== "function" || typeof contentVault.remove !== "function") throw new TypeError("uccp-content-vault-required");
  if (typeof snapshot !== "function") throw new TypeError("uccp-snapshot-required");
  if (!Number.isInteger(intervalMs) || intervalMs < 500) throw new TypeError("uccp-interval-invalid");

  let timer = null;
  let running = false;

  const cycle = async () => {
    const observed = await snapshot();
    const workers = Array.isArray(observed?.workers) ? observed.workers : [];
    const tasks = Array.isArray(observed?.tasks) ? observed.tasks : [];
    const driftRisk = normalizeDrift(observed?.driftRisk);
    const database = stateStore.health();
    const databaseHealth = database.journalMode === "wal" && database.integrity === "ok" ? "WAL_OK" : "WAL_DEGRADED";
    const unhealthyWorkers = workers.filter((worker) => !["ready", "healthy", "idle", "busy", "starting"].includes(String(worker?.status ?? "").toLowerCase()));
    const currentWorker = workers.find((worker) => ["busy", "ready", "healthy"].includes(String(worker?.status ?? "").toLowerCase()))?.id ?? "repository";
    const containmentIssue = unhealthyWorkers.length > 0 || databaseHealth !== "WAL_OK" || driftRisk !== "STABLE";
    const decisionContent = {
      proposal: `Observe ${workers.length} worker(s) and ${tasks.length} task(s) inside the isolated 4783 candidate before proposing any mutation.`,
      challenge: containmentIssue
        ? `Containment evidence is incomplete: ${unhealthyWorkers.length} worker(s) are non-healthy, database=${databaseHealth}, drift=${driftRisk}.`
        : "No current containment breach is evidenced; continue verification before mutation.",
      synthesis: containmentIssue
        ? "Hold candidate mutation and prioritize verification/containment evidence."
        : "Candidate observation is stable; preserve existing task-policy, lease, and verification gates.",
    };
    const timestamp = now();
    const leaseId = `uccp-${randomUUID()}`;
    const correlationId = `uccp-cycle-${timestamp}`;
    const leaseDurationMs = Math.max(60_000, intervalMs * 4);
    const contentOwner = { classification: "local-only", ownerType: "uccp", ownerId: leaseId };
    let contentRef = null;
    let lease;

    try {
      contentRef = contentVault.put(Buffer.from(JSON.stringify(decisionContent), "utf8"), contentOwner);
      const contentMetadata = contentVault.metadata(contentRef, contentOwner);
      const decisionSummary = {
        schemaVersion: 1,
        outcome: containmentIssue ? "hold" : "stable",
        contentRef,
        contentSha256: contentMetadata.sha256,
        contentBytes: contentMetadata.sizeBytes,
        contentClassification: "local-only",
        contentKind: "uccp-decision-summary",
      };
      lease = stateStore.recordLease({
        leaseId,
        correlationId,
        workerName: currentWorker,
        currentNode: "Synthesis",
        decisionSummary,
        metrics: { driftRisk, databaseHealth, workerCount: workers.length, taskCount: tasks.length },
        leaseDurationMs,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    } catch (error) {
      if (contentRef) {
        try { contentVault.remove(contentRef, contentOwner); } catch {}
      }
      throw error;
    }

    const activeLeases = typeof stateStore.listActiveLeases === "function" ? stateStore.listActiveLeases(timestamp).length : 1;
    const updateResult = telemetryRegistry.update({
      predictiveMetrics: { driftRisk, databaseHealth },
      generativeState: { decisionSummary: lease.decisionSummary },
      agenticStatus: { activeLeases, currentWorker },
    });
    const telemetry = updateResult ?? telemetryRegistry.snapshot?.() ?? {
      predictiveMetrics: { driftRisk, databaseHealth }, generativeState: { decisionSummary: lease.decisionSummary }, agenticStatus: { activeLeases, currentWorker },
    };
    return { lease, telemetry, observed };
  };

  return Object.freeze({
    cycle,
    start() {
      if (running) return;
      running = true;
      void cycle().catch(() => {});
      timer = setInterval(() => { void cycle().catch(() => {}); }, intervalMs);
      timer.unref?.();
    },
    stop() {
      running = false;
      if (timer) clearInterval(timer);
      timer = null;
    },
    snapshot() {
      return { running, intervalMs };
    },
  });
}

function normalizeDrift(value) {
  const text = String(value ?? "STABLE").trim().toUpperCase();
  if (["STABLE", "ELEVATED", "CRITICAL", "UNKNOWN"].includes(text)) return text;
  return "UNKNOWN";
}
