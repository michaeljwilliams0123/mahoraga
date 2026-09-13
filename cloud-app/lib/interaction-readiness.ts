export type InteractionReadiness = {
  ready: boolean;
  capability: "assistant.respond";
  workerId: string | null;
  provider: string;
  canary: string;
  reason: string | null;
  evidenceLevel: string;
  lastObservedAt: string | null;
  lastVerifiedAt: string | null;
};

type CapabilityLike = {
  capability?: string;
  routable?: boolean;
  workerId?: string | null;
  workerIds?: string[];
  provider?: string;
  canary?: string;
  routingReason?: string | null;
  providerReasonCode?: string | null;
  evidenceLevel?: string;
  lastObservedAt?: string | null;
  lastVerifiedAt?: string | null;
};

export function projectInteractionReadiness(capabilities: CapabilityLike[] | null | undefined): InteractionReadiness {
  const route = (Array.isArray(capabilities) ? capabilities : []).find((item) => item?.capability === "assistant.respond") ?? null;
  return {
    ready: route?.routable === true,
    capability: "assistant.respond",
    workerId: route?.workerId ?? route?.workerIds?.[0] ?? null,
    provider: route?.provider ?? "unknown",
    canary: route?.canary ?? "never",
    reason: route?.routable === true ? null : route?.providerReasonCode ?? route?.routingReason ?? "route-unavailable",
    evidenceLevel: route?.evidenceLevel ?? "unknown",
    lastObservedAt: route?.lastObservedAt ?? null,
    lastVerifiedAt: route?.lastVerifiedAt ?? null,
  };
}
