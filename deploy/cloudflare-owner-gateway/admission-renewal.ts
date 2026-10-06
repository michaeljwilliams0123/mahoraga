import { buildZeroCreditBillingAttestation, fetchZeroCreditBillingEvidence } from "../../src/cloudflare-zero-credit-billing.ts";

/** Lazy (in-request) renewal starts when less than this much canary lifetime remains. */
export const LAZY_RENEWAL_THRESHOLD_MS = 5 * 60_000;
/** Scheduled (cron) renewal keeps a wider margin so users rarely hit the lazy path. */
export const SCHEDULED_RENEWAL_MARGIN_MS = 30 * 60_000;
/** A known-fresh expiry is trusted this long before the attestation is re-read. */
export const FRESHNESS_CACHE_TTL_MS = 60_000;
/** After a failed renewal, further attempts are held back for a jittered cooldown. */
export const FAILURE_COOLDOWN_MS = 30_000;
export const RENEWAL_TIMEOUT_MS = 15_000;

export type RenewalTrigger = "lazy" | "scheduled";
export type RenewalOutcome =
  | { status: "skipped"; canaryExpiresAt: number | null }
  | { status: "renewed"; canaryExpiresAt: number | null }
  | { status: "unconfigured"; reason: string }
  | { status: "cooldown"; reason: string }
  | { status: "failed"; reason: string };

type RuntimeBinding = { fetch(request: Request): Promise<Response> };
export type AdmissionRenewalEnv = {
  MAHORAGA_EXECUTION_RUNTIME?: RuntimeBinding;
  PROVIDER_REFRESH_SECRET?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_BILLING_READ_TOKEN?: string;
};
type Logger = (record: Record<string, unknown>) => void;

const RUNTIME_ORIGIN = "https://mahoraga-execution-runtime";
const SAFE_REASON = /^[a-z0-9._-]{1,80}$/i;
const isSafeInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);

/** Pure threshold decision: renewal is due unless admitted, zero-credit, and fresher than `marginMs`. */
export function admissionRenewalDue(attestation: unknown, now: number, marginMs: number): boolean {
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) return true;
  const body = attestation as Record<string, unknown>;
  const provider = body.provider && typeof body.provider === "object" ? body.provider as Record<string, unknown> : {};
  const fresh = body.status === "ready"
    && provider.providerId === "cloudflare-workers-ai"
    && provider.admitted === true
    && provider.zeroCreditEligible === true
    && isSafeInteger(provider.verifiedAt)
    && isSafeInteger(provider.canaryExpiresAt)
    && provider.verifiedAt <= now
    && provider.canaryExpiresAt > now + marginMs;
  return !fresh;
}

