import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { canonicalWorkspaceUrl, DEFAULT_WORKSPACE_URL } from "../src/server.mjs";

const read = (relative) => readFile(path.join(ROOT, relative), "utf8");

test("Vercel is the only Mahoraga browser interaction surface", async () => {
  const [workspace, relay, docs] = await Promise.all([
    read("cloud-app/components/workspace.tsx"),
    read("cloud-app/lib/runtime-relay.ts"),
    read("docs/CLOUD-WORKSPACE.md"),
  ]);
  assert.equal(canonicalWorkspaceUrl(), DEFAULT_WORKSPACE_URL);
  assert.match(workspace, /Unified workspace/);
  assert.match(workspace, /Zero-Codex route/);
  assert.match(workspace, /Pair runtime/);
  assert.match(relay, /wss:\/\/relay\.mahoraga\.app\/pair/);
  assert.match(docs, /single Vercel-hosted workspace/i);
});

test("retired static and loopback UI entry points are absent", async () => {
  for (const relative of [
    "cloud/index.html", "cloud/app.js", "cloud/styles.css",
    "web/index.html", "web/app.js", "web/autonomy-workspace.html",
    ".github/workflows/pages.yml",
  ]) {
    await assert.rejects(access(path.join(ROOT, relative)), { code: "ENOENT" });
  }
});

test("runtime pairing is fixed-origin, encrypted, cancellable, memory-only, and not a route selector", async () => {
  const [workspace, relay, chatRoute] = await Promise.all([
    read("cloud-app/components/workspace.tsx"),
    read("cloud-app/lib/runtime-relay.ts"),
    read("cloud-app/app/api/chat/route.ts"),
  ]);
  assert.match(relay, /ECDH/);
  assert.match(relay, /HKDF/);
  assert.match(relay, /AES-GCM/);
  assert.match(relay, /async taskAction/);
  assert.match(relay, /async revoke/);
  assert.doesNotMatch(workspace, /conversationRoute|DefaultChatTransport|useChat\(/);
  assert.match(workspace, /runtimePollGeneration/);
  assert.match(workspace, /creditPolicy:\s*"zero-codex"/);
  assert.match(chatRoute, /core-gateway-required/);
  assert.doesNotMatch(`${workspace}\n${relay}`, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});
