import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest, validateManifest } from "../src/config.mjs";
import { buildWorkspaceAgentEnvelope, executeWorkspaceAgentCapability } from "../src/workspace-agent-worker.mjs";

const env = { AGENT_ACCESS_TOKEN: "wat_test_token_value_long_enough", WORKSPACE_AGENT_TRIGGER_ID: "agtch_test123" };
const task = {
  assignmentId: "sec-ac0c314a-a0d1-4f4a-bfa6-36405c1e1ccb",
  correlationId: "cor-cloud-trigger",
  expectedBaseCommit: "91b4888dbeef0000000000000000000000000000",
  returnBranch: "secondary/sec-ac0c314a-a0d1-4f4a-bfa6-36405c1e1ccb",
  allowedPaths: ["coordination/results"],
  requestedOutcome: "Return the bounded connectivity result.",
};
async function worker() { return (await loadManifest()).workers.find((item) => item.id === "workspace-agent-cloud"); }

test("Workspace Agent envelope is fixed to ChatGPT and the declared secondary branch", async () => {
  const item = await worker();
  const envelope = buildWorkspaceAgentEnvelope({ task, worker: item, env });
  assert.equal(item.enabled, false);
  assert.match(envelope.endpoint, /^https:\/\/api\.chatgpt\.com\/v1\/workspace_agents\/agtch_/);
  assert.equal(envelope.body.conversation_key, task.assignmentId);
  assert.match(envelope.body.input, /Push only secondary\/sec-ac0c314a/);
  assert.match(envelope.body.input, /Do not access or export ChatGPT conversation history/);
  assert.equal(JSON.stringify(envelope).includes(env.AGENT_ACCESS_TOKEN), false);
});

test("Workspace Agent health is non-networked and fail-closed without credentials", async () => {
  const item = await worker();
  let called = false;
  const result = await executeWorkspaceAgentCapability("workspace-agent.health", {}, item, { env: {}, fetch: async () => { called = true; } });
  assert.equal(called, false);
  assert.equal(result.verified, false);
  assert.equal(result.providerHealth.responseRetrievalAvailable, false);
});

test("Workspace Agent health rejects OpenAI Platform API keys", async () => {
  const item = await worker();
  const platformEnv = {
    AGENT_ACCESS_TOKEN: "sk-proj-not-a-workspace-agent-token",
    WORKSPACE_AGENT_TRIGGER_ID: "agtch_test123",
  };
  const result = await executeWorkspaceAgentCapability("workspace-agent.health", {}, item, { env: platformEnv });
  assert.equal(result.verified, false);
  assert.equal(result.providerHealth.accessTokenConfigured, false);
  assert.equal(result.providerHealth.platformApiKeyRejected, true);
  assert.match(result.summary, /rejected an OpenAI Platform API key/);
});

test("Workspace Agent trigger records acceptance without claiming task completion", async () => {
  const item = await worker();
  const calls = [];
  const result = await executeWorkspaceAgentCapability("workspace-agent.trigger", task, item, {
    env,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ conversation_url: "https://chatgpt.com/c/cloud123", agent_trigger_run_id: "apirun_cloud123" }), { status: 202, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(result.verified, true);
  assert.match(result.summary, /execution is pending/);
  assert.equal(result.providerReceipt.responseRetrievalAvailable, false);
  assert.equal(result.providerReceipt.returnBranch, task.returnBranch);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${env.AGENT_ACCESS_TOKEN}`);
  assert.equal(calls[0].options.headers["OpenAI-Beta"], "workspace_agent_runs=v1");
});

test("Workspace Agent status never substitutes for GitHub result validation", async () => {
  const item = await worker();
  const result = await executeWorkspaceAgentCapability("workspace-agent.status", { providerRunId: "apirun_cloud123" }, item, {
    env,
    fetch: async () => new Response(JSON.stringify({ status: "completed" }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  assert.match(result.summary, /GitHub return validation remains authoritative/);
});

test("manifest rejects Workspace Agent endpoint drift or response retrieval claims", async () => {
  const manifest = structuredClone(await loadManifest());
  const item = manifest.workers.find((candidate) => candidate.id === "workspace-agent-cloud");
  item.adapter.apiOrigin = "https://example.com";
  assert.throws(() => validateManifest(manifest), /Workspace Agent adapter boundary/);
  item.adapter.apiOrigin = "https://api.chatgpt.com";
  item.adapter.responseRetrieval = true;
  assert.throws(() => validateManifest(manifest), /Workspace Agent adapter boundary/);
});

test("manifest fixes the Workspace Agent credential class and environment bindings", async () => {
  const manifest = structuredClone(await loadManifest());
  const item = manifest.workers.find((candidate) => candidate.id === "workspace-agent-cloud");
  item.adapter.platformApiKeyAccepted = true;
  assert.throws(() => validateManifest(manifest), /Workspace Agent adapter boundary/);
  item.adapter.platformApiKeyAccepted = false;
  item.adapter.accessTokenEnvironmentVariable = "OPENAI_API_KEY";
  assert.throws(() => validateManifest(manifest), /Workspace Agent adapter boundary/);
});
