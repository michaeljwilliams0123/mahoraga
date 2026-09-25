import {
  ASSISTANT_MODEL_ID,
  ASSISTANT_PROVIDER_ID,
  parseZeroCreditProviderEnvelope,
  type ZeroCreditProviderConfig,
} from "./provider-invoker.ts";
import {
  isFreshProviderProbe,
  isVerifiedZeroCreditProbe,
  type ProviderProbe,
} from "./provider-policy.ts";

export interface ProviderStateProjection {
  providerId: string;
  available: boolean;
  zeroCreditEligible: boolean;
  reasonCode: string | null;
  observedAt: number;
  verifiedAt: number | null;
  canaryExpiresAt: number | null;
}

type DiagnosticStatus = "passed" | "failed" | "unknown" | "not-independently-observable" | "not-run";
export interface ProviderAdmissionDiagnostics {
  authentication: { status: DiagnosticStatus };
  routing: { status: DiagnosticStatus };
  dns: { status: DiagnosticStatus };
  modelAvailability: { status: DiagnosticStatus };
  gateway: { status: DiagnosticStatus };
  policy: { status: DiagnosticStatus };
  billing: { status: DiagnosticStatus };
  probeResponse: { status: DiagnosticStatus; httpStatus: number | null };
}

const objectValue = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

type BillingAttestation = { verifiedAt: number; expiresAt: number };

const parseBillingAttestation = (
  value: string,
  accountIdHash: string,
  now: number,
): BillingAttestation | null => {
  try {
    const record = objectValue(JSON.parse(value));
    const defaultUsageModel = record?.defaultUsageModel;
    if (
      record?.schemaVersion !== 1
      || record.evidenceSource !== "cloudflare-account-api"
      || record.accountIdHash !== accountIdHash
      || typeof defaultUsageModel !== "string"
      || !defaultUsageModel.trim()
      || defaultUsageModel.length > 64
      || record.billableAccountSubscriptionCount !== 0
      || !Number.isSafeInteger(record.verifiedAt)
      || !Number.isSafeInteger(record.expiresAt)
      || typeof record.verifiedAt !== "number"
      || typeof record.expiresAt !== "number"
      || record.verifiedAt > now
      || record.expiresAt <= now
      || record.expiresAt > record.verifiedAt + 90 * 60_000
    ) return null;
    return { verifiedAt: record.verifiedAt, expiresAt: record.expiresAt };
  } catch {
    return null;
  }
};

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

const statusForReason = (reasonCode: string | null): number | null => {
  if (reasonCode === "provider-authentication-failed") return 403;
  if (reasonCode === "provider-target-mismatch") return 412;
  if (reasonCode === "provider-free-quota-exhausted") return 429;
  if (reasonCode === "provider-model-response-invalid") return 502;
  if (reasonCode === "provider-model-unavailable") return 503;
  return null;
};

