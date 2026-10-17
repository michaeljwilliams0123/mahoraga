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

test("reconnect drops impossible GitHub results while preserving valid task metadata", () => {
  for (const githubActionReceipt of [
    { action: "merge", kind: "pull-request", number: 12, outcome: "success" },
    { action: "create", kind: "issue", number: 12, headSha: sha, outcome: "accepted" },
    { action: "dispatch", kind: "workflow", headSha: sha, outcome: "success" },
    { action: "status", kind: "repository", mainSha: sha, outcome: "success" },
    { action: "checks", kind: "pull-request", headSha: sha, outcome: "success" },
    { action: "comment-delete", kind: "comment", number: 12, outcome: "accepted" },
    { action: "issue-create", kind: "pull-request", number: 12, outcome: "accepted" },
  ]) {
    const projected = api.projectMessageExecution(message, [{ ...task,
      executionReceipt: { ...receipt, githubActionReceipt } }], "conversation-8");
    assert.equal(projected.status, "reported");
    assert.equal(projected.githubActionReceipt, undefined, JSON.stringify(githubActionReceipt));
  }
});

test("all native action receipts retain their actual result on reconnect", () => {
  for (const githubActionReceipt of [
    { action: "status", kind: "repository", mainSha: sha, outcome: "observed" },
    { action: "create", kind: "pull-request", number: 12, headSha: sha, outcome: "accepted" },
    { action: "merge", kind: "pull-request", number: 12, headSha: sha, mainSha: sha, outcome: "success" },
    { action: "dispatch", kind: "workflow", headSha: sha, outcome: "accepted" },
    ...["checks", "diagnose"].flatMap(action => ["pending", "success", "failure"].map(outcome =>
      ({ action, kind: "pull-request", number: 12, headSha: sha, outcome }))),
    ...["issue-create", "issue-update", "pr-update"].map(action =>
      ({ action, kind: action === "pr-update" ? "pull-request" : "issue", number: 12, outcome: "accepted" })),
    ...["comment-create", "comment-delete"].map(action =>
      ({ action, kind: "comment", number: 12, commentId: 91, outcome: "accepted" })),
  ]) {
    const projected = api.projectMessageExecution(message, [{ ...task,
      executionReceipt: { ...receipt, githubActionReceipt } }], "conversation-8");
    assert.deepEqual(projected.githubActionReceipt, githubActionReceipt);
  }
});
