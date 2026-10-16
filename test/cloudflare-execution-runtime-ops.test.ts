import assert from "node:assert/strict";
import * as runtimeOperator from "../scripts/cloudflare-execution-runtime.ts";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  assertDeployableSource,
  buildWranglerDeployArgs,
  runAcceptanceProbe,
  waitForExactRuntimeConvergence,
} from "../scripts/cloudflare-execution-runtime.ts";

const SHA = "6a1d51e25654eb7a5c22bab7a1c2dcaca522c2af";
const OTHER_SHA = "7cb8aab1129875f798347afdb2844f963e986a65";
const BASE_URL = "https://mahoraga-execution-runtime.mahoraga-mjw0123.workers.dev";
const readyBody = (sha: string) => ({ status: "ready", sha, durableState: "cloudflare-do-sqlite" });
const attestationResponse = () => Response.json({
  schemaVersion: 1,
  kind: "mahoraga-runtime-attestation",
  status: "ready",
  targetSha: SHA,
  runtime: "cloudflare-worker",
  durableState: "cloudflare-do-sqlite",
  trafficAuthority: "cloudflare",
  railwayRoutingEnabled: false,
  railwayInfluence: false,
  provider: { providerId: "cloudflare-workers-ai", admitted: true, zeroCreditEligible: true },
}, { headers: { server: "cloudflare", "cf-ray": "test-ray-IAD" } });
const scriptPath = fileURLToPath(new URL("../scripts/cloudflare-execution-runtime.ts", import.meta.url));

test("Cloudflare execution runtime has one governed deployment/acceptance operator", () => {
  assert.equal(existsSync(scriptPath), true);
});

test("deployment admission requires clean exact authoritative main", () => {
  assert.doesNotThrow(() => assertDeployableSource({
    targetSha: SHA,
    headSha: SHA,
    remoteMainSha: SHA,
    statusPorcelain: "",
  }));

  assert.throws(() => assertDeployableSource({
    targetSha: SHA,
    headSha: OTHER_SHA,
    remoteMainSha: SHA,
    statusPorcelain: "",
  }), /deploy-head-mismatch/);

  assert.throws(() => assertDeployableSource({
    targetSha: SHA,
    headSha: SHA,
    remoteMainSha: OTHER_SHA,
    statusPorcelain: "",
  }), /deploy-main-mismatch/);

  assert.throws(() => assertDeployableSource({
    targetSha: SHA,
    headSha: SHA,
    remoteMainSha: SHA,
    statusPorcelain: " M package.json",
  }), /deploy-worktree-dirty/);
});

test("Wrangler deployment preserves exact SHA and rollback metadata without a routable Railway origin", () => {
  const args = buildWranglerDeployArgs({
    targetSha: SHA,
    secretsFile: "/runner/temp/mahoraga-execution-runtime-secrets.json",
  });
  assert.deepEqual(args.slice(0, 4), ["--yes", "wrangler@4.132.0", "deploy", "--config"]);
  assert.ok(args.includes("deploy/cloudflare-execution-runtime/wrangler.jsonc"));
  assert.ok(args.includes(`TARGET_SHA:${SHA}`));
  assert.equal(args.some((arg) => arg.startsWith("RAILWAY_ANCHOR_URL:")), false);
  assert.equal(
    args.includes("RAILWAY_ANCHOR_URL:https://mahoraga-runtime-main-production.up.railway.app/"),
    false,
  );
  assert.deepEqual(
    args.slice(args.indexOf("--secrets-file"), args.indexOf("--secrets-file") + 2),
    ["--secrets-file", "/runner/temp/mahoraga-execution-runtime-secrets.json"],
  );
});

test("Windows Wrangler deployment launches npx through cmd.exe", () => {
  const buildNpxProcess = (runtimeOperator as any).buildNpxProcess;
  assert.equal(typeof buildNpxProcess, "function");
  assert.deepEqual(buildNpxProcess(["--version"], "win32", "C:\\Windows\\System32\\cmd.exe"), {
    command: "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", "npx.cmd", "--version"],
  });
  assert.deepEqual(buildNpxProcess(["--version"], "linux"), { command: "npx", args: ["--version"] });
});

