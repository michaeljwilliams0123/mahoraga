import { pathToFileURL } from "node:url";

type JsonStatus = {
  product?: string; version?: string; ok?: boolean;
  capabilities?: Array<{ capability?: string; availability?: string }>;
  deployment?: { provider?: string; commitSha?: string };
  boundaries?: { localDeviceMutationAllowed?: boolean };
};
type Observation = { status: number; url?: string; location?: string | null; body?: string; value?: JsonStatus | null; error?: string };
type ProbeFetch = (url: string, init?: RequestInit) => Promise<Response>;
type ProbeUrls = { pages: string; workspace: string; gateway: string };
const DEFAULTS: ProbeUrls = {
  pages: "https://michaeljwilliams0123.github.io/mahoraga/",
  workspace: "https://mahoraga-workspace-candidate.mahoraga-mjw0123.workers.dev",
  gateway: "https://mahoraga-owner-gateway.mahoraga-mjw0123.workers.dev",
};
const isSha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const excerpt = (value: unknown): string | null => typeof value === "string" ? value.slice(0, 128) : null;

async function request(fetchImpl: ProbeFetch, url: string, { json = false, manual = false }: { json?: boolean; manual?: boolean } = {}): Promise<Observation> {
  try {
    const response = await fetchImpl(url, {
      redirect: manual ? "manual" : "follow",
      headers: { accept: json ? "application/json" : "text/html" },
      signal: AbortSignal.timeout(5_000),
    });
    const body = (await response.text()).slice(0, 500_000);
    let value: JsonStatus | null = null;
    if (json) {
      try { value = JSON.parse(body) as JsonStatus; } catch { /* invalid JSON is an unavailable endpoint */ }
    }
    return { status: response.status, url: response.url || url, location: response.headers.get("location"), body, value };
  } catch (error) {
    return { status: 0, error: excerpt(error instanceof Error ? error.name : "request-failed") ?? "request-failed" };
  }
}

export function classifyGateway(observation: Observation): "access-protected" | "denied-unverified" | "access-boundary-unverified" {
  const location = observation.location;
  const validRedirect = typeof location === "string" && (() => {
    try {
      const url = new URL(location);
      return url.protocol === "https:" && url.hostname.endsWith(".cloudflareaccess.com");
    } catch { return false; }
  })();
  if (observation.status >= 300 && observation.status < 400 && validRedirect) return "access-protected";
  if (observation.status === 200 && /<title>Sign in.{0,35}Cloudflare Access<\/title>/i.test(observation.body || "")) return "access-protected";
  if ([401, 403].includes(observation.status)) return "denied-unverified";
  return "access-boundary-unverified";
}

export function classifyLocal(observation: Observation): "healthy" | "offline-or-degraded" {
  const data = observation.value;
  const health = Array.isArray(data?.capabilities) ? data.capabilities.find((item) => item?.capability === "system.health") : null;
  return observation.status === 200 && data?.product === "Mahoraga"
    && data?.version === "3.6.0" && health?.availability === "healthy"
    ? "healthy" : "offline-or-degraded";
}

export function classifyWorkspace(observation: Observation, sha: string | null = null): "verified-static-shell" | "workspace-unverified" {
  const d = observation.value;
  return observation.status === 200 && d?.ok === true && d?.product === "Mahoraga"
    && d?.deployment?.provider === "cloudflare-workers" && isSha(d?.deployment?.commitSha)
    && (!sha || d.deployment.commitSha === sha)
    && d?.boundaries?.localDeviceMutationAllowed === false
    ? "verified-static-shell" : "workspace-unverified";
}

export async function observeExecutionSurfaces({
  fetchImpl = fetch, expectedSha = null, urls = DEFAULTS,
}: { fetchImpl?: ProbeFetch; expectedSha?: string | null; urls?: ProbeUrls } = {}) {
  if (expectedSha != null && !isSha(expectedSha)) throw new TypeError("invalid-expected-sha");
  const [production, candidate, workspace, pages, gateway] = await Promise.all([
    request(fetchImpl, "http://127.0.0.1:4782/api/status", { json: true }),
    request(fetchImpl, "http://127.0.0.1:4783/api/status", { json: true }),
    request(fetchImpl, urls.workspace + "/api/health.json", { json: true }),
    request(fetchImpl, urls.pages),
    request(fetchImpl, urls.gateway + "/", { manual: true }),
  ]);
  const local = { "4782": classifyLocal(production), "4783": classifyLocal(candidate) };
  const staticWorkspace = classifyWorkspace(workspace, expectedSha);
  const pagesState = pages.status === 200 && /<title>Mahoraga<\/title>/i.test(pages.body || "") ? "reachable" : "unverified";
  const gatewayState = classifyGateway(gateway);
  return {
    observedAt: new Date().toISOString(),
    local,
    cloud: { workspace: staticWorkspace, pages: pagesState, ownerGateway: gatewayState,
      sha: isSha(workspace.value?.deployment?.commitSha) ? workspace.value.deployment.commitSha : null,
      authenticatedExecution: "not-tested", physicalMobileSession: "not-tested", brokerProvider: "not-observed" },
    probePassed: Object.values(local).every((s) => s === "healthy") && staticWorkspace === "verified-static-shell"
      && pagesState === "reachable" && gatewayState === "access-protected",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const shaArg = process.argv.indexOf("--sha");
  const expectedSha = shaArg >= 0 ? (process.argv[shaArg + 1] ?? null) : null;
  try {
    const result = await observeExecutionSurfaces({ expectedSha });
    console.log(JSON.stringify(result));
    if (!result.probePassed) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ error: excerpt(error instanceof Error ? error.message : "smoke-unavailable") }));
    process.exitCode = 1;
  }
}
