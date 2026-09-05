import fs from "node:fs";
import path from "node:path";

export class ContainmentWatchdog {
  constructor({
    port = 4783,
    intervalMs = 500,
    failureThreshold = 3,
    check,
    rollback,
    telemetryRegistry = null,
  } = {}) {
    if (port !== 4783) throw new TypeError("watchdog-candidate-port-required");
    if (!Number.isInteger(intervalMs) || intervalMs < 100) throw new TypeError("watchdog-interval-invalid");
    if (!Number.isInteger(failureThreshold) || failureThreshold < 2 || failureThreshold > 20) throw new TypeError("watchdog-failure-threshold-invalid");
    if (typeof check !== "function") throw new TypeError("watchdog-check-required");
    if (typeof rollback !== "function") throw new TypeError("watchdog-rollback-required");
    this.port = port;
    this.intervalMs = intervalMs;
    this.failureThreshold = failureThreshold;
    this.check = check;
    this.rollback = rollback;
    this.telemetryRegistry = telemetryRegistry;
    this.monitoring = false;
    this.containmentTriggered = false;
    this.consecutiveFailures = 0;
    this.lastReason = null;
    this.timer = null;
    this.evaluating = false;
  }

  start() {
    if (this.monitoring || this.containmentTriggered) return;
    this.monitoring = true;
    this.timer = setInterval(() => {
      if (!this.monitoring || this.evaluating) return;
      this.evaluating = true;
      void this.evaluateOnce().finally(() => { this.evaluating = false; });
    }, this.intervalMs);
    this.timer.unref?.();
  }

  async evaluateOnce() {
    let result;
    try {
      result = await this.check();
    } catch (error) {
      result = { ok: false, reason: `check-error:${error?.message ?? "unknown"}`, databaseTxPass: false, fsIntegrityPass: false };
    }
    const normalized = normalizeCheck(result);
    this.lastReason = normalized.reason;
    if (normalized.ok) this.consecutiveFailures = 0;
    else this.consecutiveFailures += 1;

    this.telemetryRegistry?.update?.({
      canaryScores: {
        databaseTxPass: normalized.databaseTxPass,
        fsIntegrityPass: normalized.fsIntegrityPass,
      },
    });

    if (!normalized.ok && this.consecutiveFailures >= this.failureThreshold && !this.containmentTriggered) {
      this.containmentTriggered = true;
      this.stop();
      await this.rollback({
        port: this.port,
        reason: normalized.reason ?? "candidate-containment-canary-failed",
        consecutiveFailures: this.consecutiveFailures,
      });
    }
    return normalized.ok;
  }

  stop() {
    this.monitoring = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  snapshot() {
    return {
      port: this.port,
      monitoring: this.monitoring,
      containmentTriggered: this.containmentTriggered,
      consecutiveFailures: this.consecutiveFailures,
      failureThreshold: this.failureThreshold,
      lastReason: this.lastReason,
    };
  }
}

export function createUccpCanary({ stateStore, root, loopTimeoutMs = 10_000, now = () => Date.now() } = {}) {
  if (!stateStore || typeof stateStore.health !== "function") throw new TypeError("uccp-canary-state-store-required");
  if (typeof root !== "string" || !root) throw new TypeError("uccp-canary-root-required");
  if (!Number.isInteger(loopTimeoutMs) || loopTimeoutMs < 2_000) throw new TypeError("uccp-canary-timeout-invalid");
  const forbiddenPaths = [path.join(root, "src", "index.js"), path.join(root, "src", "server.js")];
  const startedAt = now();

  return async () => {
    let databaseTxPass = false;
    let latest = null;
    try {
      const health = stateStore.health();
      databaseTxPass = health.journalMode === "wal" && health.integrity === "ok";
      latest = typeof stateStore.latestLease === "function" ? stateStore.latestLease() : null;
    } catch (error) {
      return { ok: false, reason: `uccp-database-error:${error?.message ?? "unknown"}`, databaseTxPass: false, fsIntegrityPass: true };
    }
    const currentTime = now();
    const fsIntegrityPass = forbiddenPaths.every((candidate) => !fs.existsSync(candidate));
    const firstLeaseWithinGrace = latest !== null || (currentTime - startedAt) <= loopTimeoutMs;
    const leaseFresh = latest ? (currentTime - latest.updatedAt) <= loopTimeoutMs : firstLeaseWithinGrace;
    const ok = databaseTxPass && fsIntegrityPass && leaseFresh;
    const reason = !databaseTxPass ? "uccp-database-unhealthy"
      : !fsIntegrityPass ? "candidate-forbidden-core-js-detected"
      : !latest && !firstLeaseWithinGrace ? "uccp-lease-heartbeat-missing"
      : !leaseFresh ? "uccp-lease-heartbeat-stale"
      : null;
    return { ok, reason, databaseTxPass, fsIntegrityPass };
  };
}

function normalizeCheck(result) {
  if (typeof result === "boolean") return { ok: result, reason: result ? null : "candidate-canary-failed", databaseTxPass: result, fsIntegrityPass: result };
  if (!result || typeof result !== "object") return { ok: false, reason: "candidate-canary-invalid-result", databaseTxPass: false, fsIntegrityPass: false };
  return {
    ok: result.ok === true,
    reason: typeof result.reason === "string" ? result.reason : null,
    databaseTxPass: result.databaseTxPass !== false,
    fsIntegrityPass: result.fsIntegrityPass !== false,
  };
}