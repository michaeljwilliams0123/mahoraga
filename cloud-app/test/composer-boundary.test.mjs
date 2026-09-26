import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("composer grows with input while preserving the explicit text boundary", async () => {
  const [chat, styles, config] = await Promise.all([
    read("components/workspace/chat-view.tsx"),
    read("app/globals.css"),
    read("lib/runtime-config.ts"),
  ]);

  assert.match(config, /MAX_INPUT_TEXT_CHARS = 12_000/);
  assert.match(chat, /maxLength={MAX_INPUT_TEXT_CHARS}/);
  assert.match(chat, /rows={1}/);
  assert.match(chat, /useLayoutEffect/);
  assert.match(chat, /Math\.min\(element\.scrollHeight, 300\)/);
  assert.match(chat, /composer-character-count/);
  assert.match(chat, /input\.length >= MAX_INPUT_TEXT_CHARS \* 0\.9/);
  assert.match(styles, /max-height: 300px/);
  assert.match(styles, /\.composer-count\.near-limit/);
});

test("workspace never turns assistant prose or browser-stored tokens into execution authority", async () => {
  const [workspace, chat, relay] = await Promise.all([
    read("components/workspace.tsx"),
    read("components/workspace/chat-view.tsx"),
    read("lib/runtime-relay.ts"),
  ]);
  const browserSurface = workspace + chat + relay;

  assert.doesNotMatch(browserSurface, /JSON\.parse\(\s*(?:rawStreamText|message\.text|rawText)/);
  assert.doesNotMatch(browserSurface, /cloudflare_access_jwt|mock-token-fallback|sendSilentAdjustmentRequest/);
  assert.doesNotMatch(browserSurface, /https:\/\/workers\.dev/);
  assert.match(relay, /this\.call<RuntimeChatResult>\("chat"/);
  assert.match(relay, /x-mahoraga-request-nonce/);
});
