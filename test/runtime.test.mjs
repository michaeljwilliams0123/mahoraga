import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { startRuntime } from "../src/runtime.mjs";
import { canonicalWorkspaceUrl, DEFAULT_WORKSPACE_URL } from "../src/server.mjs";
import { normalizeSummary } from "../src/supervisor.mjs";
import { bearerMatches } from "../src/local-auth.mjs";

const PRIMARY_TOKEN = "runtime-test-primary-token-0000000000000001";
const AUTH = { authorization: `Bearer ${PRIMARY_TOKEN}` };
const TEST_VAULT_KEY = Buffer.alloc(32, 24);

test("worker receipts are bounded to a safe single line before persistence", () => {
  const summary = normalizeSummary(`passed\n${"verified ".repeat(400)}`);
  assert.equal(/[\r\n]/.test(summary), false);
  assert.ok(summary.length <= 2000);
});

test("Primary Codex intake bearer comparison fails closed", () => {
  assert.equal(bearerMatches({ headers: {} }, "x".repeat(32)), false);
  assert.equal(bearerMatches({ headers: { authorization: `Bearer ${"x".repeat(32)}` } }, "x".repeat(32)), true);
  assert.equal(bearerMatches({ headers: { authorization: "Bearer wrong" } }, "x".repeat(32)), false);
});

test("runtime exposes only the canonical Vercel workspace as its interaction surface", () => {
  assert.equal(canonicalWorkspaceUrl(), DEFAULT_WORKSPACE_URL);
  assert.equal(canonicalWorkspaceUrl("https://workspace.example/"), "https://workspace.example/");
  assert.throws(() => canonicalWorkspaceUrl("http://127.0.0.1:4782/"), /canonical-workspace-url-invalid/);
  assert.throws(() => canonicalWorkspaceUrl("https://user:secret@example.com/"), /canonical-workspace-url-invalid/);
});

test("runtime serves the cockpit API and completes a health task", async (t) => {
  const { runtime } = await runtimeFixture(t);
  const base = `http://127.0.0.1:${runtime.address.port}`;
  await waitFor(async () => {
    const status = await (await fetch(`${base}/api/status`)).json();
    return ["system.health", "repository.inspect"].every((capability) =>
      status.capabilities.some((item) => item.capability === capability && item.routable === true),
    );
  });
  const status = await (await fetch(`${base}/api/status`)).json();
  const requiredCapabilities = status.capabilities.filter((item) => ["system.health", "repository.inspect"].includes(item.capability));
  assert.equal(requiredCapabilities.length, 2);
  assert.ok(requiredCapabilities.every((item) => item.provider === "ready" && item.canary !== "never"));
  assert.equal(status.controlCenterApi.protocolVersion, 1);
  assert.equal(status.controlCenterApi.runtimeVersion, status.version);
  assert.equal(status.controlCenterApi.controlCenterVersion, status.versions.controlCenter);
  assert.equal(status.controlCenterApi.staticAssetsSnapshotted, false);
  assert.equal(status.controlCenterApi.interactionSurface, "vercel-workspace");
  assert.equal(status.controlCenterApi.localUiRetired, true);
  const statusResponse = await fetch(`${base}/api/status`);
  assert.equal(statusResponse.headers.get("x-mahoraga-runtime-version"), status.version);
  assert.equal(statusResponse.headers.get("x-mahoraga-control-center-version"), status.versions.controlCenter);
  const healthCapability = status.capabilities.find((item) => item.capability === "system.health");
  assert.equal(healthCapability.permissionClass, "bounded-local");
  assert.equal(healthCapability.availability, "live");
  const repositoryCapability = status.capabilities.find((item) => item.capability === "repository.inspect");
  assert.equal(repositoryCapability.routable, true);
  assert.equal(status.routingPolicy.interfaceOrder[0], "native-api");
  const workspaceRedirect = await fetch(base, { redirect: "manual" });
  assert.equal(workspaceRedirect.status, 307);
  assert.equal(workspaceRedirect.headers.get("location"), DEFAULT_WORKSPACE_URL);
  runtime.database.createSecondaryAssignment({
    title: "Verify controller bridge", taskArea: "secondary-connectivity", expectedTask: "Return bounded repository evidence.",
    expectedBaseCommit: "abcdef0123456789", allowedPaths: ["coordination/results"],
  });
  const coordination = await (await fetch(`${base}/api/coordination`, { headers: AUTH })).json();
  assert.equal(coordination.transport.outboundOnly, true);
  assert.equal(coordination.authority.model, "dual-primary-single-integration-lease");
  assert.equal(coordination.authority.rolesAreTransportOnly, true);
  assert.equal(coordination.authority.equalPrimaryCapability, true);
  assert.equal(coordination.authority.integration.leaseRequired, true);
  assert.equal(coordination.authority.integration.concurrentHolders, 1);
  assert.equal(coordination.authority.secondary.canImplement, true);
  assert.equal(coordination.authority.secondary.canReview, true);
  assert.equal(coordination.authority.secondary.canIntegrate, false);
  assert.equal(coordination.authority.secondary.branchPrefix, "secondary/");
  assert.equal(coordination.automation.modelInvocation, "explicit-task-only");
  assert.equal(coordination.automation.idlePollingInvokesModel, false);
  assert.equal(coordination.automation.actionReferences, "immutable-commit-sha");
  assert.equal(coordination.privacy.chatAccess, false);
  assert.equal(coordination.privacy.credentialsIncluded, false);
  assert.equal(typeof coordination.runner.configured, "boolean");
  assert.equal(coordination.counts.ready, 1);
  assert.equal(coordination.assignments[0].taskArea, "secondary-connectivity");
  assert.equal("expectedTask" in coordination.assignments[0], false);
  assert.equal("expectedBaseCommit" in coordination.assignments[0], false);
  const created = await (await fetch(`${base}/api/tasks`, {
    method: "POST", headers: { ...AUTH, "content-type": "application/json" },
    body: JSON.stringify({ intent: "system.health", requestedOutcome: "Verify local health.", idempotencyKey: `test-${Date.now()}` }),
  })).json();
  const completed = await waitFor(async () => {
    const tasks = await (await fetch(`${base}/api/tasks`, { headers: AUTH })).json();
    return tasks.tasks.find((task) => task.id === created.task.id && task.status === "completed");
  });
  assert.match(runtime.contentVault.get(completed.resultSummaryReference, {
    ownerType: "task-result", ownerId: completed.id, classification: completed.dataClass,
  }).toString("utf8"), /runtime is responsive/);
});

