import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("highest quality provider configuration remains bounded for future core-routed capability use", async () => {
  const source = await read("lib/runtime-config.ts");
  assert.match(source, /openai\/gpt-5\.6-sol/);
  assert.match(source, /reasoningMode:\s*"pro"/);
  assert.match(source, /reasoningEffort:\s*"max"/);
  assert.match(source, /zeroDataRetention:\s*true/);
});

test("browser capability implementation remains isolated and approval-gated but is not chat-route authority", async () => {
  const [toolSource, routeSource] = await Promise.all([
    read("lib/browser-tool.ts"),
    read("app/api/chat/route.ts"),
  ]);
  assert.match(toolSource, /needsApproval:\s*true/);
  assert.match(toolSource, /isolated:\s*true/);
  assert.match(toolSource, /extensionsEnabled:\s*false/);
  assert.match(toolSource, /localFileAccess:\s*false/);
  assert.match(toolSource, /browser-domain-not-allowed/);
  assert.match(routeSource, /core-gateway-required/);
  assert.doesNotMatch(routeSource, /cloudBrowserTool|streamText|@ai-sdk\/gateway/);
});

test("UI is an encrypted client and has no direct model transport or provider selector", async () => {
  const source = await read("components/workspace.tsx");
  assert.match(source, /new RuntimeRelay\(\)/);
  assert.match(source, /\/api\/health/);
  assert.match(source, /issues\/new\?template=codex-cloud-task\.yml/);
  assert.match(source, /Pair runtime/);
  assert.doesNotMatch(source, /useChat\(|DefaultChatTransport|sendMessage\(|conversationRoute|Cloud Pro/);
});

test("one Vercel workspace connects to the authoritative core through the paired encrypted relay", async () => {
  const [workspace, relay, health] = await Promise.all([
    read("components/workspace.tsx"),
    read("lib/runtime-relay.ts"),
    read("app/api/health/route.ts"),
  ]);
  assert.match(workspace, /Zero-Codex route/);
  assert.match(workspace, /Pair runtime/);
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
  assert.match(health, /authority:\s*"paired-mahoraga-core"/);
  assert.match(health, /browserMaySelectProvider:\s*false/);
});

test("accessible task starters only prepare the composer and preserve core authority", async () => {
  const source = await read("components/workspace.tsx");
  for (const label of ["Analyze a dataset", "Improve a repository", "Approved browser task", "Inspect fleet cycle"]) {
    assert.match(source, new RegExp(`title: "${label}"`));
  }
  assert.match(source, /function chooseStarter\(prompt: string\) \{\s*setInput\(prompt\);\s*composer\.current\?\.focus\(\);\s*\}/);
  assert.match(source, /type="button"[\s\S]*aria-label=\{`Start: \$\{starter\.title\}`\}[\s\S]*onClick=\{\(\) => chooseStarter\(starter\.prompt\)\}/);
  const handler = source.match(/function chooseStarter\(prompt: string\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.doesNotMatch(handler, /submit|sendMessage|fetch|setTaskMode|setConversationRoute/);
});

test("direct cloud conversation endpoint is retired fail-closed", async () => {
  const [route, health] = await Promise.all([read("app/api/chat/route.ts"), read("app/api/health/route.ts")]);
  assert.match(route, /status:\s*409/);
  assert.match(route, /core-gateway-required/);
  assert.doesNotMatch(route, /MAX_TOTAL_FILE_BYTES|CLOUD_MAX_STEPS|CLOUD_MAX_OUTPUT_TOKENS|compactConversation|streamText/);
  assert.match(health, /automaticPaidFallback:\s*false/);
  assert.match(health, /directConversationExecution:\s*false/);
  assert.match(health, /directProviderSelection:\s*false/);
});
