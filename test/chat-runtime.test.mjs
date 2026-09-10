import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startRuntime } from "../src/runtime.mjs";

const TOKEN = "chat-runtime-primary-token-000000000000001";
const AUTH = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

test("unified chat intake separates questions from explicit actions", { concurrency: false }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-chat-runtime-"));
  const runtime = await startRuntime({
    port: 0,
    databaseFile: path.join(root, "runtime.sqlite"),
    contentVaultMasterKey: Buffer.alloc(32, 37),
    primaryCodexToken: TOKEN,
    syncCoordinationMailbox: false,
  });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${runtime.address.port}`;

  const zeroCredit = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify({ mode: "auto", content: "Can you explain why it rains outside?", creditPolicy: "zero-codex", idempotencyKey: "chat-zero-runtime" }),
  });
  assert.equal(zeroCredit.status, 409);
  assert.equal((await zeroCredit.json()).error, "zero-credit-provider-unavailable");
  assert.equal(runtime.database.listConversations().length, 0);

  const zeroCreditHealth = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify({ mode: "auto", content: "Check the system health", creditPolicy: "zero-codex", idempotencyKey: "chat-zero-health-runtime" }),
  });
  assert.equal(zeroCreditHealth.status, 202);
  const zeroCreditHealthBody = await zeroCreditHealth.json();
  assert.equal(zeroCreditHealthBody.task.capability, "system.health");
  assert.deepEqual(zeroCreditHealthBody.task.allowedWorkerIds, ["local-core"]);

  const asked = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify({ mode: "auto", content: "Can you explain why it rains outside?", idempotencyKey: "chat-ask-runtime" }),
  });
  assert.equal(asked.status, 202);
  const askBody = await asked.json();
  assert.equal(askBody.decision.mode, "ask");
  assert.equal(askBody.task.capability, "assistant.respond");
  assert.equal(askBody.objective, null);
  assert.equal(runtime.database.getConversation(askBody.conversation.id).titleReference !== null, true);

  const acted = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify({ mode: "act", content: "Update the Mahoraga interface and apply the change", idempotencyKey: "chat-act-runtime" }),
  });
  assert.equal(acted.status, 202);
  const actBody = await acted.json();
  assert.equal(actBody.decision.mode, "act");
  assert.equal(actBody.task, null);
  assert.equal(actBody.objective.tasks.length >= 1, true);
  assert.equal(actBody.objective.tasks.every((item) => item.definition.id.startsWith("ucf-")), true);
  const codexDefinitions = actBody.objective.tasks.map((item) => item.definition).filter((item) => item.capability === "codex.execute");
  assert.equal(codexDefinitions.length, 1);
  for (const definition of codexDefinitions) {
    assert.match(definition.baseCommit, /^[a-f0-9]{40,64}$/);
    assert.equal(definition.allowedPaths.includes("cloud-app"), true);
    assert.equal(definition.allowedPaths.includes("operator-deck"), true);
    assert.equal(definition.allowedPaths.includes("src"), true);
    assert.equal(definition.allowedPaths.includes("test"), true);
    assert.equal(Object.hasOwn(definition, "integrationLeaseId"), false);
  }
});

test("repository head failure leaves autonomous chat intake unpersisted", { concurrency: false }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-chat-runtime-head-failure-"));
  const runtime = await startRuntime({
    port: 0,
    databaseFile: path.join(root, "runtime.sqlite"),
    contentVaultMasterKey: Buffer.alloc(32, 41),
    primaryCodexToken: TOKEN,
    syncCoordinationMailbox: false,
    repositoryHeadReader: async () => {
      const error = new Error("repository-head-unavailable");
      error.code = "repository-head-unavailable";
      throw error;
    },
  });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${runtime.address.port}`;

  const acted = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify({ mode: "act", content: "Update the Mahoraga interface and apply the change", idempotencyKey: "chat-act-head-failure" }),
  });

  assert.equal(acted.status, 400);
  assert.equal(runtime.database.listConversations().length, 0);
  assert.equal(runtime.database.listObjectives().length, 0);
});

