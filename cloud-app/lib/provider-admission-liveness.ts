import type { RuntimeCapability } from "@/lib/runtime-relay";

export const PROVIDER_ADMISSION_RENEWAL_CADENCE = "2,7,12,17,22,27,32,37,42,47,52,57";
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
  const assistant = runtimeCapabilities.find((capability) => capability.capability === "assistant.respond") as AdmissionBearingCapability | undefined;
  if (!assistant) {
    const statusLabel = "Unobserved / fail-closed";
    const detail = [
      "Separate from /cycle health and deployment reachability",
      `renewal cadence every five minutes at ${PROVIDER_ADMISSION_RENEWAL_CADENCE} (offset from top-of-hour)`,
      "scheduled renewal isolated from deploy workflow concurrency",
      "authoritative assistant admission capability unobserved",
      "never invent live proof · not traffic authority",
    ].join(" · ");
    return {
      statusLabel,
      detail,
      telemetry: `${statusLabel} · cadence ${PROVIDER_ADMISSION_RENEWAL_CADENCE} · assistant.respond unobserved`,
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
    `renewal cadence every five minutes at ${PROVIDER_ADMISSION_RENEWAL_CADENCE} (offset from top-of-hour)`,
    "scheduled renewal isolated from deploy workflow concurrency",
    `${expiryLabel} · ${eligibility}`,
    `assistant.respond ${routeAdmitted ? "routable" : "unroutable"} · ${reason}`,
    "never invent live proof · not traffic authority",
  ].join(" · ");
  const telemetry = [
    statusLabel,
    `cadence ${PROVIDER_ADMISSION_RENEWAL_CADENCE}`,
    routeAdmitted ? "assistant.respond routable" : "assistant.respond unroutable",
    expiryLabel,
    eligibility,
    reason,
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
