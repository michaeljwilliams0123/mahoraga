import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");
const missing = async (relative) => {
  try {
    await access(new URL(`../${relative}`, import.meta.url));
    return false;
  } catch {
    return true;
  }
};

async function readWorkspaceSurface() {
  const [workspace, shell, chatView] = await Promise.all([
    read("cloud-app/components/workspace.tsx"),
    read("cloud-app/components/workspace/workspace-shell.tsx"),
    read("cloud-app/components/workspace/chat-view.tsx"),
  ]);
  return `${workspace}\n${shell}\n${chatView}`;
}

test("unified workspace delegates conversation authority to one Mahoraga core", async () => {
  const source = await readWorkspaceSurface();
  assert.doesNotMatch(source, /type Route\s*=\s*"cloud"\s*\|\s*"runtime"/);
  assert.doesNotMatch(source, /setConversationRoute\("cloud"\)/);
  assert.doesNotMatch(source, /setConversationRoute\("runtime"\)/);
  assert.doesNotMatch(source, /DefaultChatTransport/);
  assert.match(source, /new RuntimeRelay\(\)/);
  assert.match(source, /Connect the Mahoraga brain/);
  assert.match(source, /no paid fallback/i);
  assert.match(source, /resetConversation/);
  assert.match(source, /messageContent\(message, conversationId\)/);
  assert.match(source, /taskAction\(task\.id, task\.conversationId, "cancel"\)/);
  assert.match(source, /runtimePollGeneration\.current !== pollGeneration[\s\S]*?taskAction\(result\.task\.id, result\.task\.conversationId, "cancel"\)/);
  assert.match(source, /finally\s*{\s*if \(runtimePollGeneration\.current === pollGeneration\)/);
});

test("cloud chat endpoint cannot remain a second user-addressable orchestration brain", async () => {
  assert.equal(await missing("cloud-app/app/api/chat/route.ts"), true);
});

test("runtime relay keeps decrypted content in browser memory and rejects attachments", async () => {
  const source = await read("cloud-app/lib/runtime-relay.ts");
  assert.match(source, /async messages\(conversationId/);
  assert.match(source, /async messageContent/);
  assert.match(source, /relay-attachments-local-only/);
  assert.match(source, /rejectPending\("relay-revoked"\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});

test("single workspace exposes pairing, cancellation, files, and live status without a route selector", async () => {
  const source = await readWorkspaceSurface();
  for (const marker of ["Connect the Mahoraga brain", "Disconnect", "Upload files", "Stop response", 'aria-live="polite"']) {
    assert.match(source, new RegExp(marker));
  }
  assert.doesNotMatch(source, />Cloud Pro</);
  assert.doesNotMatch(source, />Runtime<\/button>/);
});

test("starter actions are keyboard controls that never auto-submit or change routing authority", async () => {
  const source = await readWorkspaceSurface();
  assert.equal((source.match(/title: "(?:Analyze something|Improve Mahoraga|Work in the browser)"/g) ?? []).length, 3);
  assert.match(source, /type="button"[\s\S]*onClick=\{\(\) => chooseStarter\(starter\.prompt\)\}/);
  const handler = source.match(/function chooseStarter\(prompt: string\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.match(handler, /setInput\(prompt\)/);
  assert.doesNotMatch(handler, /submit|sendMessage|fetch|setRouteMode|setConversationRoute/);
});
