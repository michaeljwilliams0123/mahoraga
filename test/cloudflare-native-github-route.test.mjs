import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gateway = new URL("../deploy/cloudflare-owner-gateway/worker.mjs", import.meta.url);
const runtime = new URL("../deploy/cloudflare-execution-runtime/worker.ts", import.meta.url);
const bindings = new URL("../deploy/cloudflare-execution-runtime/bindings.d.ts", import.meta.url);
const config = new URL("../deploy/cloudflare-execution-runtime/wrangler.jsonc", import.meta.url);

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
