import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const REQUIRED = ["Verify (ubuntu-latest)", "Verify (windows-latest)"];

async function controller() {
  return import("../scripts/railway-exact-sha-promotion.mjs");
}

function successfulChecks(sha = SHA_A) {
  return REQUIRED.map((name) => ({ name, head_sha: sha, status: "completed", conclusion: "success", completed_at: "2026-09-14T20:00:00Z" }));
}

function baseGate(overrides = {}) {
  return {
    actor: "michaeljwilliams0123",
    repository: "michaeljwilliams0123/mahoraga",
    ref: "refs/heads/main",
    checkoutSha: SHA_A,
    currentMainSha: SHA_A,
    checkRuns: successfulChecks(),
    ...overrides,
  };
}

test("promotion gate admits only owner-triggered exact current main with both required checks", async () => {
  const { evaluatePromotionGate } = await controller();
  assert.deepEqual(evaluatePromotionGate(baseGate()), { ok: true, targetSha: SHA_A, reason: "promotion-authorized" });
  assert.equal(evaluatePromotionGate(baseGate({ actor: "github-actions[bot]" })).reason, "owner-required");
  assert.equal(evaluatePromotionGate(baseGate({ repository: "other/repo" })).reason, "repository-mismatch");
  assert.equal(evaluatePromotionGate(baseGate({ ref: "refs/heads/dev" })).reason, "main-ref-required");
  assert.equal(evaluatePromotionGate(baseGate({ currentMainSha: SHA_B })).reason, "stale-main-checkout");
});

test("promotion gate fails closed for missing, stale, pending, skipped, or failed checks", async () => {
  const { evaluatePromotionGate } = await controller();
  assert.equal(evaluatePromotionGate(baseGate({ checkRuns: successfulChecks().slice(0, 1) })).reason, "required-check-missing");
  assert.equal(evaluatePromotionGate(baseGate({ checkRuns: successfulChecks(SHA_B) })).reason, "required-check-stale");
  for (const [status, conclusion] of [["in_progress", null], ["completed", "skipped"], ["completed", "failure"]]) {
    const checks = successfulChecks();
    checks[1] = { ...checks[1], status, conclusion };
    assert.equal(evaluatePromotionGate(baseGate({ checkRuns: checks })).reason, "required-check-not-successful");
  }
});

