import { pathToFileURL } from "node:url";

const API = "https://api.cloudflare.com/client/v4";
export const EXISTING_WORKER = "mahoraga-execution-broker";
export const CANARY_WORKER = "mahoraga-workers-management-canary";
const VALID_SHA = /^[a-f0-9]{40}$/;
const VALID_ACCOUNT = /^[a-f0-9]{32}$/;
const VALID_ID = /^[a-f0-9-]{12,100}$/i;

type Credentials = { accountId: string; token: string };
type DeployedVersion = { version_id: string; percentage: number };
type Deployment = { id: string; created_on: string; versions: [DeployedVersion] };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function requireCredentials(env: NodeJS.ProcessEnv): Credentials {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const token = String(env.CLOUDFLARE_WORKERS_MANAGEMENT_TOKEN ?? "").trim();
  if (!VALID_ACCOUNT.test(accountId) || token.length < 32 || /\s/.test(token)) {
    throw Error("management-credential-unavailable");
  }
  return { accountId, token };
}
async function readApi(credentials: Credentials, path: string, fetchImpl: typeof fetch): Promise<Record<string, unknown>> {
  let response: Response, envelope: Record<string, unknown> | null;
  try {
    response = await fetchImpl(API + path, {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(8_000),
      headers: { authorization: "Bearer " + credentials.token, accept: "application/json" },
    });
    envelope = record(await response.json());
  } catch {
    throw Error("management-api-unreachable");
  }
  const result = record(envelope?.result);
  if (!response.ok || envelope?.success !== true || !result) {
    throw Error("management-api-denied-" + response.status);
  }
  return result;
}
function isSingleDeployment(raw: unknown): raw is Deployment {
  const deployment = record(raw);
  const versions = Array.isArray(deployment?.versions) ? deployment.versions : [];
  const version = record(versions[0]);
  return !!deployment && VALID_ID.test(String(deployment.id ?? ""))
    && Number.isFinite(Date.parse(String(deployment.created_on ?? "")))
    && Date.parse(String(deployment.created_on)) <= Date.now() + 5_000
    && versions.length === 1 && !!version
    && VALID_ID.test(String(version.version_id ?? "")) && version.percentage === 100;
}
export async function verifyWorkersManagementToken(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
) {
  const credentials = requireCredentials(env);
  let tokenKind: "account" | "user" = "account";
  let verification: Record<string, unknown>;
  try {
    verification = await readApi(credentials, "/accounts/" + credentials.accountId + "/tokens/verify", fetchImpl);
  } catch {
    tokenKind = "user";
    verification = await readApi(credentials, "/user/tokens/verify", fetchImpl);
  }
  if (verification.status !== "active" || !VALID_ACCOUNT.test(String(verification.id ?? ""))) {
    throw Error("management-token-not-active");
  }
  const deployments = await readApi(credentials,
    "/accounts/" + credentials.accountId + "/workers/scripts/" + EXISTING_WORKER + "/deployments", fetchImpl);
  const current = Array.isArray(deployments.deployments) ? deployments.deployments[0] : null;
  if (!isSingleDeployment(current)) throw Error("management-worker-readback-unavailable");
  return Object.freeze({
    schemaVersion: 1, kind: "cloudflare-workers-management-token-proof", status: "verified-read-access",
    tokenKind, existingWorker: EXISTING_WORKER, workerReadConfirmed: true,
    editConfirmed: false, createConfirmed: false, deployConfirmed: false,
  });
}
export async function attestPrivateCanary(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
) {
  const credentials = requireCredentials(env);
  const expectedSha = String(env.VERIFIED_SHA ?? "").trim();
  if (!VALID_SHA.test(expectedSha)) throw Error("management-source-sha-invalid");
  const deployed = await readApi(credentials, "/accounts/" + credentials.accountId +
    "/workers/scripts/" + CANARY_WORKER + "/deployments", fetchImpl);
  const current = Array.isArray(deployed.deployments) ? deployed.deployments[0] : null;
  if (!isSingleDeployment(current)) throw Error("management-canary-deployment-invalid");
  const version = current.versions[0].version_id;
  const details = await readApi(credentials, "/accounts/" + credentials.accountId +
    "/workers/scripts/" + CANARY_WORKER + "/versions/" + version, fetchImpl);
  const bindings = record(details.resources)?.bindings;
  const binding = Array.isArray(bindings) ? record(bindings[0]) : null;
  if (details.id !== version || !Array.isArray(bindings) || bindings.length !== 1
    || binding?.name !== "TARGET_SHA" || binding.type !== "plain_text"
    || binding.text !== expectedSha) {
    throw Error("management-canary-provenance-mismatch");
  }
  return Object.freeze({
    schemaVersion: 1, kind: "cloudflare-workers-management-deployment-proof",
    status: "accepted", targetSha: expectedSha, worker: CANARY_WORKER,
    versionId: version, deploymentId: current.id, trafficPercent: 100,
    createOrUpdateSucceeded: true, deployConfirmed: true,
    publicRouteGranted: false, runtimeAuthorityGranted: false,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const command = process.argv[2];
    const result = command === "verify"
      ? await verifyWorkersManagementToken()
      : command === "attest" ? await attestPrivateCanary() : null;
    if (!result) throw Error("management-command-invalid");
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "management-probe-failed");
    process.exitCode = 1;
  }
}
