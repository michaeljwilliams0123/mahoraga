import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROMOTION = Object.freeze({
  owner: "michaeljwilliams0123",
  repository: "michaeljwilliams0123/mahoraga",
  ref: "refs/heads/main",
  projectId: "e644391a-9698-4026-b5e1-a28e07cfaf82",
  environmentId: "fb266d3a-7214-47d5-a1a4-d615df3f1e6c",
  serviceId: "0498b161-a6b7-4750-8c54-8c99e0167fa7",
  origin: "https://mahoraga-runtime-main-production.up.railway.app",
  expectedShaVariable: "MAHORAGA_EXPECTED_GIT_SHA",
  requiredChecks: Object.freeze(["Verify (ubuntu-latest)", "Verify (windows-latest)"]),
});

const GITHUB_API = "https://api.github.com";
const RAILWAY_API = "https://backboard.railway.com/graphql/v2";
const SHA_RE = /^[a-f0-9]{40}$/i;
const TERMINAL_FAILURES = new Set(["FAILED", "CRASHED", "REMOVED", "SKIPPED"]);
const TERMINAL_SUCCESS = "SUCCESS";

export function evaluatePromotionGate(input) {
  if (input?.actor !== PROMOTION.owner) return denied("owner-required");
  if (input?.repository !== PROMOTION.repository) return denied("repository-mismatch");
  if (input?.ref !== PROMOTION.ref) return denied("main-ref-required");
  if (!isSha(input?.checkoutSha) || !isSha(input?.currentMainSha)) return denied("main-sha-invalid");
  if (input.checkoutSha !== input.currentMainSha) return denied("stale-main-checkout");

  for (const name of PROMOTION.requiredChecks) {
    const named = (input.checkRuns ?? []).filter((run) => run?.name === name);
    if (named.length === 0) return denied("required-check-missing");
    const exact = named.filter((run) => run?.head_sha === input.checkoutSha);
    if (exact.length === 0) return denied("required-check-stale");
    const latest = exact.toSorted(compareCheckRecency).at(-1);
    if (latest?.status !== "completed" || latest?.conclusion !== "success") {
      return denied("required-check-not-successful");
    }
  }
  return { ok: true, targetSha: input.checkoutSha, reason: "promotion-authorized" };
}

function compareCheckRecency(a, b) {
  const at = Date.parse(a?.completed_at ?? a?.started_at ?? "") || Number(a?.id ?? 0);
  const bt = Date.parse(b?.completed_at ?? b?.started_at ?? "") || Number(b?.id ?? 0);
  return at - bt;
}

function denied(reason) {
  return { ok: false, targetSha: null, reason };
}

function isSha(value) {
  return typeof value === "string" && SHA_RE.test(value);
}

export function normalizeRailwayError(error) {
  return {
    code: safeCode(error?.code, "railway-request-failed"),
    traceId: safeTraceId(error?.traceId),
    status: Number.isInteger(error?.status) ? error.status : null,
  };
}

function safeCode(value, fallback) {
  return typeof value === "string" && /^[a-zA-Z0-9._-]{1,96}$/.test(value) ? value : fallback;
}

function safeTraceId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9._-]{1,128}$/.test(value) ? value : null;
}

export async function railwayRequest({ query, variables, token, fetchImpl = fetch }) {
  if (typeof token !== "string" || token.length < 8) throw coded("railway-token-required");
  let response;
  try {
    response = await fetchImpl(RAILWAY_API, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "Project-Access-Token": token,
        "User-Agent": "mahoraga-railway-promoter",
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    throw Object.assign(coded("railway-network-uncertain"), { cause: error });
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(coded("railway-http-error"), { status: response.status });
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    const first = payload.errors[0] ?? {};
    throw Object.assign(coded("railway-graphql-error"), {
      code: safeCode(first?.extensions?.code, "railway-graphql-error"),
      traceId: safeTraceId(first?.extensions?.traceId),
      status: response.status,
    });
  }
  if (!payload || typeof payload.data !== "object") throw coded("railway-response-invalid");
  return payload.data;
}

async function githubJson(url, token, fetchImpl = fetch) {
  if (typeof token !== "string" || token.length < 8) throw coded("github-token-required");
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "error",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "mahoraga-railway-promoter",
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(coded("github-http-error"), { status: response.status });
  return payload;
}

export async function resolveGitHubEvidence({ token, checkoutSha, fetchImpl = fetch }) {
  const branch = await githubJson(`${GITHUB_API}/repos/${PROMOTION.repository}/git/ref/heads/main`, token, fetchImpl);
  const currentMainSha = branch?.object?.sha;
  const checks = await githubJson(`${GITHUB_API}/repos/${PROMOTION.repository}/commits/${checkoutSha}/check-runs?filter=latest&per_page=100`, token, fetchImpl);
  return { currentMainSha, checkRuns: Array.isArray(checks?.check_runs) ? checks.check_runs : [] };
}

export async function resolvePreviousSuccessfulDeployment({ token, fetchImpl = fetch }) {
  const query = `query LatestDeployment($input: DeploymentListInput!) {
    deployments(input: $input, first: 1) { edges { node { id status createdAt meta } } }
  }`;
  const data = await railwayRequest({
    query,
    variables: {
      input: {
        projectId: PROMOTION.projectId,
        environmentId: PROMOTION.environmentId,
        serviceId: PROMOTION.serviceId,
        status: { successfulOnly: true },
      },
    },
    token,
    fetchImpl,
  });
  const node = data?.deployments?.edges?.[0]?.node;
  const commitSha = node?.meta?.commitHash;
  if (typeof node?.id !== "string" || !isSha(commitSha)) throw coded("previous-deployment-invalid");
  return { deploymentId: node.id, commitSha };
}

export async function upsertExpectedSha({ sha, token, fetchImpl = fetch }) {
  if (!isSha(sha)) throw coded("expected-sha-invalid");
  const query = `mutation ExpectedSha($input: VariableUpsertInput!) { variableUpsert(input: $input) }`;
  await railwayRequest({
    query,
    variables: {
      input: {
        projectId: PROMOTION.projectId,
        environmentId: PROMOTION.environmentId,
        serviceId: PROMOTION.serviceId,
        name: PROMOTION.expectedShaVariable,
        value: sha,
        skipDeploys: true,
      },
    },
    token,
    fetchImpl,
  });
  return { updated: true, sha };
}

export async function deployExactSha({ sha, token, fetchImpl = fetch }) {
  if (!isSha(sha)) throw coded("deploy-sha-invalid");
  const query = `mutation DeployExact($serviceId: String!, $environmentId: String!, $commitSha: String!) {
    serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId, commitSha: $commitSha)
  }`;
  const data = await railwayRequest({
    query,
    variables: { serviceId: PROMOTION.serviceId, environmentId: PROMOTION.environmentId, commitSha: sha },
    token,
    fetchImpl,
  });
  const deploymentId = data?.serviceInstanceDeployV2;
  if (typeof deploymentId !== "string" || deploymentId.length < 8) throw coded("deployment-id-invalid");
  return deploymentId;
}

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
