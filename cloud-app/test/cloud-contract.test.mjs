import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const missing = async (path) => {
  try {
    await access(new URL(path, root));
    return false;
  } catch {
    return true;
  }
};

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
  const [source, shell] = await Promise.all([
    read("components/workspace.tsx"),
    read("components/workspace/workspace-shell.tsx"),
  ]);
  assert.match(source, /new RuntimeRelay\(\)/);
  assert.match(source, /\/api\/health/);
  assert.match(shell, /issues\/new\?template=codex-cloud-task\.yml/);
  assert.match(source, /Pair runtime/);
  assert.doesNotMatch(source, /useChat\(|DefaultChatTransport|sendMessage\(|conversationRoute|Cloud Pro/);
});

test("one Vercel workspace connects to the authoritative core through the paired encrypted relay", async () => {
  const [workspace, chat, relay, health] = await Promise.all([
    read("components/workspace.tsx"),
    read("components/workspace/chat-view.tsx"),
    read("lib/runtime-relay.ts"),
    read("app/api/health/route.ts"),
  ]);
  assert.match(chat, /Zero-Codex route/);
  assert.match(chat, /Pair runtime/);
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
  assert.match(source, /function chooseStarter\(prompt: string\) \{\s*setInput\(prompt\);\s*setView\("chat"\);\s*composer\.current\?\.focus\(\);\s*\}/);
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

test("operations is core-mediated, not a browser GitHub authority route", async () => {
  assert.equal(await missing("app/api/fleet-status/route.ts"), true);
  const [relay, operationsView, workspace] = await Promise.all([
    read("lib/runtime-relay.ts"),
    read("components/workspace/operations-view.tsx"),
    read("components/workspace.tsx"),
  ]);
  assert.match(relay, /operationsSnapshot|operations-snapshot/);
  assert.match(relay, /operationsAction|operations-action/);
  assert.doesNotMatch(relay, /api\.github\.com/);
  assert.doesNotMatch(operationsView, /api\.github\.com|\/api\/fleet-status/);
  assert.doesNotMatch(workspace, /api\.github\.com|\/api\/fleet-status/);
  assert.match(operationsView, /Pair runtime to load Operations/);
  assert.match(operationsView, /operationsAction\(/);
  assert.match(operationsView, /Confirm as owner/);
  assert.match(operationsView, /will not self-approve/);
  assert.doesNotMatch(operationsView, /confirmationToken:\s*["']auto["']/i);
  assert.doesNotMatch(operationsView, /confirm:\s*true\s*,\s*\/\/\s*auto/i);
});

test("canonical workspace navigation contains only complete in-app surfaces", async () => {
  const [types, nav, shell] = await Promise.all([
    read("components/workspace/workspace-types.ts"),
    read("components/workspace/workspace-nav.tsx"),
    read("components/workspace/workspace-shell.tsx"),
  ]);
  for (const label of ["Chat", "Control Center", "Operations", "Connections"]) {
    assert.match(types, new RegExp(`label: "${label}"`));
  }
  for (const retired of ["Agents", "Plugins & Connections", "Files & Data", "Browser", "Automations", "Activity", "Settings"]) {
    assert.doesNotMatch(types, new RegExp(`label: "${retired}"`));
  }
  assert.match(nav, /WORKSPACE_NAV_ITEMS/);
  assert.match(nav, /setView\(item\.id\)/);
  assert.doesNotMatch(nav, /href=["']https?:/);
  assert.match(shell, /WorkspaceNav/);
  assert.match(shell, /Single browser surface/);
});

test("chat contracts remain owned by RuntimeRelay with zero-codex and no paid fallback", async () => {
  const [workspace, chat] = await Promise.all([
    read("components/workspace.tsx"),
    read("components/workspace/chat-view.tsx"),
  ]);
  assert.match(workspace, /new RuntimeRelay\(\)/);
  assert.match(workspace, /creditPolicy:\s*"zero-codex"/);
  assert.match(workspace, /taskAction\(task\.id, task\.conversationId, "cancel"\)/);
  assert.match(chat, /Zero-Codex route · no paid fallback/);
  assert.match(chat, /Pair runtime/);
  assert.doesNotMatch(workspace, /useChat\(|DefaultChatTransport|Cloud Pro/);
});