test("owner-paired relay starts a credit-free protocol objective without spending credits", { concurrency: false }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-relay-chat-runtime-"));
  const expectedHead = "d".repeat(40);
  const runtime = await startRuntime({
    port: 0,
    databaseFile: path.join(root, "runtime.sqlite"),
    contentVaultMasterKey: Buffer.alloc(32, 43),
    primaryCodexToken: TOKEN,
    syncCoordinationMailbox: false,
    repositoryHeadReader: async () => expectedHead,
  });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });

  const result = await runtime.server.conversationGateway.chat({
    mode: "act", content: "Update the Mahoraga interface and apply the change", idempotencyKey: "relay-chat-act-runtime",
  }, {
    mechanism: "owner-paired-relay", attendedSession: { active: true, sessionId: "rls-00000000000000000000000000000000" },
  });
  assert.equal(result.creditFreeRequired, true);
  assert.equal(result.creditCost, 0);
  assert.equal(result.paidFallback, false);
  assert.deepEqual(result.objective.tasks.map((item) => item.definition.id).sort(), ["act", "decide", "observe", "repair", "report", "verify"]);
  assert.equal(result.objective.tasks.some((item) => item.definition.capability === "codex.execute"), false);
  assert.equal(runtime.database.listConversations().length, 1);
  assert.equal(runtime.database.listObjectives().length, 1);
});

test("owner chat can target exact registered capabilities without opening public task authority", { concurrency: false }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-owner-capability-chat-"));
  const expectedHead = "e".repeat(40);
  const runtime = await startRuntime({
    port: 0,
    databaseFile: path.join(root, "runtime.sqlite"),
    contentVaultMasterKey: Buffer.alloc(32, 47),
    primaryCodexToken: TOKEN,
    syncCoordinationMailbox: false,
    repositoryHeadReader: async () => expectedHead,
  });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${runtime.address.port}`;

  const evolve = await fetch(`${base}/api/chat`, {
    method: "POST", headers: AUTH,
    body: JSON.stringify({ mode: "act", content: "run self.evolve to improve owner interaction", idempotencyKey: "owner-self-evolve-chat" }),
  });
  assert.equal(evolve.status, 202);
  const evolveBody = await evolve.json();
  assert.equal(evolveBody.decision.execution, "capability");
  assert.equal(evolveBody.decision.capability, "self.evolve");
  assert.equal(evolveBody.task, null);
  assert.equal(evolveBody.objective.tasks.length, 1);
  assert.equal(evolveBody.objective.tasks[0].definition.capability, "self.evolve");
  assert.equal(evolveBody.objective.tasks[0].definition.baseCommit, expectedHead);
  assert.equal(evolveBody.objective.tasks[0].definition.allowedPaths.includes("src"), true);
  assert.equal(evolveBody.objective.tasks[0].definition.allowedPaths.includes("test"), true);

  const verify = await fetch(`${base}/api/chat`, {
    method: "POST", headers: AUTH,
    body: JSON.stringify({ mode: "act", content: "run repository.verify now", idempotencyKey: "owner-repository-verify-chat" }),
  });
  assert.equal(verify.status, 202);
  const verifyBody = await verify.json();
  assert.equal(verifyBody.decision.execution, "capability");
  assert.equal(verifyBody.task.capability, "repository.verify");
  assert.equal(verifyBody.objective, null);
});

test("licensed-approved admits only one explicit answer turn", { concurrency: false }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-licensed-answer-chat-"));
  const runtime = await startRuntime({
    port: 0,
    databaseFile: path.join(root, "runtime.sqlite"),
    contentVaultMasterKey: Buffer.alloc(32, 53),
    primaryCodexToken: TOKEN,
    syncCoordinationMailbox: false,
  });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${runtime.address.port}`;

  const answer = await fetch(`${base}/api/chat`, {
    method: "POST", headers: AUTH,
    body: JSON.stringify({ mode: "auto", content: "Explain why it rains", creditPolicy: "licensed-approved", idempotencyKey: "licensed-answer" }),
  });
  assert.equal(answer.status, 202);
  const answerBody = await answer.json();
  assert.equal(answerBody.task.capability, "assistant.respond");
  assert.equal(answerBody.objective, null);

  const beforeConversations = runtime.database.listConversations().length;
  const beforeObjectives = runtime.database.listObjectives().length;
  const action = await fetch(`${base}/api/chat`, {
    method: "POST", headers: AUTH,
    body: JSON.stringify({ mode: "act", content: "Update the repository", creditPolicy: "licensed-approved", idempotencyKey: "licensed-action" }),
  });
  assert.equal(action.status, 400);
  assert.equal((await action.json()).error, "licensed-policy-answer-only");
  assert.equal(runtime.database.listConversations().length, beforeConversations);
  assert.equal(runtime.database.listObjectives().length, beforeObjectives);
});

