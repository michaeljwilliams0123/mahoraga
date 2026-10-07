type CapabilityLike = {
  id?: string;
  name?: string;
  capability?: string;
  workerIds?: string[];
  routable?: boolean;
  enabled?: boolean;
  available?: boolean;
  atCapacity?: boolean;
  observedAt?: string;
  verifiedAt?: string;
};

const TTL_MS = 15 * 60 * 1000;
const PAIRED = ["openai-primary", "openai-destiny"] as const;

function routeId(capability: CapabilityLike) {
  return capability.id ?? capability.name ?? capability.capability ?? "";
}

function ageLabel(iso: string | undefined, now: number) {
  if (!iso) return "timestamp unobserved";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "timestamp invalid";
  if (at > now) return "future observation rejected";
  if (now - at > TTL_MS) return "stale beyond 15-minute write-canary TTL";
  return "within 15-minute write-canary TTL";
}

export function PairedRouteFreshnessCard({
  capabilities = [],
  now = Date.now(),
}: {
  capabilities?: CapabilityLike[];
  now?: number;
}) {
  const paired = PAIRED.map((id) => capabilities.find((capability) => routeId(capability) === id));
  const identities = paired.flatMap((capability) => capability?.workerIds ?? []);
  const duplicateIdentity = new Set(identities).size !== identities.length;
  const lines = PAIRED.map((id) => {
    const match = capabilities.find((capability) => routeId(capability) === id);
    if (!match) return `${id}: unobserved`;
    const offline = match.available === false || match.enabled === false;
    const saturated = match.atCapacity === true;
    const fresh = ageLabel(match.verifiedAt ?? match.observedAt, now);
    const routable = match.routable === true && !offline && !saturated && fresh.startsWith("within") && !duplicateIdentity;
    return `${id}: ${routable ? "fresh and eligible" : "not routable"} · ${fresh}${offline ? " · offline" : ""}${saturated ? " · at workload limit" : ""}`;
  });

  return (
    <article className="eclipse-status-card neutral" data-testid="paired-route-freshness">
      <span>Paired route freshness</span>
      <strong>{duplicateIdentity ? "Duplicate worker identity rejected" : "15-minute freshness, health, identity"}</strong>
      <p>
        Merged #1023 (419ebf23c8b0) keeps openai-primary and openai-destiny routable only with a current observation, preserved verification timestamp, available capacity, and a unique worker identity. Stale or future readiness, offline state, and configured workload limit fail closed. {lines.join(" · ")}. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. Not execution readiness, cognition proof, spending authority, provider activation, or production traffic authority.
      </p>
    </article>
  );
}