test("workflow is manual owner-only, input-free, fixed, and zero-model", async () => {
  const source = await readFile(path.join(ROOT, ".github", "workflows", "railway-promote.yml"), "utf8");
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /workflow_run:\s*\n\s*workflows:\s*\["Verify Mahoraga"\]\s*\n\s*types:\s*\[completed\]/);
  assert.doesNotMatch(source, /\binputs\s*:/);
  assert.match(source, /github\.actor == github\.repository_owner/);
  assert.match(source, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(source, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(source, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(source, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(source, /github\.event\.workflow_run\.actor\.login == github\.repository_owner/);
  assert.match(source, /contents:\s*read/);
  assert.match(source, /checks:\s*read/);
  assert.match(source, /RAILWAY_PROJECT_TOKEN:\s*\$\{\{\s*secrets\.RAILWAY_PROJECT_TOKEN\s*\}\}/);
  assert.match(source, /MAHORAGA_PROMOTION_REF:\s*refs\/heads\/main/);
  assert.match(source, /MAHORAGA_PROMOTION_SHA:\s*\$\{\{\s*github\.event_name == 'workflow_run'/);
  assert.match(source, /node scripts\/railway-exact-sha-promotion\.mjs promote/);
  assert.match(source, /ref:\s*\$\{\{\s*github\.event_name == 'workflow_run'/);
  assert.doesNotMatch(source, /OPENAI|ANTHROPIC|MODEL|provider|schedule:|push:|pull_request:/i);
});

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}

test("Railway client uses only project-token auth and normalizes GraphQL errors", async () => {
  const { railwayRequest, normalizeRailwayError } = await controller();
  let observed;
  const fetchImpl = async (url, options) => {
    observed = { url, options, body: JSON.parse(options.body) };
    return response({ data: { ok: true } });
  };
  assert.deepEqual(await railwayRequest({ query: "query Q { ok }", variables: { a: 1 }, token: "project-token", fetchImpl }), { ok: true });
  assert.equal(observed.url, "https://backboard.railway.com/graphql/v2");
  assert.equal(observed.options.headers["Project-Access-Token"], "project-token");
  assert.equal(observed.options.headers.Authorization, undefined);
  assert.deepEqual(observed.body.variables, { a: 1 });

  await assert.rejects(
    railwayRequest({ query: "query Q { ok }", variables: {}, token: "project-token", fetchImpl: async () => response({ errors: [{ extensions: { code: "BAD_USER_INPUT", traceId: "trace-123" } }] }) }),
    (error) => { assert.deepEqual(normalizeRailwayError(error), { code: "BAD_USER_INPUT", traceId: "trace-123", status: 200 }); return true; },
  );
});

test("Railway HTTP 400 preserves sanitized GraphQL code and trace id", async () => {
  const { railwayRequest, normalizeRailwayError } = await controller();
  await assert.rejects(
    railwayRequest({
      query: "mutation M($input: VariableUpsertInput!) { variableUpsert(input: $input) }",
      variables: { input: {} },
      token: "project-token",
      fetchImpl: async () => response({ errors: [{ message: "Variable validation failed", extensions: { code: "BAD_USER_INPUT", traceId: "trace-400" } }] }, 400),
    }),
    (error) => { assert.deepEqual(normalizeRailwayError(error), { code: "BAD_USER_INPUT", traceId: "trace-400", status: 400 }); return true; },
  );
});
test("Railway mutations are fixed to expected SHA guard and exact commit deploy", async () => {
  const { upsertExpectedSha, deployExactSha, PROMOTION } = await controller();
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    calls.push(request);
    if (request.query.includes("variableUpsert")) return response({ data: { variableUpsert: true } });
    return response({ data: { serviceInstanceDeployV2: "deployment-123" } });
  };
  await upsertExpectedSha({ sha: SHA_A, token: "project-token", fetchImpl });
  assert.equal(calls[0].variables.input.name, "MAHORAGA_EXPECTED_GIT_SHA");
  assert.equal(calls[0].variables.input.value, SHA_A);
  assert.equal(calls[0].variables.input.skipDeploys, true);
  assert.equal(calls[0].variables.input.serviceId, PROMOTION.serviceId);
  const deploymentId = await deployExactSha({ sha: SHA_A, token: "project-token", fetchImpl });
  assert.equal(deploymentId, "deployment-123");
  assert.deepEqual(calls[1].variables, {
    serviceId: PROMOTION.serviceId,
    environmentId: PROMOTION.environmentId,
    commitSha: SHA_A,
  });
});

test("Railway promotion preflight reads canonical autodeploy posture", async () => {
  const { resolveAutoDeployStatus, PROMOTION } = await controller();
  let observed;
  const fetchImpl = async (_url, options) => {
    observed = JSON.parse(options.body);
    return response({ data: { serviceInstanceAutoDeployStatus: { enabled: false, canEnable: true, reason: null } } });
  };
  const status = await resolveAutoDeployStatus({ token: "project-token", fetchImpl });
  assert.deepEqual(status, { enabled: false, canEnable: true, reason: null });
  assert.match(observed.query, /serviceInstanceAutoDeployStatus/);
  assert.deepEqual(observed.variables, {
    projectId: PROMOTION.projectId,
    environmentId: PROMOTION.environmentId,
    serviceId: PROMOTION.serviceId,
  });
});
test("previous successful deployment uses an unfiltered bounded list and selects SUCCESS locally", async () => {
  const { resolvePreviousSuccessfulDeployment } = await controller();
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.variables.input.status, undefined);
    assert.match(request.query, /first:\s*10/);
    return response({ data: { deployments: { edges: [
      { node: { id: "dep-failed", status: "FAILED", meta: { commitHash: SHA_A } } },
      { node: { id: "dep-old", status: "SUCCESS", meta: { commitHash: SHA_B } } },
    ] } } });
  };
  assert.deepEqual(await resolvePreviousSuccessfulDeployment({ token: "project-token", fetchImpl }), { deploymentId: "dep-old", commitSha: SHA_B });

  await assert.rejects(
    resolvePreviousSuccessfulDeployment({ token: "project-token", fetchImpl: async () => response({ data: { deployments: { edges: [{ node: { id: "dep-old", status: "SUCCESS", meta: { commitHash: "main" } } }] } } }) }),
    /previous-deployment-invalid/,
  );
});

test("public probe requires live and ready HTTP 200, exact ready SHA, and zero model invocations", async () => {
  const { probeProduction, PROMOTION } = await controller();
  const goodFetch = async (url) => {
    if (url === `${PROMOTION.origin}/api/live`) return response({ state: "live", modelInvocations: 0 });
    if (url === `${PROMOTION.origin}/api/ready`) return response({ state: "ready", gitSha: SHA_A, modelInvocations: 0 });
    throw new Error("unexpected-url");
  };
  const good = await probeProduction({ expectedSha: SHA_A, fetchImpl: goodFetch });
  assert.equal(good.ok, true);
  assert.equal(good.ready.gitShaMatch, true);
  assert.equal(good.live.modelInvocationsZero, true);

  const paid = await probeProduction({ expectedSha: SHA_A, fetchImpl: async (url) => {
    if (url.endsWith("/api/live")) return response({ state: "live", modelInvocations: 1 });
    return response({ state: "ready", gitSha: SHA_A, modelInvocations: 0 });
  } });
  assert.equal(paid.ok, false);
  assert.equal(paid.reason, "live-model-invocations-nonzero");

  const stale = await probeProduction({ expectedSha: SHA_A, fetchImpl: async (url) => {
    if (url.endsWith("/api/live")) return response({ state: "live", modelInvocations: 0 });
    return response({ state: "ready", gitSha: SHA_B, modelInvocations: 0 });
  } });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "ready-sha-mismatch");
});

function orchestrationDeps(overrides = {}) {
  const calls = [];
  const deps = {
    now: () => "2026-09-14T22:00:00.000Z",
    resolveGitHubEvidence: async () => ({ currentMainSha: SHA_A, checkRuns: successfulChecks() }),
    resolveAutoDeployStatus: async () => ({ enabled: false, canEnable: true, reason: null }),
    resolvePreviousSuccessfulDeployment: async () => ({ deploymentId: "dep-old", commitSha: SHA_B }),
    probeProduction: async ({ expectedSha }) => ({ ok: expectedSha === SHA_B, reason: expectedSha === SHA_B ? null : "ready-sha-mismatch", live: { status: 200, modelInvocationsZero: true }, ready: { status: 200, gitShaMatch: expectedSha === SHA_B, modelInvocationsZero: true } }),
    upsertExpectedSha: async ({ sha }) => { calls.push(["upsert", sha]); return { updated: true, sha }; },
    deployExactShaResilient: async ({ sha }) => { calls.push(["deploy", sha]); return sha === SHA_A ? "dep-new" : "dep-rollback"; },
    waitForDeployment: async ({ deploymentId }) => { calls.push(["wait", deploymentId]); return { deploymentId, status: "SUCCESS" }; },
    ...overrides,
  };
  return { deps, calls };
}

function orchestrationInput() {
  return {
    actor: "michaeljwilliams0123",
    repository: "michaeljwilliams0123/mahoraga",
    ref: "refs/heads/main",
    checkoutSha: SHA_A,
    githubToken: "github-token",
    railwayToken: "project-token",
  };
}

test("promotion fails closed before deployment reads when Railway autodeploy is enabled", async () => {
  const { promoteExactMain } = await controller();
  let deploymentRead = false;
  const { deps } = orchestrationDeps({
    resolveAutoDeployStatus: async () => ({ enabled: true, canEnable: true, reason: null }),
    resolvePreviousSuccessfulDeployment: async () => { deploymentRead = true; return { deploymentId: "dep-old", commitSha: SHA_B }; },
  });
  const receipt = await promoteExactMain(orchestrationInput(), deps);
  assert.equal(receipt.state, "failed");
  assert.equal(receipt.errorCode, "railway-autodeploy-enabled");
  assert.equal(receipt.errorStage, "autodeploy-preflight");
  assert.equal(deploymentRead, false);
});
test("promotion receipt identifies an early Railway deployment-read failure stage", async () => {
  const { promoteExactMain } = await controller();
  const error = Object.assign(new Error("BAD_USER_INPUT"), { code: "BAD_USER_INPUT", status: 400 });
  const { deps } = orchestrationDeps({ resolvePreviousSuccessfulDeployment: async () => { throw error; } });
  const receipt = await promoteExactMain(orchestrationInput(), deps);
  assert.equal(receipt.state, "failed");
  assert.equal(receipt.errorCode, "BAD_USER_INPUT");
  assert.equal(receipt.errorStage, "previous-deployment-read");
});

test("promotion receipt identifies expected-SHA guard upsert failures", async () => {
  const { promoteExactMain } = await controller();
  const error = Object.assign(new Error("BAD_USER_INPUT"), { code: "BAD_USER_INPUT", status: 400 });
  const { deps } = orchestrationDeps({ upsertExpectedSha: async () => { throw error; } });
  const receipt = await promoteExactMain(orchestrationInput(), deps);
  assert.equal(receipt.state, "failed");
  assert.equal(receipt.errorCode, "BAD_USER_INPUT");
  assert.equal(receipt.errorStage, "expected-sha-upsert");
});
test("promotion is a no-op when production already serves exact verified main", async () => {
  const { promoteExactMain } = await controller();
  const { deps, calls } = orchestrationDeps({
    probeProduction: async () => ({ ok: true, reason: null, live: { status: 200, modelInvocationsZero: true }, ready: { status: 200, gitShaMatch: true, modelInvocationsZero: true } }),
  });
  const receipt = await promoteExactMain(orchestrationInput(), deps);
  assert.equal(receipt.state, "already-current");
  assert.equal(receipt.ok, true);
  assert.deepEqual(calls, []);
});

test("promotion mutates only the guard, exact-deploys target, waits, and verifies public readiness", async () => {
  const { promoteExactMain } = await controller();
  let probes = 0;
  const { deps, calls } = orchestrationDeps({
    probeProduction: async ({ expectedSha }) => {
      probes += 1;
      if (probes === 1) return { ok: false, reason: "ready-sha-mismatch", live: { status: 200, modelInvocationsZero: true }, ready: { status: 200, gitShaMatch: false, modelInvocationsZero: true } };
      return { ok: true, reason: null, live: { status: 200, modelInvocationsZero: true }, ready: { status: 200, gitShaMatch: expectedSha === SHA_A, modelInvocationsZero: true } };
    },
  });
  const receipt = await promoteExactMain(orchestrationInput(), deps);
  assert.equal(receipt.state, "promoted");
  assert.equal(receipt.ok, true);
  assert.equal(receipt.targetSha, SHA_A);
  assert.equal(receipt.previousSha, SHA_B);
  assert.equal(receipt.deploymentId, "dep-new");
  assert.deepEqual(calls, [["upsert", SHA_A], ["deploy", SHA_A], ["wait", "dep-new"]]);
});

test("post-upsert promotion failure restores and verifies the previous successful commit", async () => {
  const { promoteExactMain } = await controller();
  let probes = 0;
  const { deps, calls } = orchestrationDeps({
    probeProduction: async ({ expectedSha }) => {
      probes += 1;
      if (probes === 1) return { ok: false, reason: "ready-sha-mismatch", live: { status: 200, modelInvocationsZero: true }, ready: { status: 200, gitShaMatch: false, modelInvocationsZero: true } };
      if (expectedSha === SHA_A) return { ok: false, reason: "live-model-invocations-nonzero", live: { status: 200, modelInvocationsZero: false }, ready: { status: 200, gitShaMatch: true, modelInvocationsZero: true } };
      return { ok: true, reason: null, live: { status: 200, modelInvocationsZero: true }, ready: { status: 200, gitShaMatch: true, modelInvocationsZero: true } };
    },
  });
  const receipt = await promoteExactMain(orchestrationInput(), deps);
  assert.equal(receipt.state, "rolled-back");
  assert.equal(receipt.ok, false);
  assert.equal(receipt.errorCode, "live-model-invocations-nonzero");
  assert.equal(receipt.rollback.ok, true);
  assert.equal(receipt.rollback.deploymentId, "dep-rollback");
  assert.deepEqual(calls, [["upsert", SHA_A], ["deploy", SHA_A], ["wait", "dep-new"], ["upsert", SHA_B], ["deploy", SHA_B], ["wait", "dep-rollback"]]);
});

test("uncertain exact-deploy transport reconciles an existing matching deployment instead of retrying mutation", async () => {
  const { deployExactShaResilient } = await controller();
  let call = 0;
  const fetchImpl = async (_url, options) => {
    call += 1;
    const request = JSON.parse(options.body);
    if (call === 1) {
      assert.match(request.query, /serviceInstanceDeployV2/);
      throw new Error("connection-reset");
    }
    assert.match(request.query, /RecentDeployments/);
    return response({ data: { deployments: { edges: [{ node: { id: "dep-reconciled", status: "BUILDING", meta: { commitHash: SHA_A } } }] } } });
  };
  assert.equal(await deployExactShaResilient({ sha: SHA_A, token: "project-token", fetchImpl }), "dep-reconciled");
  assert.equal(call, 2);
});

test("failed rollback verification is explicit and never reported as recovered", async () => {
  const { promoteExactMain } = await controller();
  let probes = 0;
  const { deps } = orchestrationDeps({
    probeProduction: async ({ expectedSha }) => {
      probes += 1;
      if (probes === 1) return { ok: false, reason: "ready-sha-mismatch", live: { status: 200, modelInvocationsZero: true }, ready: { status: 200, gitShaMatch: false, modelInvocationsZero: true } };
      if (expectedSha === SHA_A) return { ok: false, reason: "ready-sha-mismatch", live: { status: 200, modelInvocationsZero: true }, ready: { status: 200, gitShaMatch: false, modelInvocationsZero: true } };
      return { ok: false, reason: "ready-http-not-ready", live: { status: 200, modelInvocationsZero: true }, ready: { status: 503, gitShaMatch: true, modelInvocationsZero: true } };
    },
  });
  const receipt = await promoteExactMain(orchestrationInput(), deps);
  assert.equal(receipt.state, "rollback-failed");
  assert.equal(receipt.ok, false);
  assert.equal(receipt.rollback.ok, false);
  assert.equal(receipt.rollback.errorCode, "rollback-probe-failed");
  assert.doesNotMatch(JSON.stringify(receipt), /github-token|project-token|connection-reset/);
});

test("promotion workflow and controller are protected release-baseline files", async () => {
  const { ESSENTIAL_FILES } = await import("../src/repair.mjs");
  assert.equal(ESSENTIAL_FILES.includes(".github/workflows/railway-promote.yml"), true);
  assert.equal(ESSENTIAL_FILES.includes("scripts/railway-exact-sha-promotion.mjs"), true);
});

test("Railway read retries honor Retry-After while mutations never retry", async () => {
  const { railwayRequest } = await controller();
  let reads = 0;
  const slept = [];
  const fetchRead = async () => {
    reads += 1;
    if (reads === 1) return { ...response({}, 429), headers: { get: (name) => name.toLowerCase() === "retry-after" ? "2" : null } };
    return response({ data: { ok: true } });
  };
  assert.deepEqual(await railwayRequest({ query: "query Q { ok }", variables: {}, token: "project-token", fetchImpl: fetchRead, sleepImpl: async (ms) => slept.push(ms) }), { ok: true });
  assert.equal(reads, 2);
  assert.deepEqual(slept, [2000]);

  let writes = 0;
  await assert.rejects(
    railwayRequest({ query: "mutation M { nope }", variables: {}, token: "project-token", fetchImpl: async () => { writes += 1; return response({}, 429); }, sleepImpl: async () => { throw new Error("mutation-must-not-sleep"); } }),
    /railway-http-error/,
  );
  assert.equal(writes, 1);
});
