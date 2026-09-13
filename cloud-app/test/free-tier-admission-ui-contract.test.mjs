import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const workspace = readFileSync(join(root, "components/workspace.tsx"), "utf8");
const chat = readFileSync(join(root, "components/workspace/chat-view.tsx"), "utf8");
const types = readFileSync(join(root, "components/workspace/workspace-types.ts"), "utf8");

test("workspace models free-tier quota admission evidence", () => {
  assert.match(types, /FreeTierAdmission/);
  assert.match(types, /observedAt/);
  assert.match(types, /expiresAt/);
  assert.match(types, /available.*missing.*expired.*exhausted/s);
});

test("workspace derives admission state from runtime capability evidence", () => {
  assert.match(workspace, /freeTierAdmission/);
  assert.match(workspace, /billing-not-zero-credit/);
  assert.match(workspace, /quotaAttestation/);
});

test("chat shows quota state and clear routing holds", () => {
  assert.match(chat, /Cost route/);
  assert.match(chat, /Free tier available/);
  assert.match(chat, /Evidence missing/);
  assert.match(chat, /Evidence expired/);
  assert.match(chat, /Free tier exhausted/);
  assert.match(chat, /Routing held to protect zero-cost execution/);
});
