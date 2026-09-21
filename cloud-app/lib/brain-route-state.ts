export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type CapabilityId = Brand<string, "CapabilityId">;
export type RouteId = Brand<string, "RouteId">;
export type ObjectiveId = Brand<string, "ObjectiveId">;
export type ReceiptId = Brand<string, "ReceiptId">;

export type BrainRouteState =
  | { kind: "transport-unavailable"; reason: string }
  | { kind: "transport-ready"; sessionId: string }
  | { kind: "capability-unavailable"; capability: CapabilityId; reason: string }
  | { kind: "route-ready"; capability: CapabilityId; routeId: RouteId; provider: string | null }
  | { kind: "provider-backoff"; routeId: RouteId; reason: string; retryAfter: string | null }
  | { kind: "executing"; objectiveId: ObjectiveId; routeId: RouteId }
  | { kind: "verifying"; objectiveId: ObjectiveId; receiptId: ReceiptId }
  | { kind: "settled"; objectiveId: ObjectiveId; receiptId: ReceiptId };

export type BrainReadiness = "connecting" | "ready" | "degraded" | "offline";

export type CapabilityObservation = {
  capability: string;
  routable: boolean;
  enabled?: boolean;
  provider?: string;
  routingReason?: string | null;
  providerReasonCode?: string | null;
  lastVerifiedAt?: string | null;
};

const capabilityId = (value: string) => value as CapabilityId;
const routeId = (value: string) => value as RouteId;

export function deriveBrainRouteState(
  connected: boolean,
  capabilities: readonly CapabilityObservation[],
  diagnostic?: string | null,
): BrainRouteState {
  if (!connected) {
    return { kind: "transport-unavailable", reason: diagnostic ?? "transport-not-connected" };
  }

  const assistant = capabilities.find((item) => item.capability === "assistant.respond");
  if (!assistant) {
    return { kind: "capability-unavailable", capability: capabilityId("assistant.respond"), reason: "capability-not-advertised" };
  }

  if (!assistant.routable || assistant.enabled === false) {
    const reason = assistant.providerReasonCode ?? assistant.routingReason ?? "capability-not-routable";
    if (/backoff|quota|rate|credit/i.test(reason)) {
      return { kind: "provider-backoff", routeId: routeId("assistant.respond"), reason, retryAfter: null };
    }
    return { kind: "capability-unavailable", capability: capabilityId(assistant.capability), reason };
  }

  return {
    kind: "route-ready",
    capability: capabilityId(assistant.capability),
    routeId: routeId(assistant.capability),
    provider: assistant.provider ?? null,
  };
}

export function brainReadiness(state: BrainRouteState): BrainReadiness {
  switch (state.kind) {
    case "transport-ready":
      return "connecting";
    case "route-ready":
    case "executing":
    case "verifying":
    case "settled":
      return "ready";
    case "capability-unavailable":
    case "provider-backoff":
      return "degraded";
    case "transport-unavailable":
      return "offline";
    default:
      return assertNever(state);
  }
}

export function brainRouteReason(state: BrainRouteState): string | null {
  switch (state.kind) {
    case "transport-unavailable":
    case "capability-unavailable":
    case "provider-backoff":
      return state.reason;
    case "transport-ready":
    case "route-ready":
    case "executing":
    case "verifying":
    case "settled":
      return null;
    default:
      return assertNever(state);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled brain route state: ${JSON.stringify(value)}`);
}
