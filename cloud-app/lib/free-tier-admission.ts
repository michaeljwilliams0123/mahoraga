export type FreeTierAdmissionState = "available" | "missing" | "expired" | "exhausted";
export type FreeTierAdmission = { state: FreeTierAdmissionState; label: string; held: boolean; observedAt: string | null; expiresAt: string | null; routeCount: number };

type CapabilityLike = { billingClass?: string | null; quotaAttestation?: { status?: string | null; observedAt?: string | null; expiresAt?: string | null } | null };

export function projectFreeTierAdmission(capabilities: CapabilityLike[] | null | undefined, now = Date.now()): FreeTierAdmission | null {
  const routes = (Array.isArray(capabilities) ? capabilities : []).filter((item) => item.billingClass === "free-tier-zero");
  if (routes.length === 0) return null;
  const states = routes.map((route) => classify(route.quotaAttestation, now));
  const selected = states.find((item) => item.state === "available") ?? states.find((item) => item.state === "exhausted") ?? states.find((item) => item.state === "expired") ?? states[0];
  const labels: Record<FreeTierAdmissionState, string> = { available: "Free tier available", missing: "Evidence missing", expired: "Evidence expired", exhausted: "Free tier exhausted" };
  return { ...selected, label: labels[selected.state], held: selected.state !== "available", routeCount: routes.length };
}

function classify(value: CapabilityLike["quotaAttestation"], now: number) {
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