test("deploy readiness diagnostic separates HTTP/auth and readiness failures without leaking bodies", async () => {
  const statusFetch = async (input: RequestInfo | URL): Promise<Response> =>
    new Response(new URL(input.toString()).pathname === "/api/live" ? "private-live" : "private-ready", {
      status: new URL(input.toString()).pathname === "/api/live" ? 302 : 503,
    });
  await assert.rejects(
    waitForExactRuntimeConvergence({
      accessClientId: "private-id", accessClientSecret: "private-secret",
      targetSha: SHA, baseUrl: BASE_URL, fetchImpl: statusFetch,
      readyAttempts: 1, readyDelayMs: 0,
    }),
    error => {
      const message = (error as Error).message;
      assert.match(message, /^deploy-runtime-convergence-timeout:live-http-302-ready-http-503$/);
      assert.doesNotMatch(message, /private-id|private-secret|private-live|private-ready/);
      return true;
    },
  );
});

test("deploy readiness diagnostic records exact source mismatch but never treats it as ready", async () => {
  const mismatchedFetch = async (input: RequestInfo | URL): Promise<Response> =>
    Response.json(new URL(input.toString()).pathname === "/api/live"
      ? { status: "live", sha: SHA }
      : readyBody(OTHER_SHA));
  await assert.rejects(waitForExactRuntimeConvergence({
    accessToken: "private-token", targetSha: SHA, baseUrl: BASE_URL,
    fetchImpl: mismatchedFetch, readyAttempts: 1, readyDelayMs: 0,
  }), /^Error: deploy-runtime-convergence-timeout:ready-sha-mismatch$/);
});

test("deploy readiness diagnostic retains bounded retries and succeeds only on exact live/ready evidence", async () => {
  let polls = 0;
  const sleeps: number[] = [];
  const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
    if (new URL(input.toString()).pathname === "/api/live") return Response.json({ status: "live", sha: SHA });
    polls += 1;
    return Response.json(readyBody(polls > 1 ? SHA : OTHER_SHA));
  };
  await waitForExactRuntimeConvergence({
    accessToken: "private-token", targetSha: SHA, baseUrl: BASE_URL,
    fetchImpl, readyAttempts: 3, readyDelayMs: 5,
    sleep: async ms => { sleeps.push(ms); },
  });
  assert.equal(polls, 2);
  // A stale Durable Object needs a quiet opportunity to hibernate and be replaced.
  assert.deepEqual(sleeps, [15_000]);
});

test("deploy convergence preserves short retries for transient HTTP failures", async () => {
  const sleeps: number[] = [];
  let polls = 0;
  const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
    if (new URL(input.toString()).pathname === "/api/live") return Response.json({ status: "live", sha: SHA });
    polls += 1;
    if (polls === 1) return new Response(null, { status: 503 });
    return Response.json(readyBody(SHA));
  };
  await waitForExactRuntimeConvergence({
    accessToken: "private-token", targetSha: SHA, baseUrl: BASE_URL,
    fetchImpl, readyAttempts: 3, readyDelayMs: 5,
    sleep: async ms => { sleeps.push(ms); },
  });
  assert.deepEqual(sleeps, [5]);
  assert.equal(polls, 2);
});

test("acceptance probe proves Access denial/auth, stale-SHA rejection, execution, and replay", async () => {
  const requests: Request[] = [];
  const firstBody = { executed: true, data: { probe: "first" }, timestamp: 123 };
  const fetchImpl = async (input: RequestInfo | globalThis.URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.method === "GET" && request.headers.get("cf-access-token") === null) {
      return new Response("Access denied", { status: 403 });
    }
    if (request.method === "GET" && new URL(request.url).pathname === "/api/runtime/attestation") return attestationResponse();
    if (request.method === "GET") {
      return Response.json(readyBody(SHA));
    }
    if (request.headers.get("x-target-sha") !== SHA) {
      return Response.json({ error: "Precondition Failed: SHA mismatch" }, { status: 412 });
    }
    if (requests.filter((item) => item.method === "POST" && item.headers.get("x-target-sha") === SHA).length === 1) {
      return Response.json(firstBody);
    }
    return Response.json(firstBody, { headers: { "x-idempotent-replay": "true" } });
  };

  const receipt = await runAcceptanceProbe({
    accessToken: "secret-access-token",
    baseUrl: BASE_URL,
    targetSha: SHA,
    idempotencyKey: "acceptance-key",
    fetchImpl,
    now: () => "2026-09-21T22:00:00.000Z",
  });

  assert.equal(receipt.status, "accepted");
  assert.equal(receipt.targetSha, SHA);
  assert.equal(receipt.observedAt, "2026-09-21T22:00:00.000Z");
  assert.equal(receipt.accessProtected, true);
  assert.equal(receipt.ready, true);
  assert.equal(receipt.durableStateVerified, true);
  assert.equal(receipt.trafficAuthorityVerified, true);
  assert.equal(receipt.staleShaRejected, true);
  assert.equal(receipt.executed, true);
  assert.equal(receipt.replayed, true);
  assert.equal(JSON.stringify(receipt).includes("secret-access-token"), false);
  assert.equal(JSON.stringify(receipt).includes("probe"), false);

  assert.equal(requests.length, 8);
  assert.equal(requests[0]?.headers.get("cf-access-token"), null);
  for (const request of requests.slice(1)) {
    assert.equal(request.headers.get("cf-access-token"), "secret-access-token");
  }
  const correctPosts = requests.filter((request) => request.method === "POST" && request.headers.get("x-target-sha") === SHA);
  assert.equal(correctPosts.length, 4);
  assert.equal(correctPosts[0]?.headers.get("x-idempotency-key"), "acceptance-key");
  assert.equal(correctPosts[1]?.headers.get("x-idempotency-key"), "acceptance-key");
  for (const request of correctPosts.slice(1)) assert.equal(await correctPosts[0]?.clone().text(), await request.clone().text());
});


