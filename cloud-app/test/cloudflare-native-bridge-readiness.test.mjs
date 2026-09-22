import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("connected Cloudflare transport does not enable chat until assistant.respond is routable", async () => {
  const [workspace, chat] = await Promise.all([
    read("components/workspace.tsx"),
    read("components/workspace/chat-view.tsx"),
  ]);

  assert.match(workspace, /assistantReady/);
  assert.match(workspace, /capability === "assistant\.respond"/);
  assert.match(workspace, /item\.routable/);
  assert.match(workspace, /item\.enabled !== false/);
  assert.match(workspace, /if \(!assistantReady\)/);
  assert.match(chat, /assistantReady/);
  assert.match(chat, /Brain route unavailable/);
  assert.match(chat, /disabled=\{!assistantReady/);
});

test("sidebar brain readiness follows the assistant route and describes cloud bridge precedence truthfully", async () => {
  const [workspace, shell] = await Promise.all([
    read("components/workspace.tsx"),
    read("components/workspace/workspace-shell.tsx"),
  ]);

  assert.match(workspace, /<WorkspaceShell[\s\S]*coreReady=\{assistantReady\}/);
  assert.match(shell, /authenticated cloud bridge is the primary execution path/i);
  assert.match(shell, /encrypted relay remains recovery/i);
});
