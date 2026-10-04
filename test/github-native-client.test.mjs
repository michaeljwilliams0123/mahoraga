import test from "node:test";
import assert from "node:assert/strict";
import {
  createGithubAppJwt,
  createMahoragaDirectMainCommitViaGithubApp,
  createMahoragaPullRequestViaGithubApp,
  githubAppConfigured,
  mergeMahoragaPullRequestViaGithubApp,
  readMahoragaRepositoryViaGithubApp,
} from "../src/github-native-client.mjs";

const BASE_SHA = "a".repeat(40);
const TREE_SHA = "b".repeat(40);
const COMMIT_SHA = "e".repeat(40);
const PKCS8_BEGIN = `-----BEGIN ${"PRIVATE"} KEY-----`;
const PKCS8_END = `-----END ${"PRIVATE"} KEY-----`;

async function githubAppEnv() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
  const lines = pkcs8.match(/.{1,64}/g).join("\n");
  return {
    GITHUB_APP_ID: "123456",
    GITHUB_INSTALLATION_ID: "98765432",
    GITHUB_APP_PRIVATE_KEY: `${PKCS8_BEGIN}\n${lines}\n${PKCS8_END}`,
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("GitHub App JWT is short-lived, RS256 signed, and contains only required claims", async () => {
  const env = await githubAppEnv();
  const jwt = await createGithubAppJwt(env, { now: () => 1_800_000_000_000 });
  const [headerPart, payloadPart, signaturePart] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")), {
    iat: 1_799_999_940,
    exp: 1_800_000_540,
    iss: "123456",
  });
  assert.ok(signaturePart.length > 100);
});

test("native repository inspection mints a repository-scoped installation token and projects GitHub data", async () => {
  const env = await githubAppEnv();
  const requests = [];
  const repository = await readMahoragaRepositoryViaGithubApp({}, {
    env,
    fetchImpl: async (url, options) => {
      requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      if (requests.length === 1) return json({ token: "installation-token", expires_at: "2026-10-04T15:00:00Z" }, 201);
      return json({
        full_name: "michaeljwilliams0123/mahoraga",
        private: true,
        default_branch: "main",
        pushed_at: "2026-10-04T14:00:00Z",
        permissions: { admin: false, maintain: true, push: true, pull: true, triage: true },
      });
    },
  });
  assert.equal(requests[0].url, "https://api.github.com/app/installations/98765432/access_tokens");
  assert.deepEqual(requests[0].body, {
    repositories: ["mahoraga"],
    permissions: { contents: "read", metadata: "read" },
  });
  assert.equal(requests[1].url, "https://api.github.com/repos/michaeljwilliams0123/mahoraga");
  assert.equal(requests[1].options.headers.authorization, "Bearer installation-token");
  assert.deepEqual(repository, {
    fullName: "michaeljwilliams0123/mahoraga",
    private: true,
    defaultBranch: "main",
    pushedAt: "2026-10-04T14:00:00Z",
    permissions: { admin: false, maintain: true, push: true, pull: true, triage: true },
  });
});

test("native PR creation uses the exact base tree, creates a draft, and returns a verified receipt", async () => {
  const env = await githubAppEnv();
  const requests = [];
  const responses = [
    json({ token: "installation-token", expires_at: "2026-10-04T15:00:00Z" }, 201),
    json([], 200),
    json({ object: { sha: BASE_SHA } }),
    json({ tree: { sha: TREE_SHA } }),
    json({ sha: "c".repeat(40) }, 201),
    json({ sha: "d".repeat(40) }, 201),
    json({ sha: COMMIT_SHA }, 201),
    json({ ref: "refs/heads/mahoraga/native-pr", object: { sha: COMMIT_SHA } }, 201),
    json({ number: 1043 }, 201),
    json({ number: 1043, html_url: "https://github.com/michaeljwilliams0123/mahoraga/pull/1043", state: "open", draft: true, head: { ref: "mahoraga/native-pr", sha: COMMIT_SHA }, base: { ref: "main", sha: BASE_SHA } }),
  ];
  const receipt = await createMahoragaPullRequestViaGithubApp({
    expectedMainSha: BASE_SHA,
    branch: "mahoraga/native-pr",
    title: "Use native GitHub App authentication",
    body: "Owner-requested native GitHub change.",
    commitMessage: "Use native GitHub App authentication",
    files: [{ path: "docs/native-github.md", content: "native\n" }],
  }, {
    env,
    fetchImpl: async (url, options) => {
      requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      return responses.shift();
    },
  });
  assert.equal(requests[5].body.base_tree, TREE_SHA);
  assert.equal(requests[8].body.draft, true);
  assert.deepEqual(receipt, {
    provider: "github-app",
    repository: "michaeljwilliams0123/mahoraga",
    number: 1043,
    url: "https://github.com/michaeljwilliams0123/mahoraga/pull/1043",
    state: "open",
    draft: true,
    head: { ref: "mahoraga/native-pr", sha: COMMIT_SHA },
    base: { ref: "main", sha: BASE_SHA },
  });
});

