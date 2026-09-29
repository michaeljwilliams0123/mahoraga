export const PROVIDER_ADMISSION_RENEWAL_CADENCE = "11,26,41,56";

export type ProviderAdmissionLiveness = {
  statusLabel: string;
  detail: string;
  telemetry: string;
  tone: "good" | "warn" | "neutral";
  canaryExpiresAt: string | null;
  zeroCreditEligible: boolean | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstString(records: Array<Record<string, unknown> | null>, key: string): string | null {
  for (const record of records) {
    const value = record?.[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstBoolean(records: Array<Record<string, unknown> | null>, key: string): boolean | null {
  for (const record of records) {
    const value = record?.[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}

export function projectProviderAdmissionLiveness(health: unknown): ProviderAdmissionLiveness {
  const root = asRecord(health);
  const nested = [
    root,
    asRecord(root?.providerAdmission),
    asRecord(root?.admission),
    asRecord(root?.runtime),
    asRecord(asRecord(root?.runtime)?.providerAdmission),
    asRecord(asRecord(root?.runtime)?.providerState),
    asRecord(root?.providerState),
  ];
  const canaryExpiresAt = firstString(nested, "canaryExpiresAt");
  const zeroCreditEligible = firstBoolean(nested, "zeroCreditEligible");
  const observed = canaryExpiresAt !== null || zeroCreditEligible !== null;
  const statusLabel = observed ? "Observed separately" : "Unobserved / fail-closed";
  const eligibility = zeroCreditEligible === null ? "zeroCreditEligible unobserved" : `zeroCreditEligible ${String(zeroCreditEligible)}`;
  const expiry = canaryExpiresAt === null ? "canaryExpiresAt unobserved" : `canaryExpiresAt ${canaryExpiresAt}`;
  const detail = [
    "Separate from /cycle health and deployment reachability",
    `renewal cadence quarter-hour ${PROVIDER_ADMISSION_RENEWAL_CADENCE} (not top-of-hour)`,
    "scheduled renewal isolated from deploy workflow concurrency",
    `${expiry} · ${eligibility}`,
    "never invent live proof · not traffic authority",
  ].join(" · ");
  const telemetry = [
    statusLabel,
    `cadence ${PROVIDER_ADMISSION_RENEWAL_CADENCE}`,
    "isolated from deploy concurrency",
    expiry,
    eligibility,
  ].join(" · ");
  return {
    statusLabel,
    detail,
    telemetry,
    tone: observed ? "good" : "neutral",
    canaryExpiresAt,
    zeroCreditEligible,
  };
}