test("paired relay preserves zero-codex by default and passes only explicit licensed approval", { concurrency: false }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-relay-licensed-chat-"));
  const runtime = await startRuntime({
    port: 0,
    databaseFile: path.join(root, "runtime.sqlite"),
    contentVaultMasterKey: Buffer.alloc(32, 59),
    primaryCodexToken: TOKEN,
    syncCoordinationMailbox: false,
  });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  const context = {
    mechanism: "owner-paired-relay",
    attendedSession: { active: true, sessionId: "rls-11111111111111111111111111111111" },
  };

  await assert.rejects(
    () => runtime.server.conversationGateway.chat({ mode: "auto", content: "Explain rain", creditPolicy: "standard", idempotencyKey: "relay-standard" }, context),
    /zero-credit-provider-unavailable/,
  );
  const licensed = await runtime.server.conversationGateway.chat({
    mode: "auto", content: "Explain rain", creditPolicy: "licensed-approved", idempotencyKey: "relay-licensed",
  }, context);
  assert.equal(licensed.task.capability, "assistant.respond");
  assert.equal(licensed.objective, null);
});

test("public chat composes repo and M365 work through UCF with attended-session continuity", { concurrency: false }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-ucf-chat-runtime-"));
  const runtime = await startRuntime({ port: 0, databaseFile: path.join(root, "runtime.sqlite"), contentVaultMasterKey: Buffer.alloc(32, 61), primaryCodexToken: TOKEN, syncCoordinationMailbox: false, repositoryHeadReader: async () => "f".repeat(40) });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${runtime.address.port}`;
  const nonceResponse = await fetch(`${base}/api/session/bootstrap-nonce`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` } });
  const { nonce } = await nonceResponse.json();
  const exchange = await fetch(`${base}/session/bootstrap?nonce=${encodeURIComponent(nonce)}`, { redirect: "manual" });
  const cookie = exchange.headers.get("set-cookie").split(";", 1)[0];
  const response = await fetch(`${base}/api/chat`, {
    method: "POST", headers: { cookie, origin: base, "content-type": "application/json" },
    body: JSON.stringify({ mode: "auto", content: "Review the repository and compare it with my Microsoft 365 work", idempotencyKey: "ucf-repo-m365" }),
  });
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.decision.execution, "objective");
  assert.deepEqual(body.objective.tasks.map((item) => item.definition.capability), ["repository.inspect", "m365.reason"]);
  const microsoft = body.objective.tasks.find((item) => item.definition.capability === "m365.reason");
  assert.equal(typeof microsoft.definition.authoritySessionId, "string");
  assert.equal(microsoft.definition.authoritySessionId.length > 20, true);
});


test("public chat keeps natural M365 follow-up on enterprise reasoning lane", { concurrency: false }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-ucf-m365-followup-"));
  const runtime = await startRuntime({ port: 0, databaseFile: path.join(root, "runtime.sqlite"), contentVaultMasterKey: Buffer.alloc(32, 67), primaryCodexToken: TOKEN, syncCoordinationMailbox: false });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${runtime.address.port}`;
  const nonceResponse = await fetch(`${base}/api/session/bootstrap-nonce`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` } });
  const { nonce } = await nonceResponse.json();
  const exchange = await fetch(`${base}/session/bootstrap?nonce=${encodeURIComponent(nonce)}`, { redirect: "manual" });
  const cookie = exchange.headers.get("set-cookie").split(";", 1)[0];
  const headers = { cookie, origin: base, "content-type": "application/json" };
  const first = await fetch(`${base}/api/chat`, { method: "POST", headers, body: JSON.stringify({ mode: "auto", content: "Summarize my Microsoft 365 work", idempotencyKey: "ucf-m365-first" }) });
  assert.equal(first.status, 202);
  const firstBody = await first.json();
  assert.equal(firstBody.task.capability, "m365.reason");
  const claimed = runtime.database.claimNext({ workerId: "microsoft365", capabilities: ["m365.reason"], leaseMs: 30_000 });
  assert.ok(claimed);
  runtime.database.finishTask(claimed.id, { status: "completed", resultSummary: "Enterprise context summarized." });
  const follow = await fetch(`${base}/api/chat`, { method: "POST", headers, body: JSON.stringify({ mode: "auto", conversationId: firstBody.conversation.id, content: "Summarize the above in one paragraph", idempotencyKey: "ucf-m365-follow" }) });
  assert.equal(follow.status, 202);
  const followBody = await follow.json();
  assert.equal(followBody.task.capability, "m365.reason");
});
