import type { RuntimeCapability } from "@/lib/runtime-relay";

export const PROVIDER_ADMISSION_RENEWAL_CADENCE = "11,26,41,56";
export const PROVIDER_ADMISSION_SAFETY_MARGIN_MS = 60_000;

type AdmissionBearingCapability = RuntimeCapability & {
  canaryExpiresAt?: string | number | null;
  zeroCreditEligible?: boolean | null;
};

export type ProviderAdmissionLiveness = {
  statusLabel: string;
  detail: string;
  telemetry: string;
  tone: "good" | "warn" | "neutral";
  canaryExpiresAt: string | null;
  zeroCreditEligible: boolean | null;
};

function parseExpiry(value: unknown): { label: string | null; timestamp: number | null } {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? { label: date.toISOString(), timestamp: date.getTime() } : { label: null, timestamp: null };
  }
  if (typeof value === "string" && value.trim()) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? { label: value, timestamp } : { label: value, timestamp: null };
  }
  return { label: null, timestamp: null };
}

export function projectProviderAdmissionLiveness(
  runtimeCapabilities: readonly RuntimeCapability[],
  now = Date.now(),
): ProviderAdmissionLiveness {
  const renewalPolicy = [
    `dedicated owner-dispatchable quarter-hour workflow (${PROVIDER_ADMISSION_RENEWAL_CADENCE})`,
    "one-shot exact-main hard-zero renewal · Access-protected · 30-minute margin · never redeploys Workers",
    "deployment does not own scheduled renewal",
  ].join(" · ");
  const assistant = runtimeCapabilities.find((capability) => capability.capability === "assistant.respond") as AdmissionBearingCapability | undefined;
  if (!assistant) {
    const statusLabel = "Unobserved / fail-closed";
    const detail = [
      "Separate from /cycle health and deployment reachability",
      renewalPolicy,
      "authoritative assistant admission capability unobserved",
      "observational only · not runtime readiness · not production traffic authority · not traffic authority",
      "Railway remains zero-route, zero-influence, zero-fallback, and zero-authority",
      "never invent live proof",
    ].join(" · ");
    return {
      statusLabel,
      detail,
      telemetry: `${statusLabel} · ${renewalPolicy} · assistant.respond unobserved · observational only · not runtime readiness or production traffic authority`,
      tone: "neutral",
      canaryExpiresAt: null,
      zeroCreditEligible: null,
    };
  }

  const expiry = parseExpiry(assistant.canaryExpiresAt);
  const zeroCreditEligible = typeof assistant.zeroCreditEligible === "boolean" ? assistant.zeroCreditEligible : null;
  const routeAdmitted = assistant.routable === true && assistant.enabled !== false;
  const explicitAdmissionHealthy = zeroCreditEligible === true && expiry.timestamp !== null && expiry.timestamp > now + PROVIDER_ADMISSION_SAFETY_MARGIN_MS;
  const healthy = routeAdmitted && explicitAdmissionHealthy;
  const statusLabel = healthy ? "Current / admitted" : "Unavailable / fail-closed";
  const reason = assistant.providerReasonCode ?? assistant.routingReason ?? (healthy ? "runtime admission current" : "provider admission unavailable");
  const eligibility = zeroCreditEligible === null ? "explicit zeroCreditEligible proof unavailable" : `zeroCreditEligible ${String(zeroCreditEligible)}`;
  const expiryLabel = expiry.label === null ? "explicit canary freshness proof unavailable" : `canaryExpiresAt ${expiry.label}`;
  const detail = [
    "Separate from /cycle health and deployment reachability",
    renewalPolicy,
    `${expiryLabel} · ${eligibility}`,
    `assistant.respond ${routeAdmitted ? "routable" : "unroutable"} · ${reason}`,
    "observational only · not runtime readiness · not production traffic authority · not traffic authority",
    "Railway remains zero-route, zero-influence, zero-fallback, and zero-authority",
    "never invent live proof",
  ].join(" · ");
  const telemetry = [
    statusLabel,
    renewalPolicy,
    routeAdmitted ? "assistant.respond routable" : "assistant.respond unroutable",
    expiryLabel,
    eligibility,
    reason,
    "observational only · not runtime readiness or production traffic authority",
    "Railway remains zero-route, zero-influence, zero-fallback, and zero-authority",
  ].join(" · ");

  return {
    statusLabel,
    detail,
    telemetry,
    tone: healthy ? "good" : "warn",
    canaryExpiresAt: expiry.label,
    zeroCreditEligible,
  };
}
