import assert from "node:assert/strict";
import test from "node:test";
import { inspectGithubWorkspace } from "../deploy/cloudflare-execution-runtime/github-workspace.ts";

async function appEnv() {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const key = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
  return { GITHUB_APP_ID: "123", GITHUB_INSTALLATION_ID: "456", GITHUB_APP_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----` };
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test("workspace inspection scopes read tokens and exposes Pages, runs, and failed steps", async () => {
  const permissions: unknown[] = [];
  const methods: string[] = [];
  const snapshot = await inspectGithubWorkspace({}, { env: await appEnv(), fetchImpl: async (input, init) => {
    const url = String(input);
    methods.push(init?.method ?? "GET");
    if (url.endsWith("/access_tokens")) {
      permissions.push(JSON.parse(String(init?.body)).permissions);
      return json({ token: "test-token", expires_at: "2099-01-01T00:00:00Z" }, 201);
    }
    if (url.endsWith("/pages")) return json({ status: "built", html_url: "https://michaeljwilliams0123.github.io/mahoraga/", build_type: "workflow" });
    if (url.includes("/actions/runs?")) return json({ workflow_runs: [{ id: 42, name: "Verify", status: "completed", conclusion: "failure", head_sha: "a".repeat(40), head_branch: "main", html_url: "https://github.com/michaeljwilliams0123/mahoraga/actions/runs/42" }] });
    if (url.includes("/runs/42/jobs?")) return json({ jobs: [{ name: "Ubuntu", conclusion: "failure", steps: [{ name: "Typecheck", conclusion: "failure" }] }] });
    throw new Error("unexpected URL");
  } });
  assert.deepEqual(permissions.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), [{ actions: "read", metadata: "read" }, { pages: "read", metadata: "read" }]);
  assert.equal(methods.filter(method => method !== "GET").length, 2);
  assert.equal(snapshot.pages.state, "available");
  assert.equal(snapshot.actions.runs[0]?.sha, "a".repeat(40));
  assert.deepEqual(snapshot.actions.failedJobs, [{ name: "Ubuntu", steps: ["Typecheck"] }]);
  assert.doesNotMatch(JSON.stringify(snapshot), /test-token|PRIVATE KEY/);
});

test("Pages permission denial leaves Actions readable and reports a bounded reason", async () => {
  const snapshot = await inspectGithubWorkspace({}, { env: await appEnv(), fetchImpl: async (input, init) => {
    if (String(input).endsWith("/access_tokens")) {
      const permissions = JSON.parse(String(init?.body)).permissions;
      return permissions.pages ? json({ message: "private provider detail" }, 403) : json({ token: "test-token", expires_at: "2099-01-01" }, 201);
    }
    return json({ workflow_runs: [] });
  } });
  assert.equal(snapshot.pages.state, "denied");
  assert.equal(snapshot.pages.reason, "github-native-http-403");
  assert.equal(snapshot.actions.state, "available");
  assert.doesNotMatch(JSON.stringify(snapshot), /private provider detail/);
});

test("workspace inspection rejects caller-selected targets without making a request", async () => {
  await assert.rejects(inspectGithubWorkspace({ repository: "other/repo" }, { env: {}, fetchImpl: async () => { throw new Error("must not fetch"); } }), /github-native-workspace-request-invalid/);
});
