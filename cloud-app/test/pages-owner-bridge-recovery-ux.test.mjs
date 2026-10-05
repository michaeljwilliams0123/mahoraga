import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("Pages keeps execution connector optional and relay recovery explicit", async () => {
  const [workspace, chat, pagesWorkflow] = await Promise.all([
    read("components/workspace.tsx"),
    read("components/workspace/chat-view.tsx"),
    read("../.github/workflows/pages.yml"),
  ]);

  assert.match(workspace, /relay-pairing-offer-invalid/);
  assert.match(workspace, /Do not enter the owner PIN here/i);
  assert.match(workspace, /authenticated execution runtime could not be reached/i);
  assert.doesNotMatch(workspace, /authenticated cloud runtime could not be reached/i);
  assert.match(chat, /NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN/);
  assert.match(chat, /cloudBridgeOrigin &&/);
  assert.match(chat, /Open Cloudflare sign-in/i);
  assert.match(chat, /Retry execution connection/i);
  assert.match(chat, /window\.open\(/);
  assert.match(chat, /onClick=\{reconnectRuntime\}/);
  assert.doesNotMatch(chat, /window\.location\.reload\(\)/);
  assert.match(chat, /Do not enter your owner PIN here/i);
  assert.match(pagesWorkflow, /NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN:\s*\$\{\{\s*vars\.MAHORAGA_PAGES_BRIDGE_ORIGIN\s*\}\}/);
  assert.doesNotMatch(pagesWorkflow, /MAHORAGA_PAGES_BRIDGE_ORIGIN\s*\|\|/);
});
