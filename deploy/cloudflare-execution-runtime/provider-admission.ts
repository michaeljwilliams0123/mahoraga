import {
  ASSISTANT_MODEL_ID,
  ASSISTANT_PROVIDER_ID,
  parseZeroCreditProviderEnvelope,
  type ZeroCreditProviderConfig,
} from "./provider-invoker";
import {
  isFreshProviderProbe,
  isVerifiedZeroCreditProbe,
  type ProviderProbe,
} from "./provider-policy";
import type { ProviderStateRecord } from "./storage";

const objectValue = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const unavailableProbe = (now: number, reasonCode: string): ProviderProbe => ({
  providerId: ASSISTANT_PROVIDER_ID,
  modelId: ASSISTANT_MODEL_ID,
  available: false,
  costClass: "cloud-open-weight",
  metered: false,
  priceUsd: 0,
  spendUsd: 0,
  billingState: "unknown",
  zeroDollarStopGuaranteed: false,
  observedAt: now,
  verifiedAt: null,
  canaryExpiresAt: null,
  reasonCode,
});

const providerUrl = (config: ZeroCreditProviderConfig): URL => {
  const origin = new URL(config.origin);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || (origin.pathname !== "/" && origin.pathname !== "")) {
    throw new Error("zero-credit-provider-origin-invalid");
  }
  return new URL("/api/probe", origin);
};

export const probeZeroCreditProvider = async (
  config: ZeroCreditProviderConfig,
  fetchImpl: typeof fetch = fetch,
  nowFn: () => number = Date.now,
): Promise<ProviderProbe> => {
  const now = nowFn();
  try {
    if (typeof config.token !== "string" || config.token.length < 32 || !/^[a-f0-9]{64}$/i.test(config.accountIdHash) || !/^[a-f0-9]{40}$/i.test(config.targetSha)) {
      return unavailableProbe(now, "provider-config-invalid");
    }
    const response = await fetchImpl(providerUrl(config), {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ targetSha: config.targetSha, model: ASSISTANT_MODEL_ID }),
    });
    if (!response.ok) {
      return unavailableProbe(now, response.status === 429 ? "provider-free-quota-exhausted" : "provider-probe-unavailable");
    }
    const body: unknown = await response.json();
    if (parseZeroCreditProviderEnvelope(body, config) === null) return unavailableProbe(now, "provider-identity-mismatch");
    const record = objectValue(body);
    const verifiedAt = record?.verifiedAt;
    const canaryExpiresAt = record?.canaryExpiresAt;
    const observedAt = record?.observedAt;
    if (
      record?.available !== true
      || record.metered !== false
      || record.priceUsd !== 0
      || record.spendUsd !== 0
      || record.billingState !== "verified-zero"
      || typeof observedAt !== "number"
      || typeof verifiedAt !== "number"
      || typeof canaryExpiresAt !== "number"
    ) return unavailableProbe(now, "provider-zero-credit-unverified");
    return {
      providerId: ASSISTANT_PROVIDER_ID,
      modelId: ASSISTANT_MODEL_ID,
      available: true,
      costClass: "cloud-open-weight",
      metered: false,
      priceUsd: 0,
      spendUsd: 0,
      billingState: "verified-zero",
      zeroDollarStopGuaranteed: true,
      observedAt,
      verifiedAt,
      canaryExpiresAt,
      reasonCode: null,
    };
  } catch {
    return unavailableProbe(now, "provider-probe-unavailable");
  }
};

export const providerStateFromProbe = (probe: ProviderProbe, now = Date.now()): ProviderStateRecord => {
  const eligible = isVerifiedZeroCreditProbe(probe, now);
  const reasonCode = eligible
    ? null
    : !probe.available
      ? (probe.reasonCode ?? "provider-unavailable")
      : !isFreshProviderProbe(probe, now)
        ? "provider-canary-stale"
        : "provider-zero-credit-unverified";
  return {
    providerId: probe.providerId,
    available: probe.available,
    zeroCreditEligible: eligible,
    reasonCode,
    observedAt: probe.observedAt,
    verifiedAt: probe.verifiedAt,
    canaryExpiresAt: probe.canaryExpiresAt,
  };
};
