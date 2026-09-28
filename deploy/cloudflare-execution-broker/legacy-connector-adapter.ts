type LegacyGrant = {
  capability: string;
  provider: "github" | "cloudflare" | "composio";
  permissionClass: "read" | "write" | "execute";
  zeroCreditEligible: boolean;
  healthy: boolean;
};

type LegacyAttestation = {
  schemaVersion: 1;
  kind: "connector-capability-attestation";
  observedAt: string;
  expiresAt: string;
  grants: LegacyGrant[];
};

const ALLOWED: Readonly<Record<LegacyGrant["provider"], readonly string[]>> = Object.freeze({
  github: Object.freeze(["repository.inspect", "repository.write"]),
  cloudflare: Object.freeze(["cloud.inspect", "cloud.execute"]),
  composio: Object.freeze(["repository.inspect", "repository.write", "cloud.inspect", "cloud.execute", "integration.execute"]),
});

const REQUIRED_PERMISSION: Readonly<Record<string, LegacyGrant["permissionClass"]>> = Object.freeze({
  "repository.inspect": "read",
  "repository.write": "write",
  "cloud.inspect": "read",
  "cloud.execute": "execute",
  "integration.execute": "execute",
});
function valid(value: unknown, now: number): value is LegacyAttestation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || record.kind !== "connector-capability-attestation" || !Array.isArray(record.grants)) return false;
  const observedAt = Date.parse(String(record.observedAt ?? ""));
  const expiresAt = Date.parse(String(record.expiresAt ?? ""));
  return Number.isFinite(observedAt) && Number.isFinite(expiresAt) && observedAt <= now && expiresAt > now && expiresAt - observedAt <= 15 * 60_000;
}

function grantValid(grant: LegacyGrant): boolean {
  return Boolean(grant && ALLOWED[grant.provider]?.includes(grant.capability)
    && REQUIRED_PERMISSION[grant.capability] === grant.permissionClass
    && grant.zeroCreditEligible === true && grant.healthy === true);
}

export function adaptLegacyConnectorAttestation(value: unknown, executableProviders: ReadonlySet<string>, now = Date.now()) {
  if (!valid(value, now)) return [];
  const grouped = new Map<LegacyGrant["provider"], LegacyGrant[]>();
  for (const grant of value.grants) {
    if (!grantValid(grant) || !executableProviders.has(grant.provider)) continue;
    const bucket = grouped.get(grant.provider) ?? [];
    bucket.push(grant); grouped.set(grant.provider, bucket);
  }
  return [...grouped].map(([provider, grants]) => ({
    schemaVersion: 1 as const, kind: "universal-worker-attestation" as const,
    workerId: `legacy-${provider}`, provider, locality: "cloud" as const,
    observedAt: value.observedAt, expiresAt: value.expiresAt,
    observedLatencyMs: 999, queueDepth: 0, reliabilityScore: 0.5,
    capabilities: grants.map((grant) => ({ capability: grant.capability, permissionClass: grant.permissionClass,
      healthy: true, zeroCreditEligible: true, costClass: "zero-credit" as const,
      dataClassesAllowed: ["synthetic", "personal", "enterprise"], authorityScopes: [] as string[] })),
  }));
}