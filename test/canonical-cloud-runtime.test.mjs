import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { canonicalWorkspaceUrl, DEFAULT_WORKSPACE_URL } from "../src/server.mjs";

const read = (relative) => readFile(path.join(ROOT, relative), "utf8");

async function readWorkspaceSurface() {
  const [workspace, shell, chatView, workspaceTypes] = await Promise.all([
    read("cloud-app/components/workspace.tsx"),
    read("cloud-app/components/workspace/workspace-shell.tsx"),
    read("cloud-app/components/workspace/chat-view.tsx"),
    read("cloud-app/components/workspace/workspace-types.ts"),
  ]);
  return `${workspace}\n${shell}\n${chatView}\n${workspaceTypes}`;
}

test("one host-neutral cloud workspace is the only Mahoraga browser interaction surface", async () => {
  const [workspace, relay, docs, cutover] = await Promise.all([
    readWorkspaceSurface(),
    read("cloud-app/lib/runtime-relay.ts"),
    read("docs/CLOUD-WORKSPACE.md"),
    read("docs/CLOUDFLARE-WORKERS-CUTOVER.md"),
  ]);
  assert.equal(canonicalWorkspaceUrl(), DEFAULT_WORKSPACE_URL);
  assert.match(workspace, /Mahoraga One|Mahoraga handles the lanes/);
  for (const label of ["Chat", "Work", "Files", "Advanced"]) {
    assert.match(workspace, new RegExp(`label: "${label}"`));
  }
  assert.match(workspace, /creditPolicy:\s*"zero-codex"/);
  assert.match(workspace, /Connect the Mahoraga brain/);
  assert.match(relay, /wss:\/\/mahoraga-relay\.mahoraga-mjw0123\.workers\.dev\/pair/);
  assert.match(docs, /single cloud-hosted workspace/i);
  assert.match(docs, /Cloudflare Workers/);
  assert.match(docs, /https:\/\/michaeljwilliams0123\.github\.io\/mahoraga\//);
  assert.match(cutover, /Workers yes, Tunnel no/i);
  assert.match(cutover, /no inbound\s+route to `127\.0\.0\.1:4782`/i);
});

test("legacy static and loopback UI entry points are absent while Pages derives the single cloud-app", async () => {
  for (const relative of [
    "cloud/index.html", "cloud/app.js", "cloud/styles.css",
    "web/index.html", "web/app.js", "web/autonomy-workspace.html",
  ]) {
    await assert.rejects(access(path.join(ROOT, relative)), { code: "ENOENT" });
  }
  const pages = await read(".github/workflows/pages.yml");
  assert.match(pages, /working-directory: cloud-app/);
  assert.match(pages, /MAHORAGA_PAGES_EXPORT:\s*"1"/);
  assert.match(pages, /actions\/deploy-pages@/);
});

test("runtime pairing is fixed-origin, encrypted, cancellable, memory-only, and not a route selector", async () => {
  const [workspace, relay] = await Promise.all([
    readWorkspaceSurface(),
    read("cloud-app/lib/runtime-relay.ts"),
  ]);
  assert.match(relay, /ECDH/);
  assert.match(relay, /HKDF/);
  assert.match(relay, /AES-GCM/);
  assert.match(relay, /async taskAction/);
  assert.match(relay, /async revoke/);
  assert.doesNotMatch(workspace, /conversationRoute|DefaultChatTransport|useChat\(/);
  assert.match(workspace, /runtimePollGeneration/);
  assert.match(workspace, /creditPolicy:\s*"zero-codex"/);
  await assert.rejects(access(path.join(ROOT, "cloud-app/app/api/chat/route.ts")), { code: "ENOENT" });
  assert.doesNotMatch(`${workspace}\n${relay}`, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});