test("acceptance probe waits for the deployed Durable Object provenance to settle", async () => {
  let authenticatedReadyAttempts = 0;
  const sleeps: number[] = [];
  let correctPosts = 0;
  const firstBody = { executed: true, data: { probe: "settled" } };
  const fetchImpl = async (input: RequestInfo | globalThis.URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    if (request.method === "GET" && request.headers.get("cf-access-token") === null) {
      return new Response("Access denied", { status: 403 });
    }
    if (request.method === "GET" && new URL(request.url).pathname === "/api/runtime/attestation") return attestationResponse();
    if (request.method === "GET") {
      authenticatedReadyAttempts += 1;
      return Response.json(readyBody(authenticatedReadyAttempts < 3 ? OTHER_SHA : SHA));
    }
    if (request.headers.get("x-target-sha") !== SHA) {
      return Response.json({ error: "sha" }, { status: 412 });
    }
    correctPosts += 1;
    return Response.json(firstBody, correctPosts > 1 ? { headers: { "x-idempotent-replay": "true" } } : undefined);
  };

  const receipt = await runAcceptanceProbe({
    accessToken: "secret-access-token",
    baseUrl: BASE_URL,
    targetSha: SHA,
    idempotencyKey: "settle-key",
    fetchImpl,
    readyAttempts: 3,
    readyDelayMs: 25,
    sleep: async (ms) => { sleeps.push(ms); },
  });

  assert.equal(receipt.status, "accepted");
  assert.equal(authenticatedReadyAttempts, 3);
  assert.deepEqual(sleeps, [25, 25]);
});

test("acceptance probe remains fail-closed when Durable Object provenance never converges", async () => {
  let authenticatedReadyAttempts = 0;
  let sleepCount = 0;
  const fetchImpl = async (input: RequestInfo | globalThis.URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    if (request.headers.get("cf-access-token") === null) return new Response("Access denied", { status: 403 });
    authenticatedReadyAttempts += 1;
    return Response.json(readyBody(OTHER_SHA));
  };

  await assert.rejects(runAcceptanceProbe({
    accessToken: "secret-access-token",
    baseUrl: BASE_URL,
    targetSha: SHA,
    fetchImpl,
    readyAttempts: 3,
    readyDelayMs: 1,
    sleep: async () => { sleepCount += 1; },
  }), /accept-ready-provenance-mismatch/);
  assert.equal(authenticatedReadyAttempts, 3);
  assert.equal(sleepCount, 2);
});

