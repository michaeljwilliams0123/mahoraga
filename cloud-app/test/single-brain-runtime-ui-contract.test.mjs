import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8").catch(() => "");

test("7.0 workspace hides user port choice and brands one product", async () => {
  const [cockpit, shell, chat, workspace] = await Promise.all([
    read("components/cockpit/CommandCockpit.tsx"),
    read("components/workspace/workspace-shell.tsx"),
    read("components/workspace/chat-view.tsx"),
    read("components/workspace.tsx"),
  ]);

  assert.match(cockpit, /<span className="cockpit-eyebrow">Mahoraga<\/span>/);
  assert.doesNotMatch(cockpit, /Mahoraga 7\.0\.0-alpha\.2 workspace/);
  assert.match(cockpit, /RUNTIME_4782/);
  assert.match(cockpit, /4783_SHADOW_OPERATOR/);
  assert.match(cockpit, /operator-only transient candidate\/shadow/);
  assert.match(cockpit, /brain-routed/);
  assert.match(cockpit, /no port picker/);
  assert.doesNotMatch(cockpit, /choose 4782 vs 4783|select a port|port picker/i);

  assert.match(shell, /<strong>Mahoraga<\/strong><span>One system<\/span>/);
  assert.match(shell, /Brain-routed\. No lane or port selection\./);
  assert.doesNotMatch(shell, /Mahoraga[^\n]{0,80}\d+\.\d+\.\d+/);

  assert.match(chat, /no lane or port selection/);
  assert.match(chat, /Brain-routed/);

  assert.match(workspace, /brain-routed/);
  assert.match(workspace, /no lane or port selection/);
  assert.doesNotMatch(workspace + chat + cockpit, /Activate Mahoraga 7\.0\.0-alpha/);
});
