export type ConnectorCapability = "repository.inspect" | "repository.write" | "cloud.inspect" | "cloud.execute" | "integration.execute";
export type ConnectorProvider = "github" | "cloudflare" | "composio";
export type ConnectorPermissionClass = "read" | "write" | "execute";

type ConnectorGrant = {
  capability: ConnectorCapability;
  provider: ConnectorProvider;
  permissionClass: ConnectorPermissionClass;
  zeroCreditEligible: boolean;
  healthy: boolean;
};

export type ConnectorCapabilityAttestation = {
  schemaVersion: 1;
  kind: "connector-capability-attestation";
  observedAt: string;
  expiresAt: string;
  grants: ConnectorGrant[];
};

export type ConnectorCapabilityRoute = {
  capability: ConnectorCapability;
  routable: true;
  enabled: true;
  provider: ConnectorProvider;
  workerIds: string[];
  costClass: "deterministic";
  permissionClass: ConnectorPermissionClass;
  routingReason: null;
  providerReasonCode: null;
  evidenceLevel: "runtime-execution";
};

const REQUIRED_PERMISSION: Readonly<Record<ConnectorCapability, ConnectorPermissionClass>> = Object.freeze({
  "repository.inspect": "read",
  "repository.write": "write",
  "cloud.inspect": "read",
  "cloud.execute": "execute",
  "integration.execute": "execute",
});

const PROVIDER_CAPABILITIES = Object.freeze({
  github: Object.freeze(["repository.inspect", "repository.write"]),
  cloudflare: Object.freeze(["cloud.inspect", "cloud.execute"]),
  composio: Object.freeze(["repository.inspect", "repository.write", "cloud.inspect", "cloud.execute", "integration.execute"]),
} satisfies Record<ConnectorProvider, readonly ConnectorCapability[]>);

export type ConnectorBrokerBinding = { fetch(request: Request): Promise<Response> };

export async function collectConnectorCapabilityRoutes(binding: ConnectorBrokerBinding | undefined, now = Date.now()): Promise<ConnectorCapabilityRoute[]> {
  if (!binding || typeof binding.fetch !== "function") return [];
  try {
    const response = await binding.fetch(new Request("https://mahoraga-connector-broker/api/capabilities", {
      method: "GET",
      headers: { accept: "application/json" },
    }));
    if (!response.ok) return [];
    return projectConnectorCapabilityRoutes(await response.json(), now);
  } catch {
    return [];
  }
}

export function projectConnectorCapabilityRoutes(value: unknown, now = Date.now()): ConnectorCapabilityRoute[] {
  if (!attestationValid(value, now)) return [];
  const routes: ConnectorCapabilityRoute[] = [];
  const seen = new Set<ConnectorCapability>();
  for (const grant of value.grants) {
    if (!grantValid(grant) || seen.has(grant.capability)) continue;
    seen.add(grant.capability);
    routes.push(Object.freeze({
      capability: grant.capability,
      routable: true,
      enabled: true,
      provider: grant.provider,
      workerIds: Object.freeze([`connector-${grant.provider}`]) as unknown as string[],
      costClass: "deterministic",
      permissionClass: grant.permissionClass,
      routingReason: null,
      providerReasonCode: null,
      evidenceLevel: "runtime-execution",
    }));
  }
  return Object.freeze(routes) as unknown as ConnectorCapabilityRoute[];
}

function attestationValid(value: unknown, now: number): value is ConnectorCapabilityAttestation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || record.kind !== "connector-capability-attestation" || !Array.isArray(record.grants)) return false;
  const observedAt = Date.parse(String(record.observedAt ?? ""));
  const expiresAt = Date.parse(String(record.expiresAt ?? ""));
  return Number.isFinite(observedAt) && Number.isFinite(expiresAt) && observedAt <= now && expiresAt > now && expiresAt - observedAt <= 15 * 60_000;
}

function grantValid(value: unknown): value is ConnectorGrant {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const grant = value as Record<string, unknown>;
  const capability = grant.capability as ConnectorCapability;
  const provider = grant.provider as ConnectorProvider;
  return Object.hasOwn(REQUIRED_PERMISSION, capability)
    && Object.hasOwn(PROVIDER_CAPABILITIES, provider)
    && (PROVIDER_CAPABILITIES[provider] as readonly ConnectorCapability[]).includes(capability)
    && grant.permissionClass === REQUIRED_PERMISSION[capability]
    && grant.zeroCreditEligible === true
    && grant.healthy === true;
}