test("native PR creation rejects sensitive paths and credential-shaped content before authentication", async () => {
  const env = await githubAppEnv();
  for (const file of [
    { path: ".env.production", content: "SAFE=value" },
    { path: "config/key.pem", content: "not-a-key" },
    { path: "docs/example.md", content: `${PKCS8_BEGIN}\nredacted` },
    { path: "docs/token.md", content: `github_pat_${"a".repeat(22)}_${"b".repeat(59)}` },
  ]) {
    let calls = 0;
    await assert.rejects(() => createMahoragaPullRequestViaGithubApp({
      expectedMainSha: BASE_SHA, branch: "mahoraga/secret-check", title: "Reject secret", body: "Reject.", commitMessage: "Reject secret", files: [file],
    }, { env, fetchImpl: async () => { calls += 1; throw new Error("should-not-run"); } }), /github-native-proposal-sensitive/);
    assert.equal(calls, 0);
  }
});

test("native PR creation adopts an existing exact branch and draft PR on retry", async () => {
  const env = await githubAppEnv();
  const requests = [];
  const existing = { number: 1044, html_url: "https://github.com/michaeljwilliams0123/mahoraga/pull/1044", state: "open", draft: true, head: { ref: "mahoraga/retry", sha: COMMIT_SHA }, base: { ref: "main", sha: BASE_SHA } };
  const responses = [
    json({ token: "installation-token", expires_at: "2026-10-04T15:00:00Z" }, 201),
    json([existing]),
  ];
  const receipt = await createMahoragaPullRequestViaGithubApp({
    expectedMainSha: BASE_SHA, branch: "mahoraga/retry", title: "Retry", body: "Retry safely.", commitMessage: "Retry", files: [{ path: "docs/retry.md", content: "retry\n" }],
  }, { env, fetchImpl: async (url, options) => { requests.push(url); return responses.shift(); } });
  assert.equal(requests.length, 2);
  assert.equal(receipt.number, 1044);
  assert.equal(receipt.head.sha, COMMIT_SHA);
});

test("native PR creation compensates a moved base by closing its PR and deleting only its new branch", async () => {
  const env = await githubAppEnv();
  const requests = [];
  const responses = [
    json({ token: "installation-token", expires_at: "2026-10-04T15:00:00Z" }, 201), json([]),
    json({ object: { sha: BASE_SHA } }), json({ tree: { sha: TREE_SHA } }), json({ sha: "c".repeat(40) }, 201),
    json({ sha: "d".repeat(40) }, 201), json({ sha: COMMIT_SHA }, 201), json({ ref: "refs/heads/mahoraga/race", object: { sha: COMMIT_SHA } }, 201),
    json({ number: 1045 }, 201),
    json({ number: 1045, html_url: "https://github.com/michaeljwilliams0123/mahoraga/pull/1045", state: "open", draft: true, head: { ref: "mahoraga/race", sha: COMMIT_SHA }, base: { ref: "main", sha: "f".repeat(40) } }),
    json({ state: "closed" }), new Response(null, { status: 204 }),
  ];
  await assert.rejects(() => createMahoragaPullRequestViaGithubApp({
    expectedMainSha: BASE_SHA, branch: "mahoraga/race", title: "Race", body: "Compensate.", commitMessage: "Race", files: [{ path: "docs/race.md", content: "race\n" }],
  }, { env, fetchImpl: async (url, options) => { requests.push([options.method, url, options.body ? JSON.parse(options.body) : null]); return responses.shift(); } }), /github-native-readback-mismatch/);
  assert.deepEqual(requests.slice(-2).map(([method, url]) => [method, url]), [
    ["PATCH", "https://api.github.com/repos/michaeljwilliams0123/mahoraga/pulls/1045"],
    ["DELETE", "https://api.github.com/repos/michaeljwilliams0123/mahoraga/git/refs/heads/mahoraga%2Frace"],
  ]);
});

