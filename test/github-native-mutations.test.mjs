import test from "node:test";
import assert from "node:assert/strict";
import {
  createMahoragaPullRequestViaGithubApp,
  mutateMahoragaRepositoryViaGithubApp,
} from "../src/github-native-client.mjs";

const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);
const TREE_SHA = "c".repeat(40);
const COMMIT_SHA = "d".repeat(40);
const PKCS8_BEGIN = `-----BEGIN ${"PRIVATE"} KEY-----`;
const PKCS8_END = `-----END ${"PRIVATE"} KEY-----`;
async function env() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"],
  );
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
  return { GITHUB_APP_ID: "123", GITHUB_INSTALLATION_ID: "456",
    GITHUB_APP_PRIVATE_KEY: `${PKCS8_BEGIN}\n${pkcs8.match(/.{1,64}/g).join("\n")}\n${PKCS8_END}` };
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const issue = (number, extra = {}) => ({ number, html_url: `https://github.com/michaeljwilliams0123/mahoraga/issues/${number}`, state: "open", title: "Issue", ...extra });
const pull = (number, extra = {}) => ({ number, html_url: `https://github.com/michaeljwilliams0123/mahoraga/pull/${number}`, state: "open", title: "PR",
  head: { sha: HEAD_SHA, repo: { full_name: "michaeljwilliams0123/mahoraga" } }, base: { ref: "main" }, ...extra });

test("draft PR creation represents an explicit tracked-file deletion in the Git tree", async () => {
  const calls = [];
  const responses = [
    json({ token: "token", expires_at: "2026-10-16T00:00:00Z" }, 201), json([]),
    json({ object: { sha: BASE_SHA } }), json({ tree: { sha: TREE_SHA } }),
    json({ sha: TREE_SHA }, 201), json({ sha: COMMIT_SHA }, 201),
    json({ ref: "refs/heads/mahoraga/delete-file", object: { sha: COMMIT_SHA } }, 201),
    json({ number: 1200 }, 201),
    json({ number: 1200, html_url: "https://github.com/michaeljwilliams0123/mahoraga/pull/1200", state: "open", draft: true,
      head: { ref: "mahoraga/delete-file", sha: COMMIT_SHA }, base: { ref: "main", sha: BASE_SHA } }),
  ];
  await createMahoragaPullRequestViaGithubApp({
    expectedMainSha: BASE_SHA, branch: "mahoraga/delete-file", title: "Delete obsolete file",
    body: "Reviewable deletion.", commitMessage: "Delete obsolete file",
    files: [{ path: "docs/obsolete.md", delete: true }],
  }, { env: await env(), fetchImpl: async (url, options) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    return responses.shift();
  } });
  assert.equal(calls.some(call => call.url.endsWith("/git/blobs")), false);
  assert.deepEqual(calls.find(call => call.url.endsWith("/git/trees")).body.tree,
    [{ path: "docs/obsolete.md", mode: "100644", type: "blob", sha: null }]);
});

test("issue creation requests only issue mutation permission and verifies the returned issue", async () => {
  const calls = [];
  const receipt = await mutateMahoragaRepositoryViaGithubApp("issue-create",
    { title: "Runtime route gap", body: "Observed from the owner UI." },
    { env: await env(), mutationId: "1".repeat(64), fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
      if (calls.length === 1) return json({ token: "issue-token", expires_at: "2026-10-16T00:00:00Z" }, 201);
      if (calls.length === 2) return json([]);
      return json(issue(1201, { title: "Runtime route gap", body: options.body ? JSON.parse(options.body).body : "" }), 201);
    } });
  assert.deepEqual(calls[0].body.permissions, { issues: "write", metadata: "read" });
  assert.match(calls[1].url, /\/issues\?state=all/);
  assert.equal(calls[2].url.endsWith("/issues"), true);
  assert.match(calls[2].body.body, /<!-- mahoraga-mutation:1{64} -->/);
  assert.deepEqual(receipt, { provider: "github-app", repository: "michaeljwilliams0123/mahoraga",
    action: "issue-create", kind: "issue", number: 1201,
    url: "https://github.com/michaeljwilliams0123/mahoraga/issues/1201", state: "open", title: "Runtime route gap" });
});

test("pull request edits require the exact current head before mutation", async () => {
  const calls = [];
  const responses = [
    json({ token: "pr-token", expires_at: "2026-10-16T00:00:00Z" }, 201),
    json(pull(1202)), json(pull(1202, { title: "Sharper title" })),
  ];
  const receipt = await mutateMahoragaRepositoryViaGithubApp("pr-update",
    { number: 1202, expectedHeadSha: HEAD_SHA, title: "Sharper title" },
    { env: await env(), fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
      return responses.shift();
    } });
  assert.deepEqual(calls[0].body.permissions, { pull_requests: "write", metadata: "read" });
  assert.equal(calls[2].method, "PATCH");
  assert.deepEqual(calls[2].body, { title: "Sharper title" });
  assert.equal(receipt.title, "Sharper title");
});

test("comment deletion binds kind, parent number and comment identity before DELETE", async () => {
  const calls = [];
  const issueUrl = "https://api.github.com/repos/michaeljwilliams0123/mahoraga/issues/973";
  const responses = [
    json({ token: "issue-token", expires_at: "2026-10-16T00:00:00Z" }, 201),
    json(issue(973)), json({ id: 77, issue_url: issueUrl }),
    new Response(null, { status: 204 }),
  ];
  const receipt = await mutateMahoragaRepositoryViaGithubApp("comment-delete",
    { kind: "issue", number: 973, commentId: 77 },
    { env: await env(), fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method });
      return responses.shift();
    } });
  assert.equal(calls[3].method, "DELETE");
  assert.equal(calls[3].url.endsWith("/issues/comments/77"), true);
  assert.equal(receipt.deleted, true);
});

test("reconcile-only issue creation adopts a prior marker and never posts again", async () => {
  const calls = [];
  const marker = "<!-- mahoraga-mutation:" + "2".repeat(64) + " -->";
  const receipt = await mutateMahoragaRepositoryViaGithubApp("issue-create",
    { title: "Recovered issue", body: "Original body" },
    { env: await env(), mutationId: "2".repeat(64), reconcileOnly: true, fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method });
      if (calls.length === 1) return json({ token: "issue-token", expires_at: "2026-10-16T00:00:00Z" }, 201);
      return json([issue(1203, { title: "Recovered issue", body: "Original body\n\n" + marker })]);
    } });
  assert.equal(calls.length, 2);
  assert.equal(calls.some(call => call.method === "POST" && call.url.endsWith("/issues")), false);
  assert.equal(receipt.number, 1203);
});

test("unsupported permanent issue deletion and surplus fields fail before authentication", async () => {
  let calls = 0;
  for (const [action, proposal] of [
    ["issue-delete", { number: 973 }],
    ["issue-create", { title: "x", unexpected: true }],
    ["comment-create", { kind: "issue", number: 973, body: "x", commentId: 1 }],
    ["branch-delete", { branch: "main", expectedHeadSha: HEAD_SHA }],
  ]) {
    await assert.rejects(
      mutateMahoragaRepositoryViaGithubApp(action, proposal, { fetchImpl: async () => { calls += 1; throw Error("unreachable"); } }),
      /github-native-/,
    );
  }
  assert.equal(calls, 0);
});
