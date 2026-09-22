import test from "node:test";
import assert from "node:assert/strict";
import { composioConfigured, executeComposioTool, readGithubRepositoryViaComposio } from "../src/composio-tool-client.mjs";

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