test("task API retries are idempotent without duplicate conversation side effects", async (t) => {
  const { runtime } = await runtimeFixture(t);
  const base = `http://127.0.0.1:${runtime.address.port}`;
  const idempotencyKey = `api-idempotency-${Date.now()}`;
  const request = { intent: "system.health", requestedOutcome: "Verify local health.", idempotencyKey };
  const submit = () => fetch(`${base}/api/tasks`, {
    method: "POST", headers: { ...AUTH, "content-type": "application/json" }, body: JSON.stringify(request),
  });
  const first = await (await submit()).json();
  const second = await (await submit()).json();
  assert.equal(second.task.id, first.task.id);
  const conversations = await (await fetch(`${base}/api/conversations`, { headers: AUTH })).json();
  assert.equal(conversations.conversations.length, 1);
  const conflict = await fetch(`${base}/api/tasks`, {
    method: "POST", headers: { ...AUTH, "content-type": "application/json" },
    body: JSON.stringify({ ...request, intent: "manifest.validate" }),
  });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error, "idempotency-conflict");
});

test("improvement decisions fail closed without the candidate-specific approval header", async (t) => {
  const { runtime } = await runtimeFixture(t);
  const base = `http://127.0.0.1:${runtime.address.port}`;
  const proposed = await (await fetch(`${base}/api/improvements`, { method: "POST", headers: { ...AUTH, "content-type": "application/json" }, body: JSON.stringify({ title: "Candidate", summary: "Tested proposal" }) })).json();
  const denied = await fetch(`${base}/api/improvements/${proposed.improvement.id}/decision`, { method: "POST", headers: { ...AUTH, "content-type": "application/json" }, body: JSON.stringify({ decision: "approved" }) });
  assert.equal(denied.status, 403);
  const approved = await (await fetch(`${base}/api/improvements/${proposed.improvement.id}/decision`, { method: "POST", headers: { ...AUTH, "content-type": "application/json", "x-mahoraga-approval": proposed.improvement.id }, body: JSON.stringify({ decision: "approved" }) })).json();
  assert.equal(approved.improvement.status, "approved");
});

test("runtime API creates and continues a durable assignment thread", async (t) => {
  const { runtime } = await runtimeFixture(t);
  const base = `http://127.0.0.1:${runtime.address.port}`;
  const created = await (await fetch(`${base}/api/conversations`, {
    method: "POST", headers: { ...AUTH, "content-type": "application/json" },
    body: JSON.stringify({ title: "Persistent assignment", initialMessage: "Continue while I am away." }),
  })).json();
  await fetch(`${base}/api/conversations/${created.conversation.id}/messages`, {
    method: "POST", headers: { ...AUTH, "content-type": "application/json" }, body: JSON.stringify({ content: "Additional input.", role: "user" }),
  });
  const messages = runtime.database.listConversationMessagesForExecution(created.conversation.id);
  assert.deepEqual(messages.map((item) => item.content), ["Continue while I am away.", "Additional input."]);
});

test("completed worker receipts return to the chat conversation", async (t) => {
  const { runtime } = await runtimeFixture(t);
  const base = `http://127.0.0.1:${runtime.address.port}`;
  const conversation = await (await fetch(`${base}/api/conversations`, {
    method: "POST", headers: { ...AUTH, "content-type": "application/json" },
    body: JSON.stringify({ title: "Chat receipt", initialMessage: "Is the runtime healthy?" }),
  })).json();
  const created = await (await fetch(`${base}/api/tasks`, {
    method: "POST", headers: { ...AUTH, "content-type": "application/json" },
    body: JSON.stringify({ intent: "system.health", requestedOutcome: "Verify local health.", conversationId: conversation.conversation.id, idempotencyKey: `chat-${Date.now()}` }),
  })).json();
  await waitFor(async () => {
    const tasks = await (await fetch(`${base}/api/tasks`, { headers: AUTH })).json();

    return tasks.tasks.find((task) => task.id === created.task.id && task.status === "completed");
  });
  const messages = runtime.database.listConversationMessagesForExecution(conversation.conversation.id);
  assert.deepEqual(messages.map((item) => item.role), ["user", "assistant"]);
  assert.match(messages[1].content, /runtime is responsive/);
});

async function waitFor(check, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { const value = await check(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 100)); }
  throw new Error("Timed out waiting for runtime state.");
}

async function runtimeFixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-v2-runtime-"));
  const runtime = await startRuntime({
    port: 0,
    databaseFile: path.join(root, "runtime.sqlite"),
    contentVaultMasterKey: TEST_VAULT_KEY,
    primaryCodexToken: PRIMARY_TOKEN,
    syncCoordinationMailbox: false,
  });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  return { runtime, root };
}
