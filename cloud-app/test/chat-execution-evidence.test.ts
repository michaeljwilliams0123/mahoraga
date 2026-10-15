import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const source = await readFile(new URL("../lib/chat-execution-evidence.ts", import.meta.url), "utf8").catch(() => "");
const api = source ? await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`) : {};
const receipt = { workerId:"execution-runtime-do",providerId:"cloudflare-workers-ai",costClass:"cloud-open-weight",creditPolicy:"zero-codex" };
const message = { id:"answer-1",role:"assistant",taskId:"turn-1" };
const task = { id:"turn-1",conversationId:"conversation-1",status:"completed",executionReceipt:receipt };
function project(m: unknown = message, tasks: unknown = [task], conversation = "conversation-1") {
  assert.equal(typeof api.projectMessageExecution,"function","chat must project correlated execution metadata");
  return api.projectMessageExecution(m,tasks,conversation);
}

test("completed correlated task exposes only runtime-reported metadata",()=>{
  assert.deepEqual(project(),{status:"reported",taskId:"turn-1",workerId:receipt.workerId,
    providerId:receipt.providerId,costClass:receipt.costClass,creditPolicy:receipt.creditPolicy});
});
test("missing, malformed or partial metadata remains unavailable",()=>{
  for(const executionReceipt of [undefined,null,{},"raw",{...receipt,workerId:undefined}]) {
    assert.equal(project(message,[{...task,executionReceipt}]).status,"unavailable");
  }
});
test("message, task and conversation must correlate uniquely",()=>{
  for(const tasks of [[],[task,task],[{...task,id:"other"}],[{...task,conversationId:"other"}]]) {
    assert.equal(project(message,tasks).status,"unavailable");
  }
  assert.equal(project({...message,taskId:undefined}).status,"unavailable");
  assert.equal(project({...message,role:"user"}).status,"unavailable");
});
test("failed, waiting and running tasks cannot display completed execution metadata",()=>{
  for(const status of ["failed","waiting","cancelled","running","unexpected"]) {
    assert.equal(project(message,[{...task,status}]).status,"unavailable");
  }
});
test("invalid labels and unknown policy values fail closed without reflecting private input",()=>{
  for(const invalid of [{providerId:"https://private.example/token"},{workerId:"x".repeat(200)},
    {costClass:"private-sentinel"},{creditPolicy:"private-sentinel"},{memoryState:"private-sentinel"}]) {
    const result = project(message,[{...task,executionReceipt:{...receipt,...invalid}}]);
    assert.equal(result.status,"unavailable");
    assert.doesNotMatch(JSON.stringify(result),/private|token|xxx/);
  }
});
test("extra content, secrets and unbound source/authority claims never enter the projection",()=>{
  const result = project(message,[{...task,executionReceipt:{...receipt,token:"private-sentinel",prompt:"private-sentinel",
    targetSha:"a".repeat(40),authorityVerified:true,replayed:true,durableStateVerified:true,memoryState:"indexed"}}]);
  assert.equal(result.status,"reported");
  assert.doesNotMatch(JSON.stringify(result),/private-sentinel|targetSha|authorityVerified|replayed|durableState/);
  assert.equal(result.memoryState,"indexed");
});
test("repeated observations retain the same task identity without claiming additional executions",()=>{
  assert.deepEqual(project(),project());
  assert.equal(Object.hasOwn(project(),"executions"),false);
});
test("saved history restores metadata only through exact message/task joins and deduplicates IDs",()=>{
  assert.equal(typeof api.projectSavedConversation,"function","saved history must restore correlated metadata");
  const history=[{id:"user-1",role:"user",text:"hello"},{id:"answer-1",role:"assistant",text:"answer"},
    {id:"answer-1",role:"assistant",text:"answer"},{id:"older-answer",role:"assistant",text:"old"}];
  const result=api.projectSavedConversation(history,[message],[task],"conversation-1");
  assert.equal(result.length,3);
  assert.equal(result[0].executionEvidence,undefined);
  assert.equal(result[1].executionEvidence.status,"reported");
  assert.equal(result[1].text,"answer");
  assert.equal(result[2].executionEvidence.status,"unavailable");
  const ambiguous=api.projectSavedConversation(history,[message,message],[task],"conversation-1");
  assert.equal(ambiguous[1].executionEvidence.status,"unavailable");
});

test("optional receipt read failures preserve saved answers with unavailable metadata",async()=>{
  assert.equal(typeof api.loadSavedConversation,"function","history loading must tolerate optional metadata failures");
  for(const failed of ["tasks","messages"]) {
    const transport={
      async conversationHistory(){return [{id:"answer-1",role:"assistant",text:"saved answer"}];},
      async tasks(){if(failed==="tasks")throw new Error("private-task-error");return [task];},
      async messages(){if(failed==="messages")throw new Error("private-message-error");return [message];},
    };
    const result=await api.loadSavedConversation(transport,"conversation-1");
    assert.equal(result[0].text,"saved answer");
    assert.equal(result[0].executionEvidence.status,"unavailable");
    assert.doesNotMatch(JSON.stringify(result),/private-.*-error/);
  }
});
test("an unavailable history cannot be replaced by receipt metadata",async()=>{
  assert.equal(typeof api.loadSavedConversation,"function");
  await assert.rejects(api.loadSavedConversation({async conversationHistory(){throw new Error("history-unavailable");},
    async tasks(){return [task];},async messages(){return [message];}},"conversation-1"),/history-unavailable/);
});
