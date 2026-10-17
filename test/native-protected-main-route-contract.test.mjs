import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("protected main has no executable native direct-push entry point", async () => {
  const root = new URL("../", import.meta.url);
  const paths = [
    "src/github-native-client.mjs",
    "deploy/cloudflare-execution-runtime/worker.ts",
    "deploy/cloudflare-owner-gateway/worker.mjs",
    "cloud-app/lib/cloud-runtime-action.ts",
    "cloud-app/lib/runtime-relay.ts",
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, root), "utf8");
    assert.doesNotMatch(source, /native-github-main-write|createMahoragaDirectMainCommitViaGithubApp|nativeGithubMainWrite|RuntimeGithubAppDirectMain/i, path);
  }
});

test("bounded PR creation and exact-head squash merge remain wired to GitHub App", async () => {
  const root = new URL("../", import.meta.url);
  const client = await readFile(new URL("src/github-native-client.mjs", root), "utf8");
  const runtime = await readFile(new URL("deploy/cloudflare-execution-runtime/worker.ts", root), "utf8");
  const gateway = await readFile(new URL("deploy/cloudflare-owner-gateway/worker.mjs", root), "utf8");
  assert.match(client, /export async function createMahoragaPullRequestViaGithubApp/);
  assert.match(client, /export async function mergeMahoragaPullRequestViaGithubApp/);
  assert.match(runtime, /native-github-pull-request/);
  assert.match(runtime, /native-github-merge/);
  assert.match(gateway, /native-github-pull-request/);
  assert.match(gateway, /native-github-merge/);
});