test("acceptance probe supports Cloudflare Access service-token headers", async () => {
  const requests: Request[] = [];
  const fetchImpl = async (input: RequestInfo | globalThis.URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.method === "GET" && request.headers.get("cf-access-client-id") === null) {
      return new Response("Access denied", { status: 403 });
    }
    if (request.method === "GET" && new URL(request.url).pathname === "/api/runtime/attestation") return attestationResponse();
    if (request.method === "GET") return Response.json(readyBody(SHA));
    if (request.headers.get("x-target-sha") !== SHA) return Response.json({ error: "sha" }, { status: 412 });
    const body = { executed: true };
    const prior = requests.filter((item) => item.method === "POST" && item.headers.get("x-target-sha") === SHA);
    return Response.json(body, prior.length > 1 ? { headers: { "x-idempotent-replay": "true" } } : undefined);
  };
  const receipt = await runAcceptanceProbe({
    accessClientId: "client-id.access",
    accessClientSecret: "client-secret",
    baseUrl: BASE_URL,
    targetSha: SHA,
    idempotencyKey: "service-auth-key",
    fetchImpl,
  });
  assert.equal(receipt.status, "accepted");
  assert.equal(receipt.accessProtected, true);
  assert.equal(requests[0]?.headers.get("cf-access-client-id"), null);
  assert.equal(requests[0]?.headers.get("cf-access-client-secret"), null);
  for (const request of requests.slice(1)) {
    assert.equal(request.headers.get("cf-access-client-id"), "client-id.access");
    assert.equal(request.headers.get("cf-access-client-secret"), "client-secret");
    assert.equal(request.headers.get("cf-access-token"), null);
  }
  assert.equal(JSON.stringify(receipt).includes("client-secret"), false);
});

test("acceptance probe fails when Access does not protect the runtime", async () => {
  const fetchImpl = async (): Promise<Response> => Response.json(readyBody(SHA));
  await assert.rejects(
    runAcceptanceProbe({
      accessToken: "secret-access-token",
      baseUrl: BASE_URL,
      targetSha: SHA,
      fetchImpl,
    }),
    /accept-access-not-enforced/,
  );
});

const replayPayload = { executed: true, answer: "persisted-answer", timestamp: 123 };
const sourcePrecondition = () => Response.json({ error: "Precondition Failed: SHA mismatch", expected: OTHER_SHA, actual: SHA }, { status: 412 });
function replaySequence(responses: (Response | Error)[]) {
  const correctRequests: Request[] = [];
  let providerExecutions = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "GET" && !request.headers.has("cf-access-token")) return new Response(null, { status: 403 });
    if (request.method === "GET" && new URL(request.url).pathname === "/api/runtime/attestation") return attestationResponse();
    if (request.method === "GET") return Response.json(readyBody(SHA));
    if (request.headers.get("x-target-sha") !== SHA) return new Response(null, { status: 412 });
    correctRequests.push(request);
    if (correctRequests.length === 1) { providerExecutions += 1; return Response.json(replayPayload); }
    if (correctRequests.length <= 4) return new Response(null, { status: 409 });
    const next = responses.shift();
    assert.ok(next, "unexpected retry");
    if (next instanceof Error) throw next;
    return next;
  };
  return { correctRequests, fetchImpl, providerExecutions: () => providerExecutions };
}
const persistedReplay = () => Response.json(replayPayload, { headers: { "x-idempotent-replay": "true" } });

test("acceptance retries only source-proven replay preconditions using the original request and receipt", async () => {
  const sequence = replaySequence([sourcePrecondition(), persistedReplay(), sourcePrecondition(), persistedReplay()]);
  const sleeps: number[] = [];
  let redeploys = 0;
  const receipt = await runAcceptanceProbe({
    accessToken: "private-access", acceptanceRunId: "scoped-acceptance", targetSha: SHA,
    idempotencyKey: "persisted-key", fetchImpl: sequence.fetchImpl,
    sleep: async ms => { sleeps.push(ms); },
    afterInitialExecution: async () => { redeploys += 1; },
  });
  assert.equal(sequence.providerExecutions(), 1);
  assert.equal(redeploys, 1);
  assert.deepEqual(sleeps, [15_000, 15_000]);
  assert.deepEqual(receipt.executionUniqueness, { logicalRequests: 8, providerExecutions: 1, receipts: 1, conflicts: 3, replays: 2, atMostOneVerified: true });
  assert.equal(receipt.durableContinuityVerified, true);
  const original = sequence.correctRequests[0]!;
  const originalBody = await original.clone().text();
  for (const request of sequence.correctRequests.slice(1)) {
    assert.equal(request.url, original.url);
    assert.deepEqual([...request.headers], [...original.headers]);
    assert.equal(await request.clone().text(), originalBody);
  }
});