function safeReason(value: unknown, fallback: string): string {
  return typeof value === "string" && SAFE_REASON.test(value) ? value : fallback;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type AdmissionRenewer = {
  renewIfDue(env: AdmissionRenewalEnv | undefined, trigger: RenewalTrigger, marginMs?: number): Promise<RenewalOutcome>;
  metrics(): { triggered: Record<RenewalTrigger, number>; renewed: number; failed: number; coalesced: number };
};

/**
 * Edge-native renewal. One in-flight attempt per isolate (singleflight); the runtime refresh endpoint
 * is itself serialized and newest-wins, so concurrent isolates are safe.
 */
export function createAdmissionRenewer(options: {
  now?: () => number;
  fetchImpl?: typeof fetch;
  log?: Logger;
  random?: () => number;
} = {}): AdmissionRenewer {
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const log: Logger = options.log ?? ((record) => console.log(JSON.stringify({ component: "mahoraga-owner-gateway", ...record })));
  const random = options.random ?? Math.random;
  let inFlight: Promise<RenewalOutcome> | null = null;
  let knownExpiry: { canaryExpiresAt: number; checkedAt: number } | null = null;
  let cooldownUntil = 0;
  let lastFailure = "renewal-failed";
  const counters = { triggered: { lazy: 0, scheduled: 0 }, renewed: 0, failed: 0, coalesced: 0 };

  async function attempt(env: AdmissionRenewalEnv, trigger: RenewalTrigger, marginMs: number): Promise<RenewalOutcome> {
    const binding = env.MAHORAGA_EXECUTION_RUNTIME as RuntimeBinding;
    const observedAt = now();
    const probe = await binding.fetch(new Request(`${RUNTIME_ORIGIN}/api/runtime/attestation`, { method: "GET", headers: { accept: "application/json", "cache-control": "no-store" } }));
    const attestation: unknown = await probe.json().catch(() => null);
    if (probe.status !== 200 && probe.status !== 503) throw new Error("attestation-unavailable");
    const provider = attestation && typeof attestation === "object" ? (attestation as { provider?: { canaryExpiresAt?: unknown } }).provider : undefined;
    const expiry = isSafeInteger(provider?.canaryExpiresAt) ? provider.canaryExpiresAt : null;
    if (!admissionRenewalDue(attestation, observedAt, marginMs)) {
      if (expiry !== null) knownExpiry = { canaryExpiresAt: expiry, checkedAt: observedAt };
      return { status: "skipped", canaryExpiresAt: expiry };
    }
    const accountId = (env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
    const apiToken = (env.CLOUDFLARE_API_TOKEN ?? "").trim();
    const refreshSecret = env.PROVIDER_REFRESH_SECRET ?? "";
    if (!/^[a-f0-9]{32}$/i.test(accountId) || !apiToken || !refreshSecret) return { status: "unconfigured", reason: "renewal-credentials-missing" };
    log({ event: "admission-renewal-triggered", trigger });
    counters.triggered[trigger] += 1;
    const evidence = await fetchZeroCreditBillingEvidence({
      accountId, deploymentToken: apiToken, billingReadToken: (env.CLOUDFLARE_BILLING_READ_TOKEN ?? "").trim(), fetchImpl,
    });
    const billing = buildZeroCreditBillingAttestation({ accountIdHash: await sha256Hex(accountId), ...evidence, now: now() });
    const response = await binding.fetch(new Request(`${RUNTIME_ORIGIN}/api/provider/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json", "cache-control": "no-store", "x-provider-refresh-token": refreshSecret },
      body: JSON.stringify({ billingAttestation: JSON.stringify(billing) }),
    }));
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (response.status !== 200 || body.zeroCreditEligible !== true) {
      throw new Error(safeReason(body.reasonCode ?? body.error, `provider-refresh-${response.status}`));
    }
    const renewedExpiry = isSafeInteger(body.canaryExpiresAt) ? body.canaryExpiresAt : null;
    if (renewedExpiry !== null) knownExpiry = { canaryExpiresAt: renewedExpiry, checkedAt: now() };
    log({ event: "admission-renewal-succeeded", trigger, canaryExpiresAt: renewedExpiry, verifiedAt: isSafeInteger(body.verifiedAt) ? body.verifiedAt : null });
    return { status: "renewed", canaryExpiresAt: renewedExpiry };
  }

  return {
    async renewIfDue(env, trigger, marginMs = trigger === "lazy" ? LAZY_RENEWAL_THRESHOLD_MS : SCHEDULED_RENEWAL_MARGIN_MS) {
      const binding = env?.MAHORAGA_EXECUTION_RUNTIME;
      if (!env || !binding || typeof binding.fetch !== "function") return { status: "unconfigured", reason: "execution-runtime-binding-missing" };
      const current = now();
      if (knownExpiry && current - knownExpiry.checkedAt < FRESHNESS_CACHE_TTL_MS && knownExpiry.canaryExpiresAt > current + marginMs) {
        return { status: "skipped", canaryExpiresAt: knownExpiry.canaryExpiresAt };
      }
      if (inFlight) { counters.coalesced += 1; return inFlight; }
      if (current < cooldownUntil) return { status: "cooldown", reason: lastFailure };
      const run = (async (): Promise<RenewalOutcome> => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const outcome = await Promise.race([
            attempt(env, trigger, marginMs),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("renewal-timeout")), RENEWAL_TIMEOUT_MS); }),
          ]);
          if (outcome.status === "renewed") counters.renewed += 1;
          if (outcome.status === "unconfigured") { lastFailure = outcome.reason; cooldownUntil = now() + 2 * FAILURE_COOLDOWN_MS; }
          return outcome;
        } catch (error) {
          lastFailure = safeReason(error instanceof Error ? error.message.split(":")[0] : null, "renewal-failed");
          cooldownUntil = now() + FAILURE_COOLDOWN_MS + Math.floor(random() * FAILURE_COOLDOWN_MS);
          counters.failed += 1;
          log({ event: "admission-renewal-failed", trigger, reason: lastFailure });
          return { status: "failed", reason: lastFailure };
        } finally { clearTimeout(timer); inFlight = null; }
      })();
      inFlight = run;
      return run;
    },
    metrics: () => ({ triggered: { ...counters.triggered }, renewed: counters.renewed, failed: counters.failed, coalesced: counters.coalesced }),
  };
}

export const admissionRenewer = createAdmissionRenewer();

/** Scheduled/native fallback entry point (cron trigger). Never throws. */
export async function performInlineAdmissionRenewal(env: AdmissionRenewalEnv | undefined, trigger: RenewalTrigger = "scheduled", renewer: AdmissionRenewer = admissionRenewer): Promise<RenewalOutcome> {
  return renewer.renewIfDue(env, trigger);
}
