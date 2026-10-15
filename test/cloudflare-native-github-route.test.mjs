import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gateway = new URL("../deploy/cloudflare-owner-gateway/worker.mjs", import.meta.url);
const runtime = new URL("../deploy/cloudflare-execution-runtime/worker.ts", import.meta.url);
const bindings = new URL("../deploy/cloudflare-execution-runtime/bindings.d.ts", import.meta.url);
const config = new URL("../deploy/cloudflare-execution-runtime/wrangler.jsonc", import.meta.url);

test("mobile chat has an authenticated, idempotent native repository inspect command", async () => {
  const runtimeText = await readFile(runtime, "utf8");
  assert.ok(runtimeText.includes('"/repo inspect"'));
  assert.match(runtimeText, /nativeGithubInspectChat/);
  assert.match(runtimeText, /providerId = sourceCommand \? "mahoraga-native-github-source" : "mahoraga-native-github-inspect"/);
  assert.ok(runtimeText.includes('"repository.inspect"'));
  assert.match(runtimeText, /readMahoragaRepositoryViaGithubApp/);
  assert.ok(runtimeText.includes('turn.providerId === ASSISTANT_PROVIDER_ID || turn.providerId === "mahoraga-native-github-inspect"'));
});

test("mobile chat exposes typed native repository administration with durable receipts", async () => {
  const runtimeText = await readFile(runtime, "utf8");
  assert.match(runtimeText, /parseRepositoryAdminCommand/);
  assert.match(runtimeText, /isRepositoryAdminRequest\(message\)/);
  assert.match(runtimeText, /nativeGithubAdminChat\(ownerHash, conversationId, key, message\)/);
  assert.match(runtimeText, /readMahoragaRepositoryWriteReadinessViaGithubApp/);
  assert.match(runtimeText, /createMahoragaPullRequestViaGithubApp\(command\.proposal/);
  assert.match(runtimeText, /mergeMahoragaPullRequestViaGithubApp\(command\.proposal/);
  assert.match(runtimeText, /mahoraga-native-github-admin-status/);
  assert.match(runtimeText, /mahoraga-native-github-pr-create/);
  assert.match(runtimeText, /mahoraga-native-github-pr-merge/);
  assert.match(runtimeText, /command\.action === "checks"/);
  assert.match(runtimeText, /command\.action === "dispatch" \? "workflow\.dispatch"/);
  assert.match(runtimeText, /readMahoragaPullRequestChecksViaGithubApp/);
  assert.match(runtimeText, /dispatchMahoragaVerifyWorkflowViaGithubApp/);
  assert.match(runtimeText, /readOnly: command\.action === "status" \|\| command\.action === "checks" \|\| command\.action === "diagnose"/);
  assert.match(runtimeText, /Bounded interpretation: executed only \/repo admin status/);
});

test("normal chat reuses authenticated repository evidence and handles bounded read-only summaries", async () => {
  const [runtimeText, providerText] = await Promise.all([
    readFile(runtime, "utf8"),
    readFile(new URL("../deploy/cloudflare-execution-runtime/provider-invoker.ts", import.meta.url), "utf8"),
  ]);
  assert.match(runtimeText, /isReadOnlyRepositoryEvidenceRequest\(message\)/);
  assert.match(runtimeText, /priorNativeInspection/);
  assert.match(runtimeText, /runtimeContext\.receipts = \[/);
  assert.match(runtimeText, /Suggested next step \(not an inspected-code finding\)/);
  assert.match(providerText, /repository\.inspect=unavailable in the broker inventory does not invalidate a verified native inspection receipt/);
  assert.doesNotMatch(providerText, /repository\.inspect=unavailable means this runtime cannot directly inspect/);
});

test("source-file chat inspection uses existing authenticated owner action and durable receipt", async () => {
  const runtimeText = await readFile(runtime, "utf8");
  assert.match(runtimeText, /readMahoragaSourceFileViaGithubApp/);
  assert.match(runtimeText, /nativeGithubInspectChat\(ownerHash, conversationId, key, message\)/);
  assert.match(runtimeText, /mahoraga-native-github-source/);
  assert.match(runtimeText, /Source-file inspection — live GitHub App/);
  assert.match(runtimeText, /Git blob SHA:/);
  assert.match(runtimeText, /sourcePath/);
});

test("native GitHub actions terminate in the Cloudflare execution runtime", async () => {
  const [gatewayText, runtimeText, bindingsText, configText] = await Promise.all([
    readFile(gateway, "utf8"), readFile(runtime, "utf8"), readFile(bindings, "utf8"), readFile(config, "utf8"),
  ]);
  for (const action of ["native-github-repository", "native-github-pull-request", "native-github-merge", "native-github-main-write"]) {
    assert.match(gatewayText, new RegExp(`NATIVE_ACTIONS[\\s\\S]*${action}`));
    assert.match(runtimeText, new RegExp(`input\\?\\.type === "${action}"`));
  }
  assert.match(runtimeText, /readMahoragaRepositoryViaGithubApp/);
  assert.match(runtimeText, /createMahoragaPullRequestViaGithubApp/);
  assert.match(runtimeText, /mergeMahoragaPullRequestViaGithubApp/);
  assert.match(runtimeText, /createMahoragaDirectMainCommitViaGithubApp/);
  for (const secret of ["GITHUB_APP_ID", "GITHUB_INSTALLATION_ID", "GITHUB_APP_PRIVATE_KEY"]) {
    assert.match(bindingsText, new RegExp(`${secret}: string`));
    assert.match(configText, new RegExp(`"${secret}"`));
  }
  assert.doesNotMatch(gatewayText, /GITHUB_APP_PRIVATE_KEY/);
});
