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

export async function getDeploymentStatus({ deploymentId, token, fetchImpl = fetch }) {
  const query = `query Deployment($id: String!) { deployment(id: $id) { id status createdAt meta } }`;
  const data = await railwayRequest({ query, variables: { id: deploymentId }, token, fetchImpl });
  const node = data?.deployment;
  if (typeof node?.id !== "string" || typeof node?.status !== "string") throw coded("deployment-status-invalid");
  return { deploymentId: node.id, status: node.status, commitSha: isSha(node?.meta?.commitHash) ? node.meta.commitHash : null };
}

export async function waitForDeployment({ deploymentId, token, fetchImpl = fetch, sleepImpl = sleep, attempts = 36, delayMs = 5000 }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const observed = await getDeploymentStatus({ deploymentId, token, fetchImpl });
    if (observed.status === TERMINAL_SUCCESS) return observed;
    if (TERMINAL_FAILURES.has(observed.status)) throw coded(`deployment-${observed.status.toLowerCase()}`);
    if (attempt < attempts - 1) await sleepImpl(delayMs);
  }
  throw coded("deployment-timeout");
}

export async function reconcileDeploymentForCommit({ sha, token, fetchImpl = fetch }) {
  if (!isSha(sha)) throw coded("reconcile-sha-invalid");
  const query = `query RecentDeployments($input: DeploymentListInput!) {
    deployments(input: $input, first: 10) { edges { node { id status createdAt meta } } }
  }`;
  const data = await railwayRequest({
    query,
    variables: { input: { projectId: PROMOTION.projectId, environmentId: PROMOTION.environmentId, serviceId: PROMOTION.serviceId } },
    token,
    fetchImpl,
  });
  const nodes = (data?.deployments?.edges ?? []).map((edge) => edge?.node).filter(Boolean);
  const match = nodes.find((node) => node?.meta?.commitHash === sha && typeof node?.id === "string" && !TERMINAL_FAILURES.has(node?.status));
  return match ? { deploymentId: match.id, status: match.status } : null;
}

export async function deployExactShaResilient({ sha, token, fetchImpl = fetch }) {
  try {
    return await deployExactSha({ sha, token, fetchImpl });
  } catch (error) {
    if (normalizeRailwayError(error).code !== "railway-network-uncertain") throw error;
    const reconciled = await reconcileDeploymentForCommit({ sha, token, fetchImpl });
    if (!reconciled) throw error;
    return reconciled.deploymentId;
  }
}

export async function probeProduction({ expectedSha, fetchImpl = fetch }) {
  if (!isSha(expectedSha)) throw coded("probe-sha-invalid");
  const live = await publicProbe(`${PROMOTION.origin}/api/live`, fetchImpl);
  const ready = await publicProbe(`${PROMOTION.origin}/api/ready`, fetchImpl);
  const result = {
    ok: false,
    reason: null,
    live: { status: live.status, modelInvocationsZero: live.body?.modelInvocations === 0 },
    ready: {
      status: ready.status,
      gitShaMatch: ready.body?.gitSha === expectedSha,
      modelInvocationsZero: ready.body?.modelInvocations === 0,
    },
  };
  if (live.status !== 200) result.reason = "live-http-not-ready";
  else if (ready.status !== 200) result.reason = "ready-http-not-ready";
  else if (!result.live.modelInvocationsZero) result.reason = "live-model-invocations-nonzero";
  else if (!result.ready.modelInvocationsZero) result.reason = "ready-model-invocations-nonzero";
  else if (!result.ready.gitShaMatch) result.reason = "ready-sha-mismatch";
  else result.ok = true;
  return result;
}

async function publicProbe(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { method: "GET", redirect: "error", headers: { Accept: "application/json", "Cache-Control": "no-store" } });
  } catch {
    return { status: 0, body: null };
  }
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

