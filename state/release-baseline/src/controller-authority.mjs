import { randomUUID } from "node:crypto";

export const PRIMARY_CONTROLLERS = Object.freeze(["primary-local-codex", "primary-cloud-codex"]);
export const MAX_INTEGRATION_LEASE_MS = 15 * 60 * 1000;

const CAPABILITIES = Object.freeze([
  "architect", "decompose", "create-bounded-assignments", "implement", "test", "review", "integrate",
]);

export function controllerAuthoritySnapshot() {
  return {
    model: "dual-primary-single-integration-lease",
    rolesAreTransportOnly: true,
    authorizedControllers: PRIMARY_CONTROLLERS.map((id) => ({ id, capabilities: [...CAPABILITIES] })),
    equalPrimaryCapability: true,
    integration: {
      leaseRequired: true,
      maximumLeaseMs: MAX_INTEGRATION_LEASE_MS,
      concurrentHolders: 1,
      mergeIsAutomatic: false,
      verificationRequired: true,
    },
    pathCoordination: { overlapVisible: true, overlapProhibited: false },
    coreUpdateActivationAuthority: "mahoraga-verified-automatic",
    secondary: {
      id: "secondary-codex",
      backwardCompatibleMailbox: true,
      canImplement: true,
      canReview: true,
      canIntegrate: false,
      branchPrefix: "secondary/",
    },
  };
}

export class IntegrationLeaseController {
  #lease = null;
  #now;

  constructor({ now = () => Date.now() } = {}) {
    this.#now = now;
  }

  acquire({ controllerId, durationMs, purpose, paths = [] }) {
    assertPrimary(controllerId);
    if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > MAX_INTEGRATION_LEASE_MS) throw new Error("invalid-integration-lease-duration");
    if (typeof purpose !== "string" || purpose.trim().length < 1 || purpose.length > 200) throw new Error("invalid-integration-lease-purpose");
    const active = this.current();
    if (active) return { acquired: false, lease: active, overlaps: overlappingPaths(active.paths, paths) };
    const acquiredAt = this.#now();
    this.#lease = Object.freeze({
      leaseId: `int-${randomUUID()}`,
      controllerId,
      purpose: purpose.trim(),
      paths: normalizePaths(paths),
      acquiredAt: new Date(acquiredAt).toISOString(),
      expiresAt: new Date(acquiredAt + durationMs).toISOString(),
    });
    return { acquired: true, lease: this.#lease, overlaps: [] };
  }

  release({ controllerId, leaseId }) {
    const active = this.current();
    if (!active) return false;
    if (active.controllerId !== controllerId || active.leaseId !== leaseId) throw new Error("integration-lease-owner-required");
    this.#lease = null;
    return true;
  }

  current() {
    if (this.#lease && Date.parse(this.#lease.expiresAt) <= this.#now()) this.#lease = null;
    return this.#lease;
  }
}

export function overlappingPaths(left, right) {
  const a = normalizePaths(left);
  const b = normalizePaths(right);
  return a.filter((path) => b.some((candidate) => path === candidate || path.startsWith(`${candidate}/`) || candidate.startsWith(`${path}/`)));
}

function normalizePaths(paths) {
  if (!Array.isArray(paths)) throw new Error("invalid-coordination-paths");
  return [...new Set(paths.map((value) => {
    if (typeof value !== "string" || value.startsWith("/") || value.includes("..") || value.includes("\\")) throw new Error("invalid-coordination-path");
    return value.replace(/^\.\//, "").replace(/\/$/, "");
  }).filter(Boolean))].sort();
}

function assertPrimary(controllerId) {
  if (!PRIMARY_CONTROLLERS.includes(controllerId)) throw new Error("primary-controller-required");
}
