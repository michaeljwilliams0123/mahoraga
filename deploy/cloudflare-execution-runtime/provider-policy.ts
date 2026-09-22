export type AssistantCostClass =
  | "cloud-open-weight"
  | "local-model"
  | "licensed-cloud"
  | "metered-cloud";

export type ProviderBillingState = "verified-zero" | "licensed" | "metered" | "unknown";

export interface ProviderProbe {
  providerId: string;
  modelId: string | null;
  available: boolean;
  costClass: AssistantCostClass;
  metered: boolean;
  priceUsd: number | null;
  spendUsd: number | null;
  billingState: ProviderBillingState;
  zeroDollarStopGuaranteed: boolean;
  observedAt: number;
  verifiedAt: number | null;
  canaryExpiresAt: number | null;
  reasonCode: string | null;
}

export interface AssistantTurnRequest {
  conversationId: string;
  turnId: string;
  message: string;
}

export interface AssistantTurnResult {
  answer: string;
  providerId: string;
  modelId: string | null;
  costClass: AssistantCostClass;
  admissionMode: "zero-codex" | "licensed-approved";
  usage: Record<string, number | string | boolean | null>;
}

export interface AssistantProvider {
  id: string;
  costClass: AssistantCostClass;
  probe(): Promise<ProviderProbe>;
  executeAssistantTurn(request: AssistantTurnRequest): Promise<AssistantTurnResult>;
}

export interface AssistantCapabilityProjection {
  capability: "assistant.respond";
  routable: boolean;
  enabled: boolean;
  provider: string;
  workerIds: string[];
  routingReason: "provider.gap" | null;
  providerReasonCode: string | null;
  evidenceLevel: "runtime-probe";
}

const PENDING_PROJECTION: AssistantCapabilityProjection = {
  capability: "assistant.respond",
  routable: false,
  enabled: false,
  provider: "cloudflare-native",
  workerIds: [],
  routingReason: "provider.gap",
  providerReasonCode: "cloudflare-native-provider-pending",
  evidenceLevel: "runtime-probe",
};

const boundedReason = (value: string | null | undefined, fallback: string): string => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9.-]{0,95}$/.test(normalized) ? normalized : fallback;
};

export const isFreshProviderProbe = (probe: ProviderProbe, now = Date.now()): boolean => {
  return (
    Number.isFinite(probe.observedAt)
    && probe.observedAt <= now
    && probe.verifiedAt !== null
    && Number.isFinite(probe.verifiedAt)
    && probe.verifiedAt <= now
    && probe.canaryExpiresAt !== null
    && Number.isFinite(probe.canaryExpiresAt)
    && probe.canaryExpiresAt > now
  );
};

export const isVerifiedZeroCreditProbe = (probe: ProviderProbe, now = Date.now()): boolean => {
  return (
    probe.available
    && isFreshProviderProbe(probe, now)
    && probe.metered === false
    && probe.priceUsd === 0
    && probe.spendUsd === 0
    && probe.billingState === "verified-zero"
    && probe.zeroDollarStopGuaranteed === true
    && (probe.costClass === "cloud-open-weight" || probe.costClass === "local-model")
  );
};

export const selectZeroCreditProvider = (
  probes: readonly ProviderProbe[],
  now = Date.now(),
): ProviderProbe | null => {
  return probes.find((probe) => isVerifiedZeroCreditProbe(probe, now)) ?? null;
};

export const projectAssistantRespondCapability = (
  probe: ProviderProbe | null,
  now = Date.now(),
): AssistantCapabilityProjection => {
  if (probe === null) return { ...PENDING_PROJECTION };

  if (!probe.available) {
    return {
      ...PENDING_PROJECTION,
      provider: probe.providerId,
      providerReasonCode: boundedReason(probe.reasonCode, "provider-unavailable"),
    };
  }

  if (!isFreshProviderProbe(probe, now)) {
    return {
      ...PENDING_PROJECTION,
      provider: probe.providerId,
      providerReasonCode: "provider-canary-stale",
    };
  }

  if (!isVerifiedZeroCreditProbe(probe, now)) {
    return {
      ...PENDING_PROJECTION,
      provider: probe.providerId,
      providerReasonCode: "provider-zero-credit-unverified",
    };
  }

  return {
    capability: "assistant.respond",
    routable: true,
    enabled: true,
    provider: probe.providerId,
    workerIds: [],
    routingReason: null,
    providerReasonCode: null,
    evidenceLevel: "runtime-probe",
  };
};
