import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("cloud bridge failure keeps Cloudflare sign-in primary and relay recovery explicit", async () => {
  const [workspace, chat] = await Promise.all([
    read("components/workspace.tsx"),
    read("components/workspace/chat-view.tsx"),
  ]);

  assert.match(workspace, /relay-pairing-offer-invalid/);
  assert.match(workspace, /Do not enter the owner PIN here/i);
  assert.match(chat, /NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN/);
  assert.match(chat, /Open Cloudflare sign-in/i);
  assert.match(chat, /Retry cloud connection/i);
  assert.match(chat, /window\.open\(/);
  assert.match(chat, /window\.location\.reload\(\)/);
  assert.match(chat, /Do not enter your owner PIN here/i);
});