export const providerAdmissionDiagnostics = (reasonCode: string | null): ProviderAdmissionDiagnostics => {
  const httpStatus = statusForReason(reasonCode);
  if (reasonCode === null) {
    return {
      authentication: { status: "passed" },
      routing: { status: "passed" },
      dns: { status: "not-independently-observable" },
      modelAvailability: { status: "passed" },
      gateway: { status: "passed" },
      policy: { status: "passed" },
      billing: { status: "passed" },
      probeResponse: { status: "passed", httpStatus: 200 },
    };
  }
  const matrix: ProviderAdmissionDiagnostics = {
    authentication: { status: "unknown" },
    routing: { status: "unknown" },
    dns: { status: "not-independently-observable" },
    modelAvailability: { status: "unknown" },
    gateway: { status: "unknown" },
    policy: { status: "passed" },
    billing: { status: "passed" },
    probeResponse: { status: httpStatus === null ? "unknown" : "failed", httpStatus },
  };
  if (reasonCode === "provider-config-invalid") {
    matrix.policy.status = "failed";
    matrix.billing.status = "not-run";
    matrix.probeResponse.status = "not-run";
  } else if (reasonCode === "provider-billing-attestation-invalid") {
    matrix.billing.status = "failed";
    matrix.policy.status = "failed";
    matrix.probeResponse.status = "not-run";
  } else if (reasonCode === "provider-authentication-failed") {
    matrix.authentication.status = "failed";
    matrix.routing.status = "passed";
    matrix.gateway.status = "passed";
  } else if (reasonCode === "provider-target-mismatch") {
    matrix.authentication.status = "passed";
    matrix.routing.status = "failed";
    matrix.gateway.status = "passed";
  } else if (reasonCode === "provider-free-quota-exhausted") {
    matrix.authentication.status = "passed";
    matrix.routing.status = "passed";
    matrix.gateway.status = "passed";
    matrix.modelAvailability.status = "passed";
    matrix.policy.status = "failed";
  } else if (reasonCode === "provider-model-response-invalid" || reasonCode === "provider-model-unavailable") {
    matrix.authentication.status = "passed";
    matrix.routing.status = "passed";
    matrix.gateway.status = "passed";
    matrix.modelAvailability.status = "failed";
  } else if (reasonCode === "provider-endpoint-unavailable" || reasonCode === "provider-endpoint-unreachable") {
    matrix.routing.status = "failed";
    matrix.gateway.status = "failed";
  } else if (reasonCode === "provider-identity-mismatch") {
    matrix.authentication.status = "passed";
    matrix.routing.status = "passed";
    matrix.gateway.status = "passed";
    matrix.policy.status = "failed";
  } else if (reasonCode === "provider-zero-credit-unverified" || reasonCode === "provider-canary-stale") {
    matrix.authentication.status = "passed";
    matrix.routing.status = "passed";
    matrix.gateway.status = "passed";
    matrix.policy.status = "failed";
  }
  return matrix;
};

const reasonForHttpStatus = (status: number): string => {
  if (status === 401 || status === 403) return "provider-authentication-failed";
  if (status === 412) return "provider-target-mismatch";
  if (status === 429) return "provider-free-quota-exhausted";
  if (status === 502) return "provider-model-response-invalid";
  if (status === 503) return "provider-model-unavailable";
  return "provider-endpoint-unavailable";
};

export const probeZeroCreditProvider = async (
  config: ZeroCreditProviderConfig,
  billingAttestationValue: string,
  fetchImpl: typeof fetch = fetch,
  nowFn: () => number = Date.now,
): Promise<ProviderProbe> => {
  const now = nowFn();
  try {
    if (typeof config.token !== "string" || config.token.length < 32 || !/^[a-f0-9]{64}$/i.test(config.accountIdHash) || !/^[a-f0-9]{40}$/i.test(config.targetSha)) {
      return unavailableProbe(now, "provider-config-invalid");
    }
    const billingAttestation = parseBillingAttestation(billingAttestationValue, config.accountIdHash, now);
    if (billingAttestation === null) return unavailableProbe(now, "provider-billing-attestation-invalid");
    const response = await fetchImpl(providerUrl(config), {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ targetSha: config.targetSha, model: ASSISTANT_MODEL_ID }),
    });
    if (!response.ok) return unavailableProbe(now, reasonForHttpStatus(response.status));
    const body: unknown = await response.json();
    if (parseZeroCreditProviderEnvelope(body, config) === null) return unavailableProbe(now, "provider-identity-mismatch");
    const record = objectValue(body);
    const verifiedAt = record?.verifiedAt;
    const canaryExpiresAt = record?.canaryExpiresAt;
    const observedAt = record?.observedAt;
    if (
      record?.available !== true
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
      verifiedAt: Math.max(verifiedAt, billingAttestation.verifiedAt),
      canaryExpiresAt: Math.min(canaryExpiresAt, billingAttestation.expiresAt),
      reasonCode: null,
    };
  } catch {
    return unavailableProbe(now, "provider-endpoint-unreachable");
  }
};

export const providerStateFromProbe = (probe: ProviderProbe, now = Date.now()): ProviderStateProjection => {
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

export const providerStateForGap = (
  reasonCode: "provider-free-quota-exhausted",
  now = Date.now(),
): ProviderStateProjection => ({
  providerId: ASSISTANT_PROVIDER_ID,
  available: false,
  zeroCreditEligible: false,
  reasonCode,
  observedAt: now,
  verifiedAt: null,
  canaryExpiresAt: null,
});
