import test from "node:test";
import assert from "node:assert/strict";
import { createCodespacesClient, CODESPACES_API_ORIGIN, redactError } from "../src/codespaces-client.mjs";

const okBudget = () => ({ ok: true });
const blockedBudget = () => ({ ok: false, reason: "cloud-budget-billing-not-verified-zero" });

test("uses fixed GitHub API origin and redacts content from receipts", async () => {
  const calls = [];
  const client = createCodespacesClient({ repositoryFullName: "owner/repo", token: "ghp_secret", budgetEvaluator: okBudget, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ total_count: 2, codespaces: [{ name: "secret-url" }] }) };
  } });
  const receipt = await client.inspect({ telemetry: {} });
  assert.equal(calls[0].url.startsWith(CODESPACES_API_ORIGIN), true);
  assert.equal(receipt.status, "ok");
  assert.equal(JSON.stringify(receipt).includes("secret-url"), false);
});

test("fails closed before network calls when budget evidence is not admissible", async () => {
  const client = createCodespacesClient({ repositoryFullName: "owner/repo", budgetEvaluator: blockedBudget, fetchImpl: async () => { throw new Error("must not call network"); } });
  assert.equal((await client.start({ telemetry: {} })).reason, "cloud-budget-billing-not-verified-zero");
});

test("does not execute caller-selected commands", async () => {
  const client = createCodespacesClient({ repositoryFullName: "owner/repo", budgetEvaluator: okBudget, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  assert.equal((await client.executeRegisteredWorkflow({ codespaceName: "abc", workflowId: "rm -rf" })).reason, "unregistered-workflow-id");
});

test("redacts tokens from errors", () => {
  assert.equal(redactError(new Error("Bearer ghp_secretvalue failed")).message.includes("ghp_secretvalue"), false);
});
