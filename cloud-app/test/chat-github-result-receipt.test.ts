import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const source = await readFile(new URL("../lib/chat-execution-evidence.ts", import.meta.url), "utf8");
const api = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`);
const sha = "a".repeat(40);
const message = { id: "assistant-8", role: "assistant", taskId: "turn-8" };
const receipt = {
  workerId: "execution-runtime-do", providerId: "mahoraga-native-github-pr-create",
  costClass: "deterministic", creditPolicy: "zero-codex", sourceSHA: sha,
  githubActionReceipt: { action: "create", kind: "pull-request", number: 1148,
    headSha: sha, outcome: "accepted", secret: "must-not-leak" },
};
const task = { id: "turn-8", conversationId: "conversation-8", status: "completed", executionReceipt: receipt };

test("native GitHub result follows exact task and conversation after reconnect", () => {
  const projected = api.projectMessageExecution(message, [task], "conversation-8");
  assert.equal(projected.status, "reported");
  assert.deepEqual(projected.githubActionReceipt, {
    action: "create", kind: "pull-request", number: 1148, headSha: sha, outcome: "accepted",
  });
  const saved = api.projectSavedConversation([{id:"assistant-8",role:"assistant",text:"Encrypted content decrypted only for owner"}],
    [message], [task], "conversation-8");
  assert.equal(saved[0].executionEvidence.githubActionReceipt.number, 1148);
  assert.doesNotMatch(JSON.stringify(projected), /must-not-leak/);
});

test("foreign task, failed turn or malformed GitHub outcome is not presented as success", () => {
  assert.equal(api.projectMessageExecution(message, [{...task, conversationId:"someone-else"}], "conversation-8").status, "unavailable");
  assert.equal(api.projectMessageExecution(message, [{...task, status:"failed"}], "conversation-8").status, "unavailable");
  const bad = { ...task, executionReceipt: { ...receipt,
    githubActionReceipt: { action:"create",kind:"pull-request",outcome:"success",mainSha:"not-a-sha" } } };
  const projected = api.projectMessageExecution(message,[bad],"conversation-8");
  assert.equal(projected.status,"reported");
  assert.equal(projected.githubActionReceipt,undefined);
});
