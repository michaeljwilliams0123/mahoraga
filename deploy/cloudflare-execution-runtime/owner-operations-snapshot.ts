/**
 * Owner-scoped Cloudflare Work projection. This is deliberately NOT the local
 * supervisor snapshot: SQLite turns are observable; worker leases, repair
 * incidents, rollback generations and GitHub main head are not.
 */
export type OwnerTurnCounts = ReadonlyArray<{ status: string; count: number }>;
export type CloudAssistantReadiness = {
  routable: boolean;
  provider: string;
  providerReasonCode: string | null;
  evidenceLevel: string;
};
const validSha = (value: string) => /^[a-f0-9]{40}$/.test(value);
const tally = (rows: OwnerTurnCounts, status: string) => rows.reduce((total, row) =>
  row.status === status && Number.isSafeInteger(row.count) && row.count >= 0 ? total + row.count : total, 0);

export function projectCloudOwnerOperationsSnapshot({
  sourceSha, observedAt, turns, assistant,
}: {
  sourceSha: string;
  observedAt: string;
  turns: OwnerTurnCounts;
  assistant: CloudAssistantReadiness;
}) {
  if (!validSha(sourceSha) || !Number.isFinite(Date.parse(observedAt)) || !Array.isArray(turns))
    throw new Error("cloud-operations-evidence-invalid");
  if (!assistant || typeof assistant.routable !== "boolean")
    throw new Error("cloud-operations-assistant-evidence-invalid");
  const completed = tally(turns, "SUCCESS");
  return {
    observationScope: "owner-cloud-turns" as const,
    generatedAt: observedAt,
    runtime: { version: "Cloudflare execution runtime", productionBaseline: "not-observed",
      rollbackTarget: "not-observed" },
    repository: { branch: "deployed-source", headSha: sourceSha, cleanState: "deployment-provenance-only" },
    workers: [],
    tasks: { active: tally(turns, "PENDING"), waiting: 0, failed: tally(turns, "FAILED"), completed },
    objectives: { active: 0, waiting: 0 },
    repairs: { activeIncidents: 0, lastRepairState: "not-observed" },
    verification: { state: "not-observed", exactHeadSha: null },
    update: { candidate: null, activationState: "not-observed", rollbackReady: false },
    interactionReadiness: { ready: assistant.routable, capability: "assistant.respond" as const,
      workerId: null, provider: assistant.provider || "unknown", canary: assistant.routable ? "fresh" : "unavailable",
      reason: assistant.routable ? null : assistant.providerReasonCode ?? "provider-unavailable",
      evidenceLevel: assistant.evidenceLevel ?? "unknown", lastObservedAt: observedAt, lastVerifiedAt: null },
    latestAuthorityDecision: null,
    cloudEvidence: {
      sourceSha,
      ownerScoped: true as const,
      completed,
      unknown: ["waiting", "workers", "objectives", "repairs", "update", "authority", "github-main"] as const,
      mutationActionsSupported: false as const,
    },
  };
}
