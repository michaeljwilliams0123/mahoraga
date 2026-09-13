export type FreeTierAdmissionState = "available" | "missing" | "expired" | "exhausted";
export type FreeTierAdmission = { state: FreeTierAdmissionState; label: string; held: boolean; observedAt: string | null; expiresAt: string | null; routeCount: number };

type QuotaAttestation = { status?: string | null; observedAt?: string | null; expiresAt?: string | null };

export function projectFreeTierAdmission(capabilities: unknown[] | null | undefined, now = Date.now()): FreeTierAdmission | null {
  const routes = (Array.isArray(capabilities) ? capabilities : []).map(normalizeCapability).filter((item) => item?.billingClass === "free-tier-zero");
  if (routes.length === 0) return null;
  const states = routes.map((route) => classify(route?.quotaAttestation ?? null, now));
  const selected = states.find((item) => item.state === "available") ?? states.find((item) => item.state === "exhausted") ?? states.find((item) => item.state === "expired") ?? states[0];
  const labels: Record<FreeTierAdmissionState, string> = { available: "Free tier available", missing: "Evidence missing", expired: "Evidence expired", exhausted: "Free tier exhausted" };
  return { ...selected, label: labels[selected.state], held: selected.state !== "available", routeCount: routes.length };
}

function normalizeCapability(value: unknown): { billingClass: string | null; quotaAttestation: QuotaAttestation | null } | null {
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