test("source precondition retries are bounded and cannot accept a permanently stale execution plane", async () => {
  const sequence = replaySequence(Array.from({ length: 4 }, sourcePrecondition));
  const sleeps: number[] = [];
  await assert.rejects(runAcceptanceProbe({ targetSha: SHA, accessToken: "private-access", fetchImpl: sequence.fetchImpl, sleep: async ms => { sleeps.push(ms); } }), /accept-replay-412/);
  assert.equal(sequence.correctRequests.length, 8);
  assert.deepEqual(sleeps, [15_000, 15_000, 15_000]);
});

test("replay retries never hide ambiguous transport, denial, conflict, server, or unproven precondition failures", async () => {
  for (const response of [new Error("transport-uncertain"), new Response(null, { status: 403 }), new Response(null, { status: 409 }), new Response(null, { status: 503 }), new Response(null, { status: 412 }), Response.json({ error: "other", expected: OTHER_SHA, actual: SHA }, { status: 412 }), Response.json({ error: "Precondition Failed: SHA mismatch", expected: SHA, actual: OTHER_SHA }, { status: 412 })]) {
    const sequence = replaySequence([response]);
    await assert.rejects(runAcceptanceProbe({ targetSha: SHA, accessToken: "private-access", fetchImpl: sequence.fetchImpl, sleep: async () => { assert.fail("unsafe retry"); } }));
    assert.equal(sequence.correctRequests.length, 5);
  }
});

test("a retry still requires the persisted replay header and byte-equivalent receipt payload", async () => {
  for (const [response, reason] of [
    [Response.json(replayPayload), "accept-replay-header-missing"],
    [Response.json({ ...replayPayload, timestamp: 456 }, { headers: { "x-idempotent-replay": "true" } }), "accept-replay-payload-drift"],
  ] as const) {
    const sequence = replaySequence([sourcePrecondition(), response]);
    await assert.rejects(runAcceptanceProbe({ targetSha: SHA, accessToken: "private-access", fetchImpl: sequence.fetchImpl, sleep: async () => {} }), new RegExp(reason));
    assert.equal(sequence.correctRequests.length, 6);
  }
});

test("412 evidence parsing is bounded and never reflects malformed or private response content", async () => {
  for (const response of [
    new Response("private-upstream-body", { status: 412, headers: { "content-type": "application/json" } }),
    Response.json({ error: "Precondition Failed: SHA mismatch", expected: OTHER_SHA, actual: SHA, private: "secret" }, { status: 412 }),
    Response.json({ error: "Precondition Failed: SHA mismatch", expected: "secret", actual: SHA }, { status: 412 }),
    Response.json({ error: "Precondition Failed: SHA mismatch", expected: OTHER_SHA, actual: SHA }, { status: 412, headers: { "x-idempotent-replay": "true" } }),
    Response.json({ error: "Precondition Failed: SHA mismatch", expected: OTHER_SHA, actual: SHA }, { status: 412, headers: { "x-bypass-applied": "true" } }),
    new Response(" ".repeat(1025) + JSON.stringify({ error: "Precondition Failed: SHA mismatch", expected: OTHER_SHA, actual: SHA }), { status: 412, headers: { "content-type": "application/json" } }),
  ]) {
    const sequence = replaySequence([response]);
    await assert.rejects(runAcceptanceProbe({ targetSha: SHA, accessToken: "private-access", fetchImpl: sequence.fetchImpl, sleep: async () => { assert.fail("unproven retry"); } }), /^Error: accept-replay-412$/);
    assert.equal(sequence.correctRequests.length, 5);
  }
});

test("initial concurrent execution and deliberate stale-SHA rejection do not acquire replay retries", async () => {
  const sequence = replaySequence([]);
  let posts = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST" && request.headers.get("x-target-sha") === SHA) {
      posts += 1;
      if (posts === 2) return sourcePrecondition();
    }
    return sequence.fetchImpl(input, init);
  };
  await assert.rejects(runAcceptanceProbe({ targetSha: SHA, accessToken: "private-access", fetchImpl, sleep: async () => { assert.fail("initial execution retry"); } }), /^Error: accept-execute-412$/);
  assert.equal(posts, 4);
});

test("replay transport uncertainty holds immediately with a fixed diagnostic instead of external exception text", async () => {
  const sequence = replaySequence([new Error("private-access private-provider-error")]);
  await assert.rejects(runAcceptanceProbe({ targetSha: SHA, accessToken: "private-access", fetchImpl: sequence.fetchImpl, sleep: async () => { assert.fail("transport retry"); } }), /^Error: accept-replay-unreachable$/);
  assert.equal(sequence.correctRequests.length, 5);
});
