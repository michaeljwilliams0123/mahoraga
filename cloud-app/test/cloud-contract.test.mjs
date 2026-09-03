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
  assert.match(source, /issues\/new\?template=codex-cloud-task\.yml/);
  assert.doesNotMatch(source, /capabilities\.gitlab|capabilities\.github\b/);
});

test("one Vercel workspace can route to an explicitly paired encrypted runtime", async () => {
  const [workspace, relay, health] = await Promise.all([
    read("components/workspace.tsx"),
    read("lib/runtime-relay.ts"),
    read("app/api/health/route.ts"),
  ]);
  assert.match(workspace, /Zero-Codex route/);
  assert.match(workspace, /Pair runtime/);
  assert.match(workspace, /conversationRoute/);
  assert.match(workspace, /creditPolicy:\s*"zero-codex"/);
  assert.match(workspace, /no paid fallback/i);
  assert.match(workspace, /No verified zero-credit language provider is connected yet/);
  assert.match(relay, /wss:\/\/relay\.mahoraga\.app\/pair/);
  assert.match(relay, /ECDH/);
  assert.match(relay, /HKDF/);
  assert.match(relay, /AES-GCM/);
  assert.match(relay, /relay-attachments-local-only/);
  assert.match(health, /relaySeesPlaintext:\s*false/);
  assert.match(health, /localExtensionRequired:\s*false/);
});

test("accessible task starters only prepare the composer and preserve Zero-Codex", async () => {
  const source = await read("components/workspace.tsx");
  for (const label of ["Analyze a dataset", "Improve a repository", "Approved browser task"]) {
    assert.match(source, new RegExp(`title: "${label}"`));
  }
  assert.match(source, /useState<RouteMode>\("efficient"\)/);
  assert.match(source, /function chooseStarter\(prompt: string\) \{\s*setInput\(prompt\);\s*composer\.current\?\.focus\(\);\s*\}/);
  assert.match(source, /type="button"[\s\S]*aria-label=\{`Start: \$\{starter\.title\}`\}[\s\S]*onClick=\{\(\) => chooseStarter\(starter\.prompt\)\}/);
  const handler = source.match(/function chooseStarter\(prompt: string\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.doesNotMatch(handler, /submit|sendMessage|fetch|setRouteMode|setConversationRoute/);
});

test("server enforces bounded attachments and deliberately compact cloud budgets", async () => {
  const [source, health] = await Promise.all([read("app/api/chat/route.ts"), read("app/api/health/route.ts")]);
  assert.match(source, /MAX_TOTAL_FILE_BYTES/);
  assert.match(source, /status:\s*413/);
  assert.match(source, /CLOUD_MAX_STEPS/);
  assert.match(source, /CLOUD_MAX_OUTPUT_TOKENS/);
  assert.match(source, /compactConversation/);
  assert.match(health, /automaticPaidFallback:\s*false/);
  assert.match(health, /cloudRequiresExplicitSelection:\s*true/);
});
