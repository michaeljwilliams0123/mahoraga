import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("licensed ChatGPT/Codex remains an explicit bounded escalation", async () => {
  const [workspace, chat] = await Promise.all([read("components/workspace.tsx"), read("components/workspace/chat-view.tsx")]);
  assert.match(workspace, /creditPolicy: ChatCreditPolicy = "zero-codex"/);
  assert.match(workspace, /licensed-approved/);
  assert.match(workspace, /will not retry licensed routes automatically/i);
  assert.match(chat, /Use licensed ChatGPT\/Codex for this message/);
  assert.doesNotMatch(workspace, /catch[\s\S]{0,500}submitCore\([^)]*"licensed-approved"/);
});

test("Windows 3.6.0 is presented only as legacy rollback metadata", async () => {
  const [workspace, cockpit] = await Promise.all([read("components/workspace.tsx"), read("components/cockpit/CommandCockpit.tsx")]);
  assert.doesNotMatch(workspace, /Windows 3\.6\.0 remains/);
  assert.doesNotMatch(cockpit, /Windows production stays 3\.6\.0|3\.6\.0 locked/);
  assert.match(cockpit, /active Windows runtime/i);
  assert.match(cockpit, /legacy rollback predecessor.*3\.6\.0/i);
});
