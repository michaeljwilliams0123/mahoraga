/** Read-only projection of the existing Cloudflare acceptance receipt. Never grants authority. */
export type AcceptanceEvidence = Readonly<{
 state: "absent" | "partial" | "hold" | "observed"; reason: string;
 targetSha: string | null; observedAt: string | null;
 accessVerified: boolean; transportVerified: boolean; providerCognitionVerified: boolean;
 durableVerified: boolean; trafficAuthorityVerified: boolean; noRailwayFallbackVerified: boolean;
 providerId?: string; modelId?: string; executions: number | null; replays: number | null;
}>;
const FLAGS = ["accessProtected", "ready", "durableStateVerified", "runtimeAttestationVerified", "trafficAuthorityVerified", "railwayNoRouteVerified", "railwayNoInfluenceVerified", "staleShaRejected", "executed", "replayed", "durableContinuityVerified", "hardZeroBillingVerified", "failClosedZeroBillingVerified", "providerCognitionVerified", "noRailwayFallbackVerified"] as const;
const KEYS = new Set(["schemaVersion", "kind", "status", "targetSha", "observedAt", "providerId", "modelId", "executionUniqueness", "x-bypass-applied", ...FLAGS]);
const COUNT_KEYS = new Set(["logicalRequests", "providerExecutions", "receipts", "conflicts", "replays", "atMostOneVerified"]);
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)) ? value as Record<string, unknown> : null;
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9@][A-Za-z0-9@._:/-]{0,127}$/.test(value) && !value.includes("://");
const empty = (state: AcceptanceEvidence["state"], reason: string): AcceptanceEvidence => Object.freeze({ state, reason, targetSha: null, observedAt: null, accessVerified: false, transportVerified: false, providerCognitionVerified: false, durableVerified: false, trafficAuthorityVerified: false, noRailwayFallbackVerified: false, executions: null, replays: null });
export function projectAcceptanceEvidence(value: unknown, { expectedSha, deploymentSha, now = Date.now() }: { expectedSha?: unknown; deploymentSha?: unknown; now?: number } = {}): AcceptanceEvidence {
 if (value === undefined || value === null) return empty("absent", "acceptance-unobserved");
 const r = record(value);
 if (!r || Object.keys(r).some(key => !KEYS.has(key)) || r["x-bypass-applied"] === true || (r["x-bypass-applied"] !== undefined && r["x-bypass-applied"] !== false)) return empty("hold", "acceptance-invalid-or-forbidden");
 if (r.schemaVersion !== 1 || r.kind !== "cloudflare-execution-runtime-acceptance" || !["accepted", "failed", "hold"].includes(String(r.status))) return empty("hold", "acceptance-identity-unverified");
 if (!sha(expectedSha) || !sha(deploymentSha) || !sha(r.targetSha) || r.targetSha !== expectedSha || r.targetSha !== deploymentSha) return empty("hold", "acceptance-source-or-deployment-mismatch");
 const time = typeof r.observedAt === "string" && r.observedAt.length <= 64 ? Date.parse(r.observedAt) : NaN;
 if (!Number.isFinite(now) || !Number.isFinite(time) || time > now + 60_000 || time < now - 900_000) return empty("hold", "acceptance-stale-or-time-invalid");
 if (FLAGS.some(key => r[key] !== undefined && typeof r[key] !== "boolean") || (r.providerId !== undefined && !id(r.providerId)) || (r.modelId !== undefined && !id(r.modelId))) return empty("hold", "acceptance-invalid-or-forbidden");
 const counts = record(r.executionUniqueness);
 if (counts && (Object.keys(counts).some(key => !COUNT_KEYS.has(key)) || [...COUNT_KEYS].filter(key => key !== "atMostOneVerified").some(key => !Number.isSafeInteger(counts[key]) || Number(counts[key]) < 0 || Number(counts[key]) > 10_000) || typeof counts.atMostOneVerified !== "boolean" || Number(counts.providerExecutions) > 1 || Number(counts.receipts) > 1 || Number(counts.logicalRequests) < Number(counts.providerExecutions) + Number(counts.conflicts) + Number(counts.replays))) return empty("hold", "acceptance-execution-uniqueness-invalid");
 if (r.executionUniqueness !== undefined && !counts) return empty("hold", "acceptance-execution-uniqueness-invalid");
 if (r.status !== "accepted") return empty("hold", "acceptance-not-accepted");
 const unique = counts?.atMostOneVerified === true && counts.providerExecutions === 1 && counts.receipts === 1;
 const cognition = r.providerCognitionVerified === true && r.executed === true && r.hardZeroBillingVerified === true && r.failClosedZeroBillingVerified === true && id(r.providerId) && id(r.modelId) && unique;
 const complete = FLAGS.every(key => r[key] === true) && cognition;
 return Object.freeze({ state: complete ? "observed" : "partial", reason: complete ? "acceptance-evidence-observed" : "acceptance-evidence-incomplete", targetSha: r.targetSha, observedAt: String(r.observedAt), accessVerified: r.accessProtected === true, transportVerified: r.ready === true && r.runtimeAttestationVerified === true, providerCognitionVerified: cognition, durableVerified: r.durableStateVerified === true && r.durableContinuityVerified === true && unique, trafficAuthorityVerified: complete && r.trafficAuthorityVerified === true, noRailwayFallbackVerified: r.noRailwayFallbackVerified === true && r.railwayNoRouteVerified === true && r.railwayNoInfluenceVerified === true, ...(id(r.providerId) ? { providerId: r.providerId } : {}), ...(id(r.modelId) ? { modelId: r.modelId } : {}), executions: counts ? Number(counts.providerExecutions) : null, replays: counts ? Number(counts.replays) : null });
}
