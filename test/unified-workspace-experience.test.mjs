import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("unified workspace delegates conversation authority to one Mahoraga core", async () => {
  const source = await read("cloud-app/components/workspace.tsx");
  assert.doesNotMatch(source, /type Route\s*=\s*"cloud"\s*\|\s*"runtime"/);
  assert.doesNotMatch(source, /setConversationRoute\("cloud"\)/);
  assert.doesNotMatch(source, /setConversationRoute\("runtime"\)/);
  assert.doesNotMatch(source, /DefaultChatTransport/);
  assert.match(source, /new RuntimeRelay\(\)/);
  assert.match(source, /Pair runtime/);
  assert.match(source, /no paid fallback/i);
  assert.match(source, /resetConversation/);
  assert.match(source, /messageContent\(message, conversationId\)/);
  assert.match(source, /taskAction\(task\.id, task\.conversationId, "cancel"\)/);
  assert.match(source, /runtimePollGeneration\.current !== pollGeneration[\s\S]*?taskAction\(result\.task\.id, result\.task\.conversationId, "cancel"\)/);
  assert.match(source, /finally\s*{\s*if \(runtimePollGeneration\.current === pollGeneration\)/);
});

test("cloud chat endpoint cannot remain a second user-addressable orchestration brain", async () => {
  const source = await read("cloud-app/app/api/chat/route.ts");
  assert.doesNotMatch(source, /import \{ gateway \} from "@ai-sdk\/gateway"/);
  assert.doesNotMatch(source, /\bstreamText\s*\(/);
  assert.doesNotMatch(source, /gateway\.tools\.perplexitySearch/);
  assert.doesNotMatch(source, /cloudBrowserTool/);
  assert.match(source, /core|gateway/i);
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
  const source = await read("cloud-app/components/workspace.tsx");
  for (const marker of ["Pair runtime", "Revoke", "Attach files", "Stop response", "aria-live=\"polite\""]) {
    assert.match(source, new RegExp(marker));
  }
  assert.doesNotMatch(source, />Cloud Pro</);
  assert.doesNotMatch(source, />Runtime<\/button>/);
});

test("starter actions are keyboard controls that never auto-submit or change routing authority", async () => {
  const source = await read("cloud-app/components/workspace.tsx");
  assert.equal((source.match(/title: "(?:Analyze a dataset|Improve a repository|Approved browser task)"/g) ?? []).length, 3);
  assert.match(source, /type="button"[\s\S]*onClick=\{\(\) => chooseStarter\(starter\.prompt\)\}/);
  const handler = source.match(/function chooseStarter\(prompt: string\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.match(handler, /setInput\(prompt\)/);
  assert.doesNotMatch(handler, /submit|sendMessage|fetch|setRouteMode|setConversationRoute/);
});
