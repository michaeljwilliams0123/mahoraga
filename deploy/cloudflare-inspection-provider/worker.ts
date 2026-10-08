/** A bounded, read-only Cloudflare execution provider. No browser-selected URL, secrets or mutations. */
type RuntimeBinding = { fetch(request: Request): Promise<Response> };
export type InspectionEnv = { MAHORAGA_EXECUTION_RUNTIME?: RuntimeBinding; TARGET_SHA?: string };
const SHA = /^[a-f0-9]{40}$/;
const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function inspectRuntime(env: InspectionEnv): Promise<{ sha: string; durableState: string } | null> {
  if (!env.MAHORAGA_EXECUTION_RUNTIME || !SHA.test(env.TARGET_SHA ?? "")) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await env.MAHORAGA_EXECUTION_RUNTIME.fetch(new Request(
      "https://mahoraga-execution-runtime/api/ready",
      { method: "GET", signal: controller.signal, headers: { accept: "application/json" } },
    ));
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const value = payload as Record<string, unknown>;
    if (value.status !== "ready" || value.sha !== env.TARGET_SHA || value.durableState !== "cloudflare-do-sqlite") return null;
    return { sha: value.sha as string, durableState: value.durableState };
  } catch { return null; } finally { clearTimeout(timeout); }
}

function validReadLease(value: unknown, now: number): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const lease = value as Record<string, unknown>;
  const expiration = Date.parse(String(lease.expiresAt ?? ""));
  return lease.schemaVersion === 1 && lease.kind === "universal-route-lease"
    && lease.capability === "cloud.inspect" && lease.permissionClass === "read"
    && lease.provider === "cloudflare" && lease.workerId === "cloudflare-runtime-readonly"
    && typeof lease.routeLeaseId === "string" && /^lease-[a-f0-9]{16}$/.test(lease.routeLeaseId)
    && typeof lease.taskId === "string" && lease.taskId.length > 0
    && typeof lease.chainId === "string" && lease.chainId.length > 0
    && Array.isArray(lease.authorityScopes) && lease.authorityScopes.length === 1 && lease.authorityScopes[0] === "cloud:read"
    && Number.isFinite(expiration) && expiration > now && expiration <= now + 60_000;
}

export function createCloudReadOnlyProvider(env: InspectionEnv, now: () => number = Date.now) {
  return { async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/api/capabilities") {
      if (request.method !== "GET") return json({ error: "method-not-allowed" }, 405);
      const proof = await inspectRuntime(env);
      if (!proof) return json({ error: "cloud-inspection-runtime-not-ready" }, 503);
      const observedAt = now();
      return json({
        schemaVersion: 1, kind: "universal-worker-attestation",
        workerId: "cloudflare-runtime-readonly", provider: "cloudflare", locality: "cloudflare",
        observedAt: new Date(observedAt).toISOString(), expiresAt: new Date(observedAt + 45_000).toISOString(),
        observedLatencyMs: 0, queueDepth: 0, reliabilityScore: 1,
        capabilities: [{
          capability: "cloud.inspect", permissionClass: "read", healthy: true,
          zeroCreditEligible: true, costClass: "deterministic",
          dataClassesAllowed: ["enterprise"], authorityScopes: ["cloud:read"],
        }],
      });
    }
    if (path === "/api/execute") {
      if (request.method !== "POST") return json({ error: "method-not-allowed" }, 405);
      if (Number(request.headers.get("content-length") ?? 0) > 8192) return json({ error: "request-too-large" }, 413);
      let body: unknown;
      try { body = await request.json(); } catch { return json({ error: "request-invalid" }, 400); }
      const lease = body && typeof body === "object" && !Array.isArray(body) ? (body as { lease?: unknown }).lease : null;
      if (!validReadLease(lease, now())) return json({ error: "cloud-read-only-lease-rejected" }, 403);
      const proof = await inspectRuntime(env);
      if (!proof) return json({ error: "cloud-inspection-runtime-not-ready" }, 503);
      return json({ status: "complete", receipt: {
        schemaVersion: 1, kind: "cloud-read-only-runtime-inspection-receipt",
        id: lease.routeLeaseId, taskId: lease.taskId, chainId: lease.chainId,
        capability: "cloud.inspect", permissionClass: "read", provider: "cloudflare",
        runtimeSha: proof.sha, durableState: proof.durableState,
        observedAt: new Date(now()).toISOString(), verified: true, mutated: false, creditCost: 0,
      } });
    }
    return json({ error: "not-found" }, 404);
  } };
}
export default { fetch(request: Request, env: InspectionEnv) { return createCloudReadOnlyProvider(env).fetch(request); } } satisfies ExportedHandler<InspectionEnv>;
