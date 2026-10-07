import { PairedRouteFreshnessCard } from "./PairedRouteFreshnessCard";

type CapabilityLike = {
  capability?: string;
  id?: string;
  name?: string;
  costClass?: string;
  routable?: boolean;
  routeStatus?: string;
  creditsUsed?: string;
  workerIds?: string[];
  enabled?: boolean;
  available?: boolean;
  atCapacity?: boolean;
  observedAt?: string;
  verifiedAt?: string;
};

const PAIRED_ROUTES = ["openai-primary", "openai-destiny"] as const;

function routeId(capability: CapabilityLike) {
  return capability.id ?? capability.name ?? capability.capability ?? "";
}

export function OpenAiRouteCreditsCard({ capabilities = [] }: { capabilities?: CapabilityLike[] }) {
  const projected = PAIRED_ROUTES.map((id) => {
    const match = capabilities.find((capability) => routeId(capability) === id || capability.capability === id);
    const creditsUsed = match?.creditsUsed === "true" || match?.creditsUsed === "false" || match?.creditsUsed === "unknown"
      ? match.creditsUsed
      : "unknown";
    const routeStatus = match?.routable === true ? "routable" : match?.routeStatus ?? "route-unconfigured";
    return `${id}: creditsUsed ${creditsUsed}, ${routeStatus}, ${match?.costClass ?? "licensed-cloud"}`;
  });

  return (
    <>
      <article className="eclipse-status-card neutral" data-testid="openai-route-credits">
        <span>Paired route projection</span>
        <strong>creditsUsed tri-state</strong>
        <p>
          Merged #1021 projects openai-primary and openai-destiny into the live capability index. Signed receipts may say creditsUsed true, false, or unknown; unknown is required when provider evidence is absent, and Mahoraga must not fabricate true or false. {projected.join(" · ")}. licensed-cloud is subscription-included, not metered-cloud. route-unconfigured is not execution authority. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This card is not execution readiness, cognition proof, spending authority, or production traffic authority.
        </p>
      </article>
      <PairedRouteFreshnessCard capabilities={capabilities} />
    </>
  );
}
