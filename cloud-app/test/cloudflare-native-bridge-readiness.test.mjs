import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("connected transport gates normal chat on assistant.respond and explicit simulation on its deterministic route", async () => {
  const [workspace, chat] = await Promise.all([
    read("components/workspace.tsx"),
    read("components/workspace/chat-view.tsx"),
  ]);

  assert.match(workspace, /assistantReady/);
  assert.match(workspace, /capability === "assistant\.respond"/);
  assert.match(workspace, /item\.routable/);
  assert.match(workspace, /item\.enabled !== false/);
  assert.match(workspace, /if \(!assistantReady && !canSubmitDeterministicCognitiveChat\(coreReady, runtimeCapabilities, text, files\.length\)\)/);
  assert.match(chat, /assistantReady/);
  assert.match(chat, /Brain route unavailable/);
  assert.match(chat, /const canSend = assistantReady \|\| canSubmitDeterministicCognitiveChat\(coreReady, runtimeCapabilities, input, files\.length\)/);
  assert.match(chat, /disabled=\{!canSend/);
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

test("telemetry stream is authenticated, origin-bound, and mounted in the cockpit", async () => {
  const [worker, bindings, telemetry, cockpit, command] = await Promise.all([
    read("../deploy/cloudflare-execution-runtime/worker.ts"),
    read("../deploy/cloudflare-execution-runtime/bindings.d.ts"),
    read("components/cockpit/TelemetrySparkline.tsx"),
    read("components/cockpit/CockpitView.tsx"),
    read("components/cockpit/CommandCockpit.tsx"),
  ]);

  assert.match(worker, /\/api\/stream\/telemetry/);
  assert.match(worker, /authorization/);
  assert.match(worker, /secureEqual\(token, env\.TELEMETRY_STREAM_TOKEN\)/);
  assert.match(worker, /telemetry-session-unavailable/);
  assert.match(worker, /origin !== env\.MAHORAGA_WORKSPACE_ORIGIN/);
  assert.match(worker, /text\/event-stream/);
  assert.match(worker, /live_cpu_usage_ms: null/);
  assert.match(bindings, /TELEMETRY_STREAM_TOKEN\?: string/);
  assert.doesNotMatch(telemetry, /authorization:\s*`Bearer/);
  assert.doesNotMatch(telemetry, /\?token=/);
  assert.match(telemetry, /CPU and memory stay unreported/);
  assert.match(telemetry, /telemetry unavailable/);
  assert.match(telemetry, /telemetry-session-unavailable/);
  assert.match(cockpit, /<TelemetrySparkline \/>/);
  assert.match(cockpit, /telemetry unavailable/);
  assert.match(cockpit, /telemetry-session-unavailable/);
  assert.match(command, /telemetry-session-unavailable/);
  assert.doesNotMatch(telemetry, /localStorage|MAHORAGA_SESSION_TOKEN|authorization:\s*`Bearer/);
  assert.doesNotMatch(cockpit, /localStorage\.getItem/);
  assert.doesNotMatch(telemetry, /railway\.app|live Railway fallback/);
  assert.match(telemetry, /No live Railway fallback/);
  assert.match(telemetry, /Owner-authenticated telemetry transport is not available/);
  assert.match(cockpit, /Product name stays|Mahoraga|productName/);
});
