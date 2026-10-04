import test from "node:test";
import assert from "node:assert/strict";
import { composioConfigured, createMahoragaPullRequestViaComposio, executeComposioTool, readGithubRepositoryViaComposio } from "../src/composio-tool-client.mjs";

test("Composio GitHub repository probe is fail-closed without an API key", async () => {
  assert.equal(composioConfigured({}), false);
  await assert.rejects(() => readGithubRepositoryViaComposio({ owner: "octocat", repo: "Hello-World" }, { env: {}, fetchImpl: async () => { throw new Error("should-not-run"); } }), /composio-api-key-unavailable/);
});

test("Composio GitHub repository probe executes only the bounded read tool and projects the response", async () => {
  let request = null;
  const repository = await readGithubRepositoryViaComposio({ owner: "octocat", repo: "Hello-World" }, {
    env: { COMPOSIO_API_KEY: "secret-test-key", COMPOSIO_USER_ID: "owner" },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ successful: true, data: {
        full_name: "octocat/Hello-World", private: true, default_branch: "main", pushed_at: "2026-09-18T00:00:00Z",
        permissions: { admin: true, maintain: true, push: true, pull: true, triage: true }, extra_secret_like_field: "not-projected",
      } }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.match(request.url, /backend\.composio\.dev\/api\/v3\.1\/tools\/execute\/GITHUB_GET_A_REPOSITORY$/);
  assert.equal(request.options.headers["x-api-key"], "secret-test-key");
  const body = JSON.parse(request.options.body);
  assert.deepEqual(body.arguments, { owner: "octocat", repo: "Hello-World" });
  assert.equal(body.user_id, "owner");
  assert.equal("version" in body, false);
  assert.deepEqual(repository, {
    fullName: "octocat/Hello-World", private: true, defaultBranch: "main", pushedAt: "2026-09-18T00:00:00Z",
    permissions: { admin: true, maintain: true, push: true, pull: true, triage: true },
  });
});

test("Composio client refuses arbitrary tool execution", async () => {
  await assert.rejects(() => executeComposioTool("GITHUB_DELETE_A_REFERENCE", {}, { env: { COMPOSIO_API_KEY: "x" }, fetchImpl: async () => new Response("{}") }), /composio-tool-not-allowed/);
});

test("Composio client refuses non-canonical request destinations", async () => {
  for (const baseUrl of ["https://attacker.example/api/v3.1", "https://backend.composio.dev.attacker.example/api/v3.1", "http://backend.composio.dev/api/v3.1"]) {
    await assert.rejects(() => executeComposioTool("GITHUB_GET_A_REPOSITORY", {}, {
      env: { COMPOSIO_API_KEY: "secret-test-key", COMPOSIO_API_BASE_URL: baseUrl },
      fetchImpl: async () => { throw new Error("should-not-run"); },
    }), /composio-base-url-invalid/);
  }
});


test("Composio client prefers an explicit connected GitHub account and only sends a version when pinned", async () => {
  let request = null;
  await readGithubRepositoryViaComposio({ owner: "octocat", repo: "Hello-World" }, {
    env: { COMPOSIO_API_KEY: "secret-test-key", COMPOSIO_GITHUB_CONNECTED_ACCOUNT_ID: "github-account", COMPOSIO_USER_ID: "fallback-user", COMPOSIO_GITHUB_TOOL_VERSION: "20260918_00" },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ successful: true, data: { full_name: "octocat/Hello-World", private: false, default_branch: "main", permissions: { pull: true } } }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const body = JSON.parse(request.options.body);
  assert.equal(body.connected_account_id, "github-account");
  assert.equal("user_id" in body, false);
  assert.equal(body.version, "20260918_00");
});

test("Composio creates a bounded draft PR from an exact main SHA and returns a read-back receipt", async () => {
  const baseSha = "a".repeat(40);
  const treeSha = "b".repeat(40);
  const requests = [];
  const responses = [
    { status: 200, data: { object: { sha: baseSha } } },
    { status: 200, data: { tree: { sha: treeSha } } },
    { status: 201, data: { sha: "c".repeat(40) } },
    { status: 201, data: { sha: "d".repeat(40) } },
    { status: 201, data: { sha: "e".repeat(40) } },
    { status: 201, data: { ref: "refs/heads/mahoraga/bounded-pr", object: { sha: "e".repeat(40) } } },
    { status: 201, data: { number: 1042 } },
    { status: 200, data: { number: 1042, html_url: "https://github.com/michaeljwilliams0123/mahoraga/pull/1042", state: "open", draft: true, head: { ref: "mahoraga/bounded-pr", sha: "e".repeat(40) }, base: { ref: "main", sha: baseSha } } },
  ];
  const receipt = await createMahoragaPullRequestViaComposio({
    expectedMainSha: baseSha,
    branch: "mahoraga/bounded-pr",
    title: "Add the bounded PR operator",
    body: "Owner-requested change with exact-head evidence.",
    commitMessage: "Add the bounded PR operator",
    files: [{ path: "docs/bounded-pr.md", content: "bounded\n" }],
  }, {
    env: { COMPOSIO_API_KEY: "secret-test-key", COMPOSIO_GITHUB_CONNECTED_ACCOUNT_ID: "ca_github" },
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(requests.length, 8);
  assert.ok(requests.every((request) => request.url.endsWith("/tools/execute/proxy")));
  assert.ok(requests.every((request) => request.body.connected_account_id === "ca_github"));
  assert.deepEqual(requests.map((request) => [request.body.method, request.body.endpoint]), [
    ["GET", "/repos/michaeljwilliams0123/mahoraga/git/ref/heads/main"],
    ["GET", `/repos/michaeljwilliams0123/mahoraga/git/commits/${baseSha}`],
    ["POST", "/repos/michaeljwilliams0123/mahoraga/git/blobs"],
    ["POST", "/repos/michaeljwilliams0123/mahoraga/git/trees"],
    ["POST", "/repos/michaeljwilliams0123/mahoraga/git/commits"],
    ["POST", "/repos/michaeljwilliams0123/mahoraga/git/refs"],
    ["POST", "/repos/michaeljwilliams0123/mahoraga/pulls"],
    ["GET", "/repos/michaeljwilliams0123/mahoraga/pulls/1042"],
  ]);
  assert.equal(requests[6].body.body.draft, true);
  assert.deepEqual(receipt, {
    provider: "composio",
    repository: "michaeljwilliams0123/mahoraga",
    number: 1042,
    url: "https://github.com/michaeljwilliams0123/mahoraga/pull/1042",
    state: "open",
    draft: true,
    head: { ref: "mahoraga/bounded-pr", sha: "e".repeat(40) },
    base: { ref: "main", sha: baseSha },
  });
});

test("Composio PR creation fails closed before mutation when main moved or input escapes bounds", async () => {
  const baseSha = "a".repeat(40);
  let calls = 0;
  await assert.rejects(() => createMahoragaPullRequestViaComposio({
    expectedMainSha: baseSha,
    branch: "mahoraga/stale",
    title: "Stale proposal",
    body: "Must not write.",
    commitMessage: "Stale proposal",
    files: [{ path: "docs/stale.md", content: "stale\n" }],
  }, {
    env: { COMPOSIO_API_KEY: "x", COMPOSIO_GITHUB_CONNECTED_ACCOUNT_ID: "ca_github" },
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ status: 200, data: { object: { sha: "f".repeat(40) } } }), { status: 200 });
    },
  }), /composio-github-main-moved/);
  assert.equal(calls, 1);

  for (const invalid of [
    { branch: "main", files: [{ path: "docs/x.md", content: "x" }] },
    { branch: "mahoraga/x", files: [{ path: "../secret", content: "x" }] },
    { branch: "mahoraga/x", files: [] },
  ]) {
    await assert.rejects(() => createMahoragaPullRequestViaComposio({
      expectedMainSha: baseSha, title: "Invalid proposal", body: "Rejected.", commitMessage: "Invalid proposal", ...invalid,
    }, { env: { COMPOSIO_API_KEY: "x", COMPOSIO_GITHUB_CONNECTED_ACCOUNT_ID: "ca_github" }, fetchImpl: async () => { throw new Error("should-not-run"); } }), /composio-github-proposal-/);
  }
});
