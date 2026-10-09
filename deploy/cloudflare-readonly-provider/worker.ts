/** Dedicated, private, read-only Cloudflare provider for the existing execution broker.
 * Never accepts browser tokens, arbitrary endpoints, write methods, or broad Cloudflare scopes.
 */
export type InspectorEnv = {
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_AUDIT_TOKEN?: string;
};
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type InspectorOptions = { fetchImpl?: Fetcher; now?: () => number };
type CloudflareDeployment = { id: string; createdOn: string; versionId: string; percentage: number; observedAtMs: number };
const SCRIPTS = new Set(["mahoraga-owner-gateway", "mahoraga-execution-runtime", "mahoraga-execution-broker"]);
const CAPABILITY = "cloud.inspect";
const PROVIDER = "cloudflare";
const WORKER = "cloudflare-readonly-inspector";
const SCOPE = "cloud:read";
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (body: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const record = (x: unknown): Record<string, unknown> | null =>
  x !== null && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : null;
const keys = (x: Record<string, unknown>, expected: string[]) =>
  Object.keys(x).length === expected.length && expected.every((key) => Object.hasOwn(x, key));
const safeId = (s: unknown) => typeof s === "string" && /^[a-zA-Z0-9_-]{1,160}$/.test(s);
const safeCloudId = (s: unknown) => typeof s === "string" && /^[a-zA-Z0-9-]{12,100}$/.test(s);
const configured = (env: InspectorEnv) =>
  typeof env.CLOUDFLARE_ACCOUNT_ID === "string" && /^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID)
  && typeof env.CLOUDFLARE_AUDIT_TOKEN === "string" && env.CLOUDFLARE_AUDIT_TOKEN.trim().length >= 32;

/** A real, successful account API read is required to advertise a provider capability. */
async function readDeployment(env: InspectorEnv, script: string, fetchImpl: Fetcher, now: () => number): Promise<CloudflareDeployment | null> {
  if (!configured(env) || !SCRIPTS.has(script)) return null;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${script}/deployments`;
  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers: { authorization: `Bearer ${env.CLOUDFLARE_AUDIT_TOKEN}`, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const body = record(await response.json());
    const result = record(body?.result);
    const deployments = result?.deployments;
    if (body?.success !== true || !Array.isArray(deployments) || !deployments.length) return null;
    const first = record(deployments[0]);
    if (!first || !safeCloudId(first.id) || typeof first.created_on !== "string") return null;
    const deployedAtMs = Date.parse(first.created_on);
    const observedAtMs = now();
    // Match the browser receipt validator: fail closed on deployments dated >5s after observation.
    if (!Number.isFinite(deployedAtMs) || !Number.isFinite(observedAtMs)
      || deployedAtMs > observedAtMs + 5_000) return null;
    const versions = first.versions;
    if (!Array.isArray(versions) || versions.length !== 1) return null; // no split-traffic ambiguity in first milestone
    const version = record(versions[0]);
    if (!version || !safeCloudId(version.version_id) || version.percentage !== 100) return null;
    return { id: first.id as string, createdOn: first.created_on, versionId: version.version_id as string,
      percentage: 100, observedAtMs };
  } catch { return null; }
}
function validLease(raw: unknown, now: number): boolean {
  const lease = record(raw);
  if (!lease || !keys(lease, ["schemaVersion", "kind", "routeLeaseId", "selectionReceiptId",
    "taskId", "chainId", "workerId", "provider", "capability", "permissionClass", "authorityScopes", "expiresAt"])) return false;
  const expiry = typeof lease.expiresAt === "string" ? Date.parse(lease.expiresAt) : NaN;
  return lease.schemaVersion === 1 && lease.kind === "universal-route-lease"
    && typeof lease.routeLeaseId === "string" && /^lease-[a-f0-9]{16}$/.test(lease.routeLeaseId)
    && typeof lease.selectionReceiptId === "string" && /^sel-[a-f0-9]{16}$/.test(lease.selectionReceiptId)
    && safeId(lease.taskId) && safeId(lease.chainId) && lease.workerId === WORKER
    && lease.provider === PROVIDER && lease.capability === CAPABILITY && lease.permissionClass === "read"
    && Array.isArray(lease.authorityScopes) && lease.authorityScopes.length === 1 && lease.authorityScopes[0] === SCOPE
    && Number.isFinite(expiry) && expiry > now && expiry <= now + 60_000;
}
export function createReadonlyCloudflareProvider(env: InspectorEnv, { fetchImpl = fetch, now = Date.now }: InspectorOptions = {}) {
  return {
    async fetch(request: Request): Promise<Response> {
      const path = new URL(request.url).pathname;
      if (path === "/api/capabilities") {
        if (request.method !== "GET") return json({ error: "method-not-allowed" }, 405);
        const proof = await readDeployment(env, "mahoraga-owner-gateway", fetchImpl, now);
        if (!proof) return json({ attestations: [] }, 200);
        const observed = proof.observedAtMs;
        return json({ attestations: [{
          schemaVersion: 1, kind: "universal-worker-attestation",
          workerId: WORKER, provider: PROVIDER, locality: "cloudflare",
          observedAt: new Date(observed).toISOString(), expiresAt: new Date(observed + 30_000).toISOString(),
          capabilities: [{ capability: CAPABILITY, permissionClass: "read", healthy: true,
            zeroCreditEligible: true, costClass: "deterministic",
            dataClassesAllowed: ["synthetic", "personal", "enterprise"], authorityScopes: [SCOPE] }],
        }] });
      }
      if (path !== "/api/execute") return json({ error: "not-found" }, 404);
      if (request.method !== "POST") return json({ error: "method-not-allowed" }, 405);
      if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) return json({ error: "invalid-request" }, 415);
      const raw = await request.text();
      if (raw.length > 4096) return json({ error: "invalid-request" }, 413);
      let body: Record<string, unknown> | null;
      try { body = record(JSON.parse(raw)); } catch { body = null; }
      if (!body || !keys(body, ["lease", "payload", "evidenceRefs"])) return json({ error: "invalid-request" }, 400);
      if (!validLease(body.lease, now())) return json({ error: "authority-lease-invalid" }, 403);
      const payload = record(body.payload);
      if (!payload || !keys(payload, ["script"]) || typeof payload.script !== "string" || !SCRIPTS.has(payload.script)
        || !Array.isArray(body.evidenceRefs) || body.evidenceRefs.length > 8 || !body.evidenceRefs.every(safeId)) {
        return json({ error: "inspection-target-invalid" }, 403);
      }
      const proof = await readDeployment(env, payload.script, fetchImpl, now);
      if (!proof) return json({ error: "provider-observation-unavailable" }, 503);
      const lease = body.lease as Record<string, unknown>;
      return json({ status: "complete", receipt: {
        id: `cloud-inspect-${lease.routeLeaseId}`, verified: true,
        capability: CAPABILITY, provider: PROVIDER, workerId: WORKER,
        taskId: lease.taskId, chainId: lease.chainId, routeLeaseId: lease.routeLeaseId,
        selectionReceiptId: lease.selectionReceiptId,
        script: payload.script, deploymentId: proof.id, versionId: proof.versionId,
        deployedAt: proof.createdOn, trafficPercentage: proof.percentage,
        observedAt: new Date(proof.observedAtMs).toISOString(), readOnly: true,
      } });
    },
  };
}
export default {
  fetch(request: Request, env: InspectorEnv): Promise<Response> {
    return createReadonlyCloudflareProvider(env).fetch(request);
  },
} satisfies { fetch(request: Request, env: InspectorEnv): Promise<Response> };
