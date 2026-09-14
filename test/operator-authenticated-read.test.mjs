import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const sourceUrl = new URL("../operator-deck/src/lib/fleet/github.server.ts", import.meta.url);
const fixtureToken = "synthetic-read-token";
const api = "https://api.github.com/repos/michaeljwilliams0123/mahoraga";
let sequence = 0;

async function reader(env, fetcher) {
  let source = stripTypeScriptTypes(await readFile(sourceUrl, "utf8"));
  const classifier = "data:text/javascript," + encodeURIComponent('export const assignIssueOwner = () => "admin";');
  const writer = "data:text/javascript," + encodeURIComponent('export const loadWriteStatus = async () => ({ ok: false, login: null, rulesetName: null, rulesetEnforcement: null, requiredChecks: [] });');
  for (const [specifier, replacement] of [['"./classifier"', JSON.stringify(classifier)], ['"./write.server"', JSON.stringify(writer)]]) {
    assert.equal(source.split(specifier).length, 2);
    source = source.replace(specifier, replacement);
  }
  const dependencies = "const process = { env: {} }; let fetch; export function configure(env, request) { process.env = env; fetch = request; }\n";
  const module = await import("data:text/javascript," + encodeURIComponent(dependencies + source + "\n// fixture " + sequence++));
  module.configure(env, fetcher);
  return module;
}

function githubFixture(calls) {
  return async (url, options) => {
    calls.push({ url, options });
    assert.ok(url.startsWith(api));
    assert.equal(options.headers.Authorization, "Bearer " + fixtureToken);
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    const path = url.slice(api.length);
    let value;
    if (path === "") value = { full_name: "michaeljwilliams0123/mahoraga", description: "fixture", default_branch: "main", pushed_at: "", private: true, visibility: "private" };
    else if (path.startsWith("/issues/")) value = { number: 412, title: "Private fixture", state: "open", html_url: "", updated_at: "", labels: [], body: "Read contract" };
    else if (path.startsWith("/issues?") || path.startsWith("/pulls?") || path.startsWith("/tags?")) value = [];
    else if (path.startsWith("/commits?")) value = [{ sha: "a".repeat(40), commit: { message: "fixture" } }];
    else if (path.startsWith("/actions/workflows/")) value = { workflow_runs: [{ name: "Verify", run_number: 12, event: "pull_request", conclusion: "success", status: "completed", created_at: "2026-09-14T00:00:00Z", html_url: "https://github.com/example/run/12", head_sha: "a".repeat(40) }] };
    else if (path.startsWith("/contents/")) {
      const content = path.includes("package.json") ? '{"version":"1.0.0"}' : path.includes("mahoraga.manifest.json") ? '{"workers":[{"id":"fixture"}]}' : "Fixture contract";
      value = { encoding: "base64", content: Buffer.from(content).toString("base64") };
    } else throw new Error("Unexpected fixture URL");
    return Response.json(value);
  };
}

test("operator reads use authenticated API requests for snapshots, issues, workflows, and contracts", async () => {
  const calls = [];
  const module = await reader({ MAHORAGA_GITHUB_READ_TOKEN: fixtureToken }, githubFixture(calls));
  const snapshot = await module.loadGithubSnapshot();
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.visibility, "private");
  assert.equal((await module.loadGithubIssue(412)).ok, true);
  assert.equal((await module.loadWorkflowRun("verify.yml")).headSha, "a".repeat(40));
  assert.equal((await module.loadRepoContracts()).packageVersion, "1.0.0");
  assert.ok(calls.length >= 12);
  assert.equal(JSON.stringify(snapshot).includes(fixtureToken), false);
});

test("missing credentials fail closed without making public requests", async () => {
  let calls = 0;
  const module = await reader({}, async () => { calls += 1; throw new Error("unexpected network"); });
  for (const result of [await module.loadGithubSnapshot(), await module.loadGithubIssue(412), await module.loadWorkflowRun("verify.yml"), await module.loadRepoContracts()]) {
    assert.equal(result.ok, false);
    assert.equal(result.error, "authenticated-read-unavailable");
  }
  assert.equal((await module.loadGithubSnapshot()).visibility, "unknown");
  assert.equal(calls, 0);
});

test("rejected credentials cannot return a previously successful private snapshot", async () => {
  const env = { GH_TOKEN: fixtureToken };
  const module = await reader(env, githubFixture([]));
  assert.equal((await module.loadGithubSnapshot()).ok, true);
  module.configure(env, async () => new Response("", { status: 401 }));
  const rejected = await module.loadGithubSnapshot();
  assert.equal(rejected.ok, false);
  assert.equal(rejected.visibility, "unknown");
  assert.equal(rejected.headSha, "");
  delete env.GH_TOKEN;
  module.configure(env, async () => { throw new Error("must not request"); });
  assert.equal((await module.loadGithubSnapshot()).error, "authenticated-read-unavailable");
});

test("provider exceptions and forbidden workflow paths produce sanitized failures", async () => {
  let calls = 0;
  const module = await reader({ GITHUB_TOKEN: fixtureToken }, async () => { calls += 1; throw new Error("transport leaked " + fixtureToken); });
  const issue = await module.loadGithubIssue(412);
  assert.equal(issue.error, "authenticated-read-unavailable");
  assert.equal(JSON.stringify(issue).includes(fixtureToken), false);
  assert.equal((await module.loadWorkflowRun("../secrets")).ok, false);
  assert.equal((await module.loadGithubIssue(-1)).ok, false);
  assert.equal(calls, 1);
});
