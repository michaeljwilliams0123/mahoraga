import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  deriveConversationTitle,
  discardPendingAttachments,
  filesFromClipboard,
  renderAssistantMarkdown,
} from "../web/chat-experience.mjs";

test("clipboard intake collapses duplicate browser representations of one pasted image", () => {
  const fromItem = { name: "image.png", size: 169676, type: "image/png", lastModified: 10 };
  const fromFiles = { name: "image.png", size: 169676, type: "image/png", lastModified: 11 };
  const files = filesFromClipboard({
    items: [{ kind: "file", getAsFile: () => fromItem }],
    files: [fromFiles],
  });

  assert.deepEqual(files, [fromItem]);
});

test("new chat clears every pending attachment and releases each private upload once", async () => {
  const released = [];
  const attachments = [{ id: "art-a" }, { id: "art-a" }, { id: "art-b" }];

  const result = await discardPendingAttachments(attachments, async (id) => {
    released.push(id);
    if (id === "art-b") throw new Error("already-removed");
  });

  assert.deepEqual(released, ["art-a", "art-b"]);
  assert.deepEqual(result, { released: 1, failed: 1 });
});

test("conversation titles describe the topic instead of copying command filler", () => {
  assert.equal(deriveConversationTitle("Can you tell me about why it rains outside?"), "Why it rains outside");
  assert.equal(deriveConversationTitle("Please inspect the current repository and summarize its production state"), "Repository production state");
});

test("assistant answers render useful structure while keeping HTML inert", () => {
  const html = renderAssistantMarkdown([
    "## Why rain forms",
    "Rain falls when water vapor condenses into droplets.",
    "- Cooling air",
    "- Droplet growth",
    "`humidity` matters",
    "<script>alert('x')</script>",
  ].join("\n"));

  assert.match(html, /<h2>Why rain forms<\/h2>/);
  assert.match(html, /<ul><li>Cooling air<\/li><li>Droplet growth<\/li><\/ul>/);
  assert.match(html, /<code>humidity<\/code>/);
  // Verify no dangerous unescaped tags are present
  assert.doesNotMatch(html, /(?<!&lt;)<script(?:\s|>|$)/i);
  assert.doesNotMatch(html, /(?<!&lt;)on\w+\s*=/i);
  // Verify dangerous content is properly escaped
  assert.match(html, /&lt;script&gt;/);
});

test("cloud UI resolves encrypted message content locally and removes the temporary progress card", async () => {
  const source = await readFile(new URL("../cloud/app.js", import.meta.url), "utf8");

  assert.match(source, /messageContent\(message, (?:_?conversationId)\)/);
  assert.match(source, /\/api\/content\/\$\{message\.contentReference\}/);
  assert.match(source, /clearPendingTaskMessage\(\)/);
  assert.doesNotMatch(source, /message\.content \|\| 'Mahoraga completed the task\.'/);
});

test("unified chat controls remain functional for loopback and encrypted relay transports", async () => {
  const source = await readFile(new URL("../cloud/app.js", import.meta.url), "utf8");

  assert.match(source, /class RelayTransport[\s\S]*async chat\(input\)/);
  assert.match(source, /class RelayTransport[\s\S]*async tasks\(conversationId\)/);
  assert.match(source, /class RelayTransport[\s\S]*async messages\(conversationId\)/);
  assert.match(source, /class RelayTransport[\s\S]*async messageContent\(message, conversationId\)/);
  assert.match(source, /class RelayTransport[\s\S]*async taskAction\(taskId, conversationId, action\)/);
  assert.match(source, /currentRun = \{ kind: 'task'/);
  assert.match(source, /\$\('chat-mode'\)\.value = request\.mode/);
  assert.match(source, /taskAction\(state\.currentRun\.id/);
  assert.match(source, /replayAttachmentIds/);
});
