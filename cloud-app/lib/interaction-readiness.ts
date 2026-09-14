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

export type ZeroCreditAdmission = {
  state: "allow" | "hold" | "deny";
  provider: string;
  costClass: string;
  billingClass: string;
  reason: string;
  lastVerifiedAt: string | null;
};

const ZERO_CREDIT_COST_CLASSES = new Set(["deterministic", "local-model", "cloud-open-weight"]);

type CapabilityLike = {
  capability?: string;
  routable?: boolean;
  enabled?: boolean;
  workerId?: string | null;
  workerIds?: string[];
  provider?: string;
  canary?: string;
  costClass?: string;
  billingClass?: string;
  routingReason?: string | null;
  providerReasonCode?: string | null;
  evidenceLevel?: string;
  lastObservedAt?: string | null;
  lastVerifiedAt?: string | null;
};

export function projectZeroCreditAdmission(capabilities: CapabilityLike[] | null | undefined): ZeroCreditAdmission {
  const routes = (Array.isArray(capabilities) ? capabilities : [])
    .filter((item) => item?.capability === "assistant.respond");
  const route = routes.find((item) => item.enabled !== false && item.routable === true && ZERO_CREDIT_COST_CLASSES.has(item.costClass ?? ""))
    ?? routes.find((item) => item.enabled !== false && ZERO_CREDIT_COST_CLASSES.has(item.costClass ?? ""))
    ?? routes.find((item) => item.enabled !== false)
    ?? null;
  const provider = route?.workerId ?? route?.workerIds?.[0] ?? route?.provider ?? "unknown";
  const costClass = route?.costClass ?? "unknown";
  const billingClass = route?.billingClass ?? "unknown";
  if (!route) return { state: "hold", provider, costClass, billingClass, reason: "route-unavailable", lastVerifiedAt: null };
  if (!ZERO_CREDIT_COST_CLASSES.has(costClass)) {
    return { state: "deny", provider, costClass, billingClass, reason: "paid-execution-class-denied", lastVerifiedAt: route.lastVerifiedAt ?? null };
  }
  if (route.routable !== true) {
    return {
      state: "hold", provider, costClass, billingClass,
      reason: route.providerReasonCode ?? route.routingReason ?? "zero-credit-provider-unavailable",
      lastVerifiedAt: route.lastVerifiedAt ?? null,
    };
  }
  return { state: "allow", provider, costClass, billingClass, reason: "verified-zero-credit-route", lastVerifiedAt: route.lastVerifiedAt ?? null };
}

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
