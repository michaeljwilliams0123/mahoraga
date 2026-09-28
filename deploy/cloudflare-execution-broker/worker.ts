import { adaptLegacyConnectorAttestation } from "./legacy-connector-adapter";
// @ts-ignore Runtime-neutral ESM broker core is shared with Node tests.
import { issueRouteLease, selectWorkerRoute, validateHandoff, validateWorkerAttestation } from "../../src/universal-execution-broker.mjs";

export type BrokerBinding = { fetch(request: Request): Promise<Response> };
type BrokerEnv = Partial<Pick<Env,
  "CONNECTOR_CAPABILITY_BROKER" | "REPOSITORY_PROVIDER" | "CLOUD_PROVIDER" | "INTEGRATION_PROVIDER" |
  "BROWSER_PROVIDER" | "DESKTOP_PROVIDER" | "CODEX_PROVIDER" | "MEMORY_PROVIDER" | "ARTIFACT_PROVIDER" |
  "IMAGE_PROVIDER" | "WORKSPACE_PROVIDER">>;

type UniversalAttestation = {
  schemaVersion: 1; kind: "universal-worker-attestation"; workerId: string; provider: string; locality: string;
  observedAt: string; expiresAt: string; observedLatencyMs?: number; queueDepth?: number; reliabilityScore?: number;
  capabilities: Array<Record<string, unknown>>;
};

const JSON_HEADERS = { "cache-control":"no-store", "content-type":"application/json; charset=utf-8" };
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const BINDINGS = ["REPOSITORY_PROVIDER","CLOUD_PROVIDER","INTEGRATION_PROVIDER","BROWSER_PROVIDER","DESKTOP_PROVIDER","CODEX_PROVIDER","MEMORY_PROVIDER","ARTIFACT_PROVIDER","IMAGE_PROVIDER","WORKSPACE_PROVIDER"] as const;

function bindingProviderNames(env: BrokerEnv): Set<string> {
  const providers = new Set<string>();
  if (env.REPOSITORY_PROVIDER) providers.add("github");
  if (env.CLOUD_PROVIDER) providers.add("cloudflare");
  if (env.INTEGRATION_PROVIDER) providers.add("composio");
  return providers;
}

async function fetchJson(binding: BrokerBinding, path: string): Promise<unknown | null> {
  try {
    const response = await binding.fetch(new Request(`https://mahoraga-provider${path}`, { headers:{accept:"application/json"} }));
    return response.ok ? await response.json() : null;
  } catch { return null; }
}
async function collectAttestations(env: BrokerEnv, now: number): Promise<UniversalAttestation[]> {
  const attestations: UniversalAttestation[] = [];
  for (const name of BINDINGS) {
    const binding = env[name] as BrokerBinding | undefined;
    if (!binding) continue;
    const value = await fetchJson(binding, "/api/capabilities");
    const candidates = value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as {attestations?: unknown[]}).attestations)
      ? (value as {attestations: unknown[]}).attestations : [value];
    for (const candidate of candidates) {
      if (validateWorkerAttestation(candidate, new Date(now)).ok) attestations.push(candidate as UniversalAttestation);
    }
  }
  if (env.CONNECTOR_CAPABILITY_BROKER) {
    const legacy = await fetchJson(env.CONNECTOR_CAPABILITY_BROKER as BrokerBinding, "/api/capabilities");
    attestations.push(...adaptLegacyConnectorAttestation(legacy, bindingProviderNames(env), now));
  }
  return attestations;
}

function projectRoutes(attestations: UniversalAttestation[], now: number) {
  const routes: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const attestation of attestations) {
    if (!validateWorkerAttestation(attestation, new Date(now)).ok) continue;
    for (const raw of attestation.capabilities) {
      const cap = raw as Record<string, unknown>;
      if (cap.healthy !== true || typeof cap.capability !== "string") continue;
      const key = `${cap.capability}/${attestation.provider}/${attestation.workerId}`;
      if (seen.has(key)) continue; seen.add(key);
      routes.push({ capability:cap.capability, routable:true, enabled:true, provider:attestation.provider,
        workerId:attestation.workerId, workerIds:[attestation.workerId], permissionClass:cap.permissionClass,
        costClass:cap.costClass, routingReason:null, providerReasonCode:null, evidenceLevel:"runtime-execution",
        lastObservedAt:attestation.observedAt, expiresAt:attestation.expiresAt });
    }
  }
  return routes;
}

async function routeRequest(env: BrokerEnv, input: unknown, now: number) {
  const attestations = await collectAttestations(env, now);
  const selected = selectWorkerRoute(input, attestations, new Date(now));
  if (!selected.ok) return { status:503, body:{ error:selected.reason } };
  const lease = issueRouteLease(input, selected.selected, new Date(now));
  return { status:200, body:{ lease, receipt:{ schemaVersion:1, kind:"route-selection-receipt", id:lease.selectionReceiptId,
    taskId:lease.taskId, chainId:lease.chainId, capability:lease.capability,
    selected:{ workerId:lease.workerId, provider:lease.provider }, eligibleWorkers:selected.eligible.map((item: {workerId:string}) => item.workerId) } } };
}
export function createExecutionBroker(env: BrokerEnv, nowFn: () => number = Date.now) {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const now = nowFn();
      if (url.pathname === "/api/capabilities") {
        if (request.method !== "GET") return json({ error:"method-not-allowed" }, 405);
        const attestations = await collectAttestations(env, now);
        return json({ schemaVersion:1, kind:"universal-capability-pool", observedAt:new Date(now).toISOString(), routes:projectRoutes(attestations, now) });
      }
      if (url.pathname === "/api/route") {
        if (request.method !== "POST") return json({ error:"method-not-allowed" }, 405);
        let input: unknown; try { input = await request.json(); } catch { return json({ error:"request-invalid" }, 400); }
        const result = await routeRequest(env, input, now);
        return json(result.body, result.status);
      }
      if (url.pathname === "/api/handoff") {
        if (request.method !== "POST") return json({ error:"method-not-allowed" }, 405);
        let body: {request?: unknown; handoff?: unknown; history?: unknown[]} = {};
        try { body = await request.json() as typeof body; } catch { return json({ error:"request-invalid" }, 400); }
        const handoff = validateHandoff(body.request, body.handoff, Array.isArray(body.history) ? body.history : [], new Date(now));
        if (!handoff.ok) return json({ error:handoff.reason }, 409);
        const result = await routeRequest(env, handoff.request, now);
        return json(result.body, result.status);
      }
      return json({ error:"not-found" }, 404);
    },
  };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return createExecutionBroker(env).fetch(request);
  },
} satisfies ExportedHandler<Env>;
