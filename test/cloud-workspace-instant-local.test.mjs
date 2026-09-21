import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("workspace marks deterministic arithmetic only from explicit calculate-task provenance", () => {
  const workspace = read("cloud-app/components/workspace.tsx");
  const relay = read("cloud-app/lib/runtime-relay.ts");
  const chat = read("cloud-app/components/workspace/chat-view.tsx");
  const styles = read("cloud-app/app/globals.css");

  assert.match(workspace, /prompt: "2\+2"/);
  assert.match(workspace, /syncRuntimeMessages\(transport, conversationId, runtimeMessages, tasks\)/);
  assert.match(workspace, /sourceTask\?\.capability === "assistant\.calculate"/);
  assert.match(relay, /capability\?: string \| null/);
  assert.match(relay, /taskId\?: string \| null/);
  assert.match(chat, /Instant · local/);
  assert.doesNotMatch(styles, /PLACEHOLDER_USE_DISK/);
});
