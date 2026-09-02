import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("unified workspace renders cloud and paired-runtime conversations without route crossover", async () => {
  const source = await read("cloud-app/components/workspace.tsx");
  assert.match(source, /DefaultChatTransport/);
  assert.match(source, /new RuntimeRelay\(\)/);
  assert.match(source, /conversationRoute/);
  assert.match(source, /Zero-Codex route/);
  assert.match(source, /no paid fallback/i);
  assert.match(source, /setConversationRoute\("cloud"\)/);
  assert.match(source, /setConversationRoute\("runtime"\)/);
  assert.match(source, /resetConversation/);
  assert.match(source, /messageContent\(message, conversationId\)/);
  assert.match(source, /taskAction\(task\.id, task\.conversationId, "cancel"\)/);
  assert.match(source, /runtimePollGeneration\.current !== pollGeneration[\s\S]*?taskAction\(result\.task\.id, result\.task\.conversationId, "cancel"\)/);
  assert.match(source, /finally\s*{\s*if \(runtimePollGeneration\.current === pollGeneration\)/);
});

test("runtime relay keeps decrypted content in browser memory and rejects attachments", async () => {
  const source = await read("cloud-app/lib/runtime-relay.ts");
  assert.match(source, /async messages\(conversationId/);
  assert.match(source, /async messageContent/);
  assert.match(source, /relay-attachments-local-only/);
  assert.match(source, /rejectPending\("relay-revoked"\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});

test("single workspace exposes route, pairing, cancellation, files, and live status controls", async () => {
  const source = await read("cloud-app/components/workspace.tsx");
  for (const marker of ["Zero-Codex route", "Cloud Pro", "Pair runtime", "Revoke", "Attach files", "Stop response", "aria-live=\"polite\""]) {
    assert.match(source, new RegExp(marker));
  }
});
