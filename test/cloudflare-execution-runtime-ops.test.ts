import assert from "node:assert/strict";
import * as runtimeOperator from "../scripts/cloudflare-execution-runtime.ts";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  assertDeployableSource,
  buildWranglerDeployArgs,
  runAcceptanceProbe,
} from "../scripts/cloudflare-execution-runtime.ts";

const SHA = "6a1d51e25654eb7a5c22bab7a1c2dcaca522c2af";
const OTHER_SHA = "7cb8aab1129875f798347afdb2844f963e986a65";
const BASE_URL = "https://mahoraga-execution-runtime.mahoraga-mjw0123.workers.dev";
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

test("Wrangler deployment overrides the sentinel with exact SHA and rollback anchor", () => {
  const args = buildWranglerDeployArgs({ targetSha: SHA });
  assert.deepEqual(args.slice(0, 4), ["--yes", "wrangler@4.132.0", "deploy", "--config"]);
  assert.ok(args.includes("deploy/cloudflare-execution-runtime/wrangler.jsonc"));
  assert.ok(args.includes(`TARGET_SHA:${SHA}`));
  assert.ok(args.includes("RAILWAY_ANCHOR_URL:https://mahoraga-runtime-main-production.up.railway.app/"));
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

test("acceptance probe proves Access auth, stale-SHA rejection, execution, and replay", async () => {
  const requests: Request[] = [];
  const firstBody = { executed: true, data: { probe: "first" }, timestamp: 123 };
  const fetchImpl = async (input: RequestInfo | globalThis.URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.method === "GET") {
      return Response.json({ status: "ready", sha: SHA });
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
  assert.equal(receipt.ready, true);
  assert.equal(receipt.staleShaRejected, true);
  assert.equal(receipt.executed, true);
  assert.equal(receipt.replayed, true);
  assert.equal(JSON.stringify(receipt).includes("secret-access-token"), false);
  assert.equal(JSON.stringify(receipt).includes("probe"), false);

  assert.equal(requests.length, 4);
  for (const request of requests) {
    assert.equal(request.headers.get("cf-access-token"), "secret-access-token");
  }
  const correctPosts = requests.filter((request) => request.method === "POST" && request.headers.get("x-target-sha") === SHA);
  assert.equal(correctPosts.length, 2);
  assert.equal(correctPosts[0]?.headers.get("x-idempotency-key"), "acceptance-key");
  assert.equal(correctPosts[1]?.headers.get("x-idempotency-key"), "acceptance-key");
  assert.notEqual(await correctPosts[0]?.clone().text(), await correctPosts[1]?.clone().text());
});


test("acceptance probe supports Cloudflare Access service-token headers", async () => {
  const requests: Request[] = [];
  const fetchImpl = async (input: RequestInfo | globalThis.URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.method === "GET") return Response.json({ status: "ready", sha: SHA });
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
  for (const request of requests) {
    assert.equal(request.headers.get("cf-access-client-id"), "client-id.access");
    assert.equal(request.headers.get("cf-access-client-secret"), "client-secret");
    assert.equal(request.headers.get("cf-access-token"), null);
  }
  assert.equal(JSON.stringify(receipt).includes("client-secret"), false);
});
