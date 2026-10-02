import type { RuntimeCapability } from "@/lib/runtime-relay";

/** External watchdog offsets from #952; not a claim that GitHub schedules prove continuity. */
export const PROVIDER_ADMISSION_RENEWAL_CADENCE = "2,7,12,17,22,27,32,37,42,47,52,57";
export const PROVIDER_ADMISSION_RENEWAL_MARGIN_MS = 1_800_000;
export const PROVIDER_ADMISSION_SAFETY_MARGIN_MS = 60_000;

type AdmissionBearingCapability = RuntimeCapability & {
  verifiedAt?: string | number | null;
  canaryExpiresAt?: string | number | null;
  zeroCreditEligible?: boolean | null;
};

export type ProviderAdmissionLiveness = {
  statusLabel: string;
  detail: string;
  telemetry: string;
  tone: "good" | "warn" | "neutral";
  verifiedAt: string | null;
  canaryExpiresAt: string | null;
  zeroCreditEligible: boolean | null;
};

function parseTimestamp(value: unknown): { label: string | null; timestamp: number | null } {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
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
  const cadence = `external five-minute watchdog ${PROVIDER_ADMISSION_RENEWAL_CADENCE} (offsets away from top-of-hour)`;
  const margin = "skip billing re-attestation and provider probe only while more than 30 minutes of independently verified admission remains";
  const nonClaims = "persisted verifiedAt/canaryExpiresAt only · no self-attestation · no runtime Cron · Railway zero authority · schedule delay is not continuous freshness · not traffic authority";
  if (!assistant) {
    const statusLabel = "Unobserved / fail-closed";
    const detail = [
      "Separate from /cycle health and deployment reachability",
      cadence,
      margin,
      "authenticated exact-SHA runtime attestation inspected before renewal",
      "authoritative assistant admission capability unobserved",
      nonClaims,
    ].join(" · ");
    return {
      statusLabel,
      detail,
      telemetry: `${statusLabel} · cadence ${PROVIDER_ADMISSION_RENEWAL_CADENCE} · margin 1800000ms · assistant.respond unobserved`,
      tone: "neutral",
      verifiedAt: null,
      canaryExpiresAt: null,
      zeroCreditEligible: null,
    };
  }

  const verified = parseTimestamp(assistant.verifiedAt);
  const expiry = parseTimestamp(assistant.canaryExpiresAt);
  const zeroCreditEligible = typeof assistant.zeroCreditEligible === "boolean" ? assistant.zeroCreditEligible : null;
  const routeAdmitted = assistant.routable === true && assistant.enabled !== false;
  const explicitAdmissionHealthy = zeroCreditEligible === true && expiry.timestamp !== null && expiry.timestamp > now + PROVIDER_ADMISSION_SAFETY_MARGIN_MS && verified.timestamp !== null && verified.timestamp <= now;
  const marginHeld = explicitAdmissionHealthy && expiry.timestamp !== null && expiry.timestamp > now + PROVIDER_ADMISSION_RENEWAL_MARGIN_MS;
  const healthy = routeAdmitted && explicitAdmissionHealthy;
  const statusLabel = healthy ? (marginHeld ? "Margin held / admitted" : "Current / admitted") : "Unavailable / fail-closed";
  const reason = assistant.providerReasonCode ?? assistant.routingReason ?? (healthy ? "runtime admission current" : "provider admission unavailable");
  const eligibility = zeroCreditEligible === null ? "explicit zeroCreditEligible proof unavailable" : `zeroCreditEligible ${String(zeroCreditEligible)}`;
  const verifiedLabel = verified.label === null ? "explicit verifiedAt proof unavailable" : `verifiedAt ${verified.label}`;
  const expiryLabel = expiry.label === null ? "explicit canary freshness proof unavailable" : `canaryExpiresAt ${expiry.label}`;
  const detail = [
    "Separate from /cycle health and deployment reachability",
    cadence,
    margin,
    "fresh account billing proof still required before every actual renewal",
    `${verifiedLabel} · ${expiryLabel} · ${eligibility}`,
    `assistant.respond ${routeAdmitted ? "routable" : "unroutable"} · ${reason}`,
    nonClaims,
  ].join(" · ");
  const telemetry = [
    statusLabel,
    `cadence ${PROVIDER_ADMISSION_RENEWAL_CADENCE}`,
    `renewalMarginMs ${PROVIDER_ADMISSION_RENEWAL_MARGIN_MS}`,
    routeAdmitted ? "assistant.respond routable" : "assistant.respond unroutable",
    verifiedLabel,
    expiryLabel,
    eligibility,
    reason,
  ].join(" · ");

  return {
    statusLabel,
    detail,
    telemetry,
    tone: healthy ? "good" : "warn",
    verifiedAt: verified.label,
    canaryExpiresAt: expiry.label,
    zeroCreditEligible,
  };
}