function boundedProbe(probe) {
  if (!probe) return null;
  return {
    ok: probe.ok === true,
    reason: typeof probe.reason === "string" ? safeCode(probe.reason, "probe-failed") : null,
    live: probe.live ? { status: probe.live.status ?? null, modelInvocationsZero: probe.live.modelInvocationsZero === true } : null,
    ready: probe.ready ? {
      status: probe.ready.status ?? null,
      gitShaMatch: probe.ready.gitShaMatch === true,
      modelInvocationsZero: probe.ready.modelInvocationsZero === true,
    } : null,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function promotionDeps(overrides = {}) {
  return {
    now: () => new Date().toISOString(),
    resolveGitHubEvidence,
    resolvePreviousSuccessfulDeployment,
    probeProduction,
    upsertExpectedSha,
    deployExactShaResilient,
    waitForDeployment,
    ...overrides,
  };
}

export async function promoteExactMain(input, overrides = {}) {
  const deps = promotionDeps(overrides);
  const evidence = await deps.resolveGitHubEvidence({ token: input.githubToken, checkoutSha: input.checkoutSha });
  const gate = evaluatePromotionGate({
    actor: input.actor,
    repository: input.repository,
    ref: input.ref,
    checkoutSha: input.checkoutSha,
    currentMainSha: evidence.currentMainSha,
    checkRuns: evidence.checkRuns,
  });
  if (!gate.ok) return baseReceipt({ state: "blocked", ok: false, targetSha: input.checkoutSha, observedAt: deps.now(), errorCode: gate.reason });

  const previous = await deps.resolvePreviousSuccessfulDeployment({ token: input.railwayToken });
  const initialProbe = await deps.probeProduction({ expectedSha: gate.targetSha });
  if (initialProbe.ok) {
    return baseReceipt({ state: "already-current", ok: true, targetSha: gate.targetSha, previousSha: previous.commitSha, observedAt: deps.now(), probe: initialProbe });
  }

  let deploymentId = null;
  let guardChanged = false;
  try {
    await deps.upsertExpectedSha({ sha: gate.targetSha, token: input.railwayToken });
    guardChanged = true;
    deploymentId = await deps.deployExactShaResilient({ sha: gate.targetSha, token: input.railwayToken });
    await deps.waitForDeployment({ deploymentId, token: input.railwayToken });
    const finalProbe = await deps.probeProduction({ expectedSha: gate.targetSha });
    if (!finalProbe.ok) throw coded(finalProbe.reason ?? "production-probe-failed");
    return baseReceipt({
      state: "promoted",
      ok: true,
      targetSha: gate.targetSha,
      previousSha: previous.commitSha,
      deploymentId,
      observedAt: deps.now(),
      probe: finalProbe,
    });
  } catch (error) {
    const failure = normalizeRailwayError(error);
    if (!guardChanged) {
      return baseReceipt({ state: "failed", ok: false, targetSha: gate.targetSha, previousSha: previous.commitSha, deploymentId, observedAt: deps.now(), errorCode: failure.code });
    }
    const rollback = await rollbackToPrevious({ previousSha: previous.commitSha, railwayToken: input.railwayToken, deps });
    return baseReceipt({
      state: rollback.ok ? "rolled-back" : "rollback-failed",
      ok: false,
      targetSha: gate.targetSha,
      previousSha: previous.commitSha,
      deploymentId,
      observedAt: deps.now(),
      errorCode: failure.code,
      rollback,
    });
  }
}

async function rollbackToPrevious({ previousSha, railwayToken, deps }) {
  let deploymentId = null;
  try {
    await deps.upsertExpectedSha({ sha: previousSha, token: railwayToken });
    deploymentId = await deps.deployExactShaResilient({ sha: previousSha, token: railwayToken });
    await deps.waitForDeployment({ deploymentId, token: railwayToken });
    const probe = await deps.probeProduction({ expectedSha: previousSha });
    if (!probe.ok) throw coded("rollback-probe-failed");
    return { attempted: true, ok: true, deploymentId, errorCode: null, probe: boundedProbe(probe) };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      deploymentId,
      errorCode: normalizeRailwayError(error).code,
      probe: null,
    };
  }
}

function baseReceipt({ state, ok, targetSha, previousSha = null, deploymentId = null, observedAt, errorCode = null, probe = null, rollback = null }) {
  return {
    schemaVersion: 1,
    state,
    ok,
    targetSha: isSha(targetSha) ? targetSha : null,
    previousSha: isSha(previousSha) ? previousSha : null,
    deploymentId: typeof deploymentId === "string" ? deploymentId : null,
    observedAt,
    errorCode: typeof errorCode === "string" ? safeCode(errorCode, "promotion-failed") : null,
    probe: boundedProbe(probe),
    rollback: rollback ? {
      attempted: rollback.attempted === true,
      ok: rollback.ok === true,
      deploymentId: typeof rollback.deploymentId === "string" ? rollback.deploymentId : null,
      errorCode: typeof rollback.errorCode === "string" ? safeCode(rollback.errorCode, "rollback-failed") : null,
      probe: boundedProbe(rollback.probe),
    } : null,
  };
}

export async function runPromotionCli({ env = process.env, argv = process.argv.slice(2) } = {}) {
  if (argv.length !== 1 || argv[0] !== "promote") throw coded("promotion-command-invalid");
  for (const name of ["GITHUB_TOKEN", "RAILWAY_PROJECT_TOKEN", "GITHUB_ACTOR", "GITHUB_REPOSITORY", "GITHUB_REF", "GITHUB_SHA"]) {
    if (typeof env[name] !== "string" || env[name].length === 0) throw coded(`promotion-env-${name.toLowerCase()}-required`);
  }
  return promoteExactMain({
    actor: env.GITHUB_ACTOR,
    repository: env.GITHUB_REPOSITORY,
    ref: env.GITHUB_REF,
    checkoutSha: env.GITHUB_SHA,
    githubToken: env.GITHUB_TOKEN,
    railwayToken: env.RAILWAY_PROJECT_TOKEN,
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const receipt = await runPromotionCli();
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    if (!receipt.ok) process.exitCode = 1;
  } catch (error) {
    const failure = normalizeRailwayError(error);
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, state: "failed", ok: false, errorCode: failure.code, status: failure.status, traceId: failure.traceId })}\n`);
    process.exitCode = 1;
  }
}
