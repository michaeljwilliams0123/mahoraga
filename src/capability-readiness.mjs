const PROCESS_STATES = new Set(["stopped", "starting", "live", "busy", "stale", "crashed", "quarantined"]);
const PROVIDER_STATES = new Set(["unknown", "unavailable", "degraded", "ready"]);
const CANARY_STATES = new Set(["never", "stale", "failed", "verified"]);
export const DETERMINISTIC_READ_CANARY_TTL_MS = 24 * 60 * 60 * 1000;
export const WRITE_CANARY_TTL_MS = 15 * 60 * 1000;

export function deriveCapabilityReadiness({ process, provider, canary, capabilityClass = "write" }, now = Date.now()) {
  const processStatus = process?.status ?? "stopped";
  const providerStatus = provider?.status ?? "unknown";
  const canaryStatus = canary?.status ?? "never";
  validateState(processStatus, PROCESS_STATES, "process-readiness-invalid");
  validateState(providerStatus, PROVIDER_STATES, "provider-readiness-invalid");
  validateState(canaryStatus, CANARY_STATES, "canary-readiness-invalid");
  const ttlMs = capabilityClass === "deterministic-read" ? DETERMINISTIC_READ_CANARY_TTL_MS : WRITE_CANARY_TTL_MS;
  const verifiedAt = canary?.verifiedAt ?? null;
  const fresh = canaryStatus === "verified" && typeof verifiedAt === "string" && now - Date.parse(verifiedAt) <= ttlMs && now >= Date.parse(verifiedAt);
  const reason = routeBlockReason({ processStatus, providerStatus, canaryStatus, fresh });
  return Object.freeze({
    process: processStatus,
    provider: providerStatus,
    canary: canaryStatus === "verified" && !fresh ? "stale" : canaryStatus,
    routable: reason === null,
    evidenceLevel: fresh ? "verified" : providerStatus !== "unknown" ? "inferred" : "observed",
    lastObservedAt: process?.observedAt ?? null,
    lastVerifiedAt: verifiedAt,
    ttlMs,
    reason,
  });
}

export function isCapabilityRoutable(policy, readiness) {
  if (!policy || !readiness) return Object.freeze({ eligible: false, reason: "routing-evidence-missing" });
  if (!readiness.routable) return Object.freeze({ eligible: false, reason: readiness.reason ?? "capability-not-verified" });
  if (policy.attendedRequired && !policy.authoritySessionId) return Object.freeze({ eligible: false, reason: "attended-session-required" });
  if (policy.executionPlane === "candidate-worktree" && !policy.integrationLeaseId) return Object.freeze({ eligible: false, reason: "integration-lease-required" });
  return Object.freeze({ eligible: true, reason: null });
}

export function capabilityClass(worker, capability) {
  if (worker.costClass === "deterministic" && /\.(?:health|status|inspect|history|observe|validate|scan)$/.test(capability)) return "deterministic-read";
  return "write";
}

function routeBlockReason({ processStatus, providerStatus, canaryStatus, fresh }) {
  if (!new Set(["live", "busy"]).has(processStatus)) return `process-${processStatus}`;
  if (providerStatus !== "ready") return `provider-${providerStatus}`;
  if (canaryStatus === "failed") return "canary-failed";
  if (canaryStatus === "never") return "canary-never-run";
  if (!fresh) return "canary-stale";
  return null;
}

function validateState(value, allowed, code) {
  if (!allowed.has(value)) throw new TypeError(code);
}
