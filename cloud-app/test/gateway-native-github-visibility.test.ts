import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("canonical Owner Gateway exposes existing read-only native GitHub status", () => {
  const chat = read("components/workspace/chat-view.tsx");
  const panel = read("components/workspace/GithubWorkspacePanel.tsx");
  assert.match(chat, /health\?\.deployment\?\.provider === "github-pages"/);
  assert.match(chat, /health\?\.deployment\?\.provider === "cloudflare-workers"/);
  assert.match(chat, /health\.deployment\.promotion === "unverified-cloudflare-static"/);
  assert.match(chat, /<GithubWorkspacePanel coreReady=\{coreReady\} relay=\{relay\}/);
  assert.match(panel, /GitHub status · Pages \+ Actions \(read-only\)/);
  assert.match(panel, /if \(!coreReady \|\| !relay\) \{ setState\(null\); return; \}/);
  assert.match(panel, /disabled=\{!coreReady \|\| !canRefresh/);
  assert.match(panel, /does not authorize repository writes, merges or cloud execution/);
  assert.doesNotMatch(panel, /<details className="github-workspace-panel" open>/);
});
test("GitHub status reuses the authenticated native bridge and never adds direct browser tokens", () => {
  const runtime = read("../deploy/cloudflare-execution-runtime/worker.ts");
  const gateway = read("../deploy/cloudflare-owner-gateway/worker.mjs");
  const panel = read("components/workspace/GithubWorkspacePanel.tsx");
  const transport = read("lib/runtime-relay.ts");
  assert.match(runtime, /native-github-workspace/);
  assert.match(gateway, /native-github-workspace/);
  assert.match(transport, /this\.call<GithubWorkspaceSnapshot>\("native-github-workspace", \{\}\)/);
  assert.doesNotMatch(panel, /GITHUB_APP_PRIVATE_KEY|GITHUB_TOKEN|Authorization:|fetch\(["']https:\/\/api\.github\.com/);
});
