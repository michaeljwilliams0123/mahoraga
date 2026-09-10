import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8").catch(() => "");

test("Mahoraga One exposes human-first primary navigation and quick actions", async () => {
  const [types, workspace, chat] = await Promise.all([
    read("components/workspace/workspace-types.ts"),
    read("components/workspace.tsx"),
    read("components/workspace/chat-view.tsx"),
  ]);
  for (const label of ["Chat", "Work", "Files", "Advanced"]) assert.match(types, new RegExp(`label: "${label}"`));
  for (const action of ["Upload", "Build", "Report", "Handoff", "Create", "Ship"]) {
    assert.match(workspace + chat, new RegExp(`\\b${action}\\b`));
  }
  assert.match(workspace, /submitCore/);
  assert.doesNotMatch(workspace + chat, /api\.github\.com|github_pat_|ghp_/i);
});

test("Ship is a brain-routed owner intent rather than browser GitHub authority", async () => {
  const workspace = await read("components/workspace.tsx");
  assert.match(workspace, /Ship/);
  assert.match(workspace, /branch/i);
  assert.match(workspace, /verification/i);
  assert.match(workspace, /pull request/i);
  assert.match(workspace, /merge/i);
  assert.match(workspace, /modeOverride|"act"/);
});

test("Mahoraga One surfaces 7.0.0-alpha.2 without claiming Windows activation", async () => {
  const [shell, work, connections] = await Promise.all([
    read("components/workspace/workspace-shell.tsx"),
    read("components/workspace/work-view.tsx"),
    read("components/workspace/connections-view.tsx"),
  ]);
  assert.match(shell, /7\.0\.0-alpha\.2/);
  assert.match(work, /zero-credit lane/);
  assert.match(connections, /zero-credit/);
  assert.doesNotMatch(shell + work + connections, /Activate Mahoraga 7\.0\.0-alpha/);
});


test("Mahoraga One exposes durable brain states and explicit licensed retry", async () => {
  const [types, workspace, chat] = await Promise.all([
    read("components/workspace/workspace-types.ts"),
    read("components/workspace.tsx"),
    read("components/workspace/chat-view.tsx"),
  ]);
  assert.match(workspace, /\.resume\(\)/);
  assert.match(types, /"Connecting"[\s\S]*"Idle"[\s\S]*"Awake"[\s\S]*"Degraded"[\s\S]*"Offline"/);
  assert.match(workspace, /licensedRetry/);
  assert.match(workspace, /licensed-approved/);
  assert.match(workspace + chat, /Use licensed brain for this message/);
  assert.match(workspace, /creditPolicy:\s*ChatCreditPolicy\s*=\s*"zero-codex"/);
  assert.match(workspace, /creditPolicy === "zero-codex"/);
  assert.doesNotMatch(workspace, /zero-credit-provider-unavailable[^}]+submitCore\([^)]*"licensed-approved"/s);
});