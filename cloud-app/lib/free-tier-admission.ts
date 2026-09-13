export type FreeTierAdmissionState = "available" | "missing" | "expired" | "exhausted";
export type FreeTierAdmission = { state: FreeTierAdmissionState; label: string; held: boolean; holdReason: string | null; observedAt: string | null; expiresAt: string | null; routeCount: number };

type QuotaAttestation = { status?: string | null; observedAt?: string | null; expiresAt?: string | null };
type CapabilityProjection = { billingClass: string | null; quotaAttestation: QuotaAttestation | null };

export function projectFreeTierAdmission(
  capabilities: unknown[] | null | undefined,
  now = Date.now(),
  routeHoldReason: string | null = null,
): FreeTierAdmission | null {
  const routes = (Array.isArray(capabilities) ? capabilities : [])
    .map(normalizeCapability)
    .filter((item): item is CapabilityProjection => item?.billingClass === "free-tier-zero");
  const explicitHold = routeHoldReason === "billing-not-zero-credit" ? routeHoldReason : null;
  if (routes.length === 0) {
    if (!explicitHold) return null;
    return {
      state: "missing",
      label: "Evidence missing",
      held: true,
      holdReason: explicitHold,
      observedAt: null,
      expiresAt: null,
      routeCount: 0,
    };
  }
  const evaluated = routes.map((route) => classify(route.quotaAttestation, now));
  const selected = evaluated.find((item) => item.state === "available")
    ?? evaluated.find((item) => item.state === "exhausted")
    ?? evaluated.find((item) => item.state === "expired")
    ?? evaluated[0];
  const labels: Record<FreeTierAdmissionState, string> = { available: "Free tier available", missing: "Evidence missing", expired: "Evidence expired", exhausted: "Free tier exhausted" };
  return {
    state: selected.state,
    label: labels[selected.state],
    held: selected.state !== "available" || explicitHold !== null,
    holdReason: explicitHold ?? (selected.state !== "available" ? `free-tier-${selected.state}` : null),
    observedAt: selected.observedAt,
    expiresAt: selected.expiresAt,
    routeCount: routes.length,
  };
}

function normalizeCapability(value: unknown): CapabilityProjection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const evidence = item.quotaAttestation;
  return {
    billingClass: typeof item.billingClass === "string" ? item.billingClass : null,
    quotaAttestation: evidence && typeof evidence === "object" && !Array.isArray(evidence) ? evidence as QuotaAttestation : null,
  };
}

function classify(value: QuotaAttestation | null, now: number) {
  const observedAt = typeof value?.observedAt === "string" ? value.observedAt : null;
  const expiresAt = typeof value?.expiresAt === "string" ? value.expiresAt : null;
  if (!value || typeof value.status !== "string") return { state: "missing" as const, observedAt, expiresAt };
  if (value.status === "exhausted") return { state: "exhausted" as const, observedAt, expiresAt };
  const observed = observedAt ? Date.parse(observedAt) : NaN;
  const expires = expiresAt ? Date.parse(expiresAt) : NaN;
  if (Number.isFinite(expires) && expires <= now) return { state: "expired" as const, observedAt, expiresAt };
  if (value.status !== "available" || !Number.isFinite(observed) || !Number.isFinite(expires) || observed > now || expires <= observed) return { state: "missing" as const, observedAt, expiresAt };
  return { state: "available" as const, observedAt, expiresAt };
}