test("native PR merge requires exact ready head and returns the merged main receipt", async () => {
  const env = await githubAppEnv();
  const requests = [];
  const MERGE_SHA = "f".repeat(40);
  const responses = [
    json({ token: "installation-token", expires_at: "2026-10-04T15:00:00Z" }, 201),
    json({ number: 1046, state: "open", draft: false, head: { ref: "mahoraga/ready", sha: COMMIT_SHA }, base: { ref: "main", sha: BASE_SHA } }),
    json({ object: { sha: BASE_SHA } }),
    json({ merged: true, sha: MERGE_SHA, message: "Pull Request successfully merged" }),
    json({ object: { sha: MERGE_SHA } }),
  ];
  const receipt = await mergeMahoragaPullRequestViaGithubApp({
    number: 1046,
    expectedMainSha: BASE_SHA,
    expectedHeadSha: COMMIT_SHA,
    commitTitle: "Merge native GitHub operator canary",
  }, {
    env,
    fetchImpl: async (url, options) => {
      requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      return responses.shift();
    },
  });
  assert.deepEqual(requests[3].body, { sha: COMMIT_SHA, merge_method: "squash", commit_title: "Merge native GitHub operator canary" });
  assert.deepEqual(receipt, {
    provider: "github-app",
    repository: "michaeljwilliams0123/mahoraga",
    number: 1046,
    merged: true,
    mergeMethod: "squash",
    head: { ref: "mahoraga/ready", sha: COMMIT_SHA },
    base: { ref: "main", sha: BASE_SHA },
    main: { ref: "main", sha: MERGE_SHA },
  });
});

test("native direct-main write requires the exact current main SHA and verifies the new ref", async () => {
  const env = await githubAppEnv();
  const requests = [];
  const responses = [
    json({ token: "installation-token", expires_at: "2026-10-04T15:00:00Z" }, 201),
    json({ object: { sha: BASE_SHA } }),
    json({ tree: { sha: TREE_SHA } }),
    json({ sha: "c".repeat(40) }, 201),
    json({ sha: "d".repeat(40) }, 201),
    json({ sha: COMMIT_SHA }, 201),
    json({ ref: "refs/heads/main", object: { sha: COMMIT_SHA } }),
    json({ ref: "refs/heads/main", object: { sha: COMMIT_SHA } }),
  ];
  const receipt = await createMahoragaDirectMainCommitViaGithubApp({
    expectedMainSha: BASE_SHA,
    commitMessage: "Record native direct-main canary",
    files: [{ path: "docs/direct-main-canary.md", content: "verified\n" }],
  }, {
    env,
    fetchImpl: async (url, options) => {
      requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      return responses.shift();
    },
  });
  assert.equal(requests[4].body.base_tree, TREE_SHA);
  assert.deepEqual(requests[6].body, { sha: COMMIT_SHA, force: false });
  assert.deepEqual(receipt, {
    provider: "github-app",
    repository: "michaeljwilliams0123/mahoraga",
    directMain: true,
    previous: { ref: "main", sha: BASE_SHA },
    main: { ref: "main", sha: COMMIT_SHA },
  });
});

test("native GitHub App configuration fails closed when any credential component is absent", async () => {
  const env = await githubAppEnv();
  assert.equal(githubAppConfigured(env), true);
  for (const key of Object.keys(env)) assert.equal(githubAppConfigured({ ...env, [key]: "" }), false);
});
