import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("highest quality model is fixed to GPT-5.6 Sol in pro/max mode", async () => {
  const source = await read("lib/runtime-config.ts");
  assert.match(source, /openai\/gpt-5\.6-sol/);
  assert.match(source, /reasoningMode:\s*"pro"/);
  assert.match(source, /reasoningEffort:\s*"max"/);
  assert.match(source, /zeroDataRetention:\s*true/);
});

test("browser execution is cloud-only, allowlisted, and approval-gated", async () => {
  const [toolSource, routeSource] = await Promise.all([
    read("lib/browser-tool.ts"),
    read("app/api/chat/route.ts"),
  ]);
  assert.match(toolSource, /needsApproval:\s*true/);
  assert.match(toolSource, /isolated:\s*true/);
  assert.match(toolSource, /extensionsEnabled:\s*false/);
  assert.match(toolSource, /localFileAccess:\s*false/);
  assert.match(toolSource, /browser-domain-not-allowed/);
  assert.match(routeSource, /experimental_toolApprovalSecret/);
});

test("UI uses real streaming chat, attachments, sources, and backend readiness", async () => {
  const source = await read("components/workspace.tsx");
  assert.match(source, /useChat\(/);
  assert.match(source, /DefaultChatTransport/);
  assert.match(source, /sendMessage\(\{ text, files:/);
  assert.match(source, /source-url/);
  assert.match(source, /\/api\/health/);
  assert.match(source, /MessageResponse/);
});

test("server enforces bounded attachments and tool loops", async () => {
  const source = await read("app/api/chat/route.ts");
  assert.match(source, /MAX_TOTAL_FILE_BYTES/);
  assert.match(source, /status:\s*413/);
  assert.match(source, /stepCountIs\(8\)/);
  assert.match(source, /maxOutputTokens:\s*32_000/);
});
