import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const source = await readFile(new URL("../lib/chat-execution-evidence.ts", import.meta.url), "utf8");
const api = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`);
const receipt = {workerId:"execution-runtime-do",providerId:"mahoraga-native-github-inspect",
costClass:"deterministic",creditPolicy:"zero-codex",sourceSHA:"a".repeat(40)};
const task = {id:"turn-1",conversationId:"conversation-1",status:"completed",executionReceipt:receipt};
const message = {id:"assistant-1",role:"assistant",taskId:"turn-1"};

test("present, missing and mismatch are bounded runtime-only persistence observations", () => {
  for (const state of ["matched","missing","mismatch","not-observed"]) {
    const x=api.projectMessageExecution(message,[{...task,executionReceipt:{...receipt,persistedResultObservation:state}}],"conversation-1");
    assert.equal(x.status,"reported");
    assert.equal(x.persistedResultObservation,state);
  }
});

test("unrecognized or fabricated verification flags do not cross into view", () => {
  const x=api.projectMessageExecution(message,[{...task,executionReceipt:{...receipt,persistedResultObservation:"secret-here",durableResultVerified:true,replayed:true,authorityVerified:true,plaintext:"confidential"}}],"conversation-1");
  assert.equal(x.status,"reported");
  assert.equal(x.persistedResultObservation,undefined);
  assert.doesNotMatch(JSON.stringify(x),/secret-here|confidential|durableResultVerified|replayed|authorityVerified/);
});

test("stored-result observation follows exact task correlation and saved history", () => {
  const tasks=[{...task,executionReceipt:{...receipt,persistedResultObservation:"matched"}}];
  const saved=api.projectSavedConversation([{id:"assistant-1",role:"assistant",text:"saved"}],[message],tasks,"conversation-1");
  assert.equal(saved[0].executionEvidence.persistedResultObservation,"matched");
  const wrong=api.projectMessageExecution(message,[{...tasks[0],conversationId:"wrong"}],"conversation-1");
  assert.equal(wrong.status,"unavailable");
});

test("production tasks endpoint describes the actual stored record rather than setting true",async () => {
  const backend=await readFile(new URL("../../deploy/cloudflare-execution-runtime/worker.ts",import.meta.url),"utf8");
  assert.match(backend,/observePersistedTurnResult\(turn/);
  assert.match(backend,/persistedResultObservation:/);
  assert.doesNotMatch(backend,/persistedResultObservation:\s*"matched"/);
});
