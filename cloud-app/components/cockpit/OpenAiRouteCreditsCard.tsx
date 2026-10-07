type CapabilityLike = {
  capability?: string;
  id?: string;
  name?: string;
  costClass?: string;
  routable?: boolean;
  routeStatus?: string;
  creditsUsed?: string;
};

const PAIRED_ROUTES = ["openai-primary", "openai-destiny"] as const;

function routeId(capability: CapabilityLike) {
  return capability.id ?? capability.name ?? capability.capability ?? "";
}

function projectRoute(id: (typeof PAIRED_ROUTES)[number], capabilities: CapabilityLike[]) {
  const match = capabilities.find((capability) => routeId(capability) === id || capability.capability === id);
  const creditsUsed = match?.creditsUsed === "true" || match?.creditsUsed === "false" || match?.creditsUsed === "unknown"
    ? match.creditsUsed
    : "unknown";
  const routeStatus = match?.routable === true ? "routable" : match?.routeStatus ?? "route-unconfigured";
  const costClass = match?.costClass ?? "licensed-cloud";
  return { id, creditsUsed, routeStatus, costClass };
}

export function OpenAiRouteCreditsCard({ capabilities = [] }: { capabilities?: CapabilityLike[] }) {
  const projected = PAIRED_ROUTES.map((id) => projectRoute(id, capabilities));

  return (
    <article className="eclipse-status-card neutral" data-testid="openai-route-credits">
      <span>Paired route projection</span>
      <strong>creditsUsed tri-state</strong>
      <ul>
        {projected.map((route) => (
          <li key={route.id} data-route={route.id} data-credits-used={route.creditsUsed}>
            {route.id}: creditsUsed {route.creditsUsed}, {route.routeStatus}, {route.costClass}
          </li>
        ))}
      </ul>
      <p>
        Merged #1021 projects openai-primary and openai-destiny into the live capability index. Signed receipts may say creditsUsed true, false, or unknown; unknown is required when provider evidence is absent, and Mahoraga must not fabricate true or false. {projected.map((route) => `${route.id}: creditsUsed ${route.creditsUsed}, ${route.routeStatus}, ${route.costClass}`).join(" · ")}. licensed-cloud is subscription-included, not metered-cloud. route-unconfigured is not execution authority. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This card is not execution readiness, cognition proof, spending authority, or production traffic authority.
      </p>
    </article>
  );
}
