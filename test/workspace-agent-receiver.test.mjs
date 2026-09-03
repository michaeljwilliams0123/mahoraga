import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  receiveWorkspaceAgentEvent,
  selectWorkspaceAgentAssignments,
  validateWorkspaceAgentReceiverId,
} from "../scripts/workspace-agent-receiver.mjs";

const assignmentId = "sec-ff6f8ad9e08d1e134a87386868388f2b";
const repository = {
  full_name: "michaeljwilliams0123/mahoraga",
  owner: { login: "michaeljwilliams0123" },
};

function ownerCommand(id = assignmentId) {
  return {
    action: "created",
    repository,
    sender: { login: "michaeljwilliams0123" },
    issue: { number: 87, pull_request: null },
    comment: { body: `/mahoraga receive workspace-agent ${id}` },
  };
}

test("receiver accepts the gateway's deterministic assignment ID and owner command", async () => {
  assert.equal(validateWorkspaceAgentReceiverId(assignmentId), assignmentId);
  const assignments = await selectWorkspaceAgentAssignments({ eventName: "issue_comment", event: ownerCommand() });
  assert.equal(assignments[0].assignmentId, assignmentId);
  await assert.rejects(
    () => selectWorkspaceAgentAssignments({ eventName: "issue_comment", event: { ...ownerCommand(), sender: { login: "untrusted" } } }),
    /owner-command-rejected/,
  );
});

test("main push receiver selects exactly one newly added validated assignment", async () => {
  const assignments = await selectWorkspaceAgentAssignments({
    eventName: "push",
    event: { repository, ref: "refs/heads/main", before: "a".repeat(40), after: "b".repeat(40) },
    listAddedPaths: async () => [`coordination/assignments/${assignmentId}.json`],
  });
  assert.equal(assignments[0].assignmentId, assignmentId);
  await assert.rejects(
    () => selectWorkspaceAgentAssignments({
      eventName: "push",
      event: { repository, ref: "refs/heads/main", before: "a".repeat(40), after: "b".repeat(40) },
      listAddedPaths: async () => [
        `coordination/assignments/${assignmentId}.json`,
        "coordination/assignments/sec-ac0c314a-a0d1-4f4a-bfa6-36405c1e1ccb.json",
      ],
    }),
    /multiple-assignments-rejected/,
  );
});

test("unconfigured receiver consumes no model request", async () => {
  let called = false;
  const result = await receiveWorkspaceAgentEvent({
    eventName: "issue_comment",
    event: ownerCommand(),
    env: {},
    fetch: async () => { called = true; throw new Error("network-must-not-run"); },
  });
  assert.equal(called, false);
  assert.deepEqual(result, {
    schemaVersion: 1,
    state: "unconfigured",
    assignmentId,
    modelExecution: false,
  });
});

test("configured receiver makes one idempotent Workspace Agent request", async () => {
  const calls = [];
  const result = await receiveWorkspaceAgentEvent({
    eventName: "issue_comment",
    event: ownerCommand(),
    env: { AGENT_ACCESS_TOKEN: "wat_test_token_value_long_enough", WORKSPACE_AGENT_TRIGGER_ID: "agtch_test123" },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        conversation_url: "https://chatgpt.com/c/receiver123",
        agent_trigger_run_id: "apirun_receiver123",
      }), { status: 202, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(result.state, "accepted");
  assert.equal(result.providerRunId, "apirun_receiver123");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/api\.chatgpt\.com\/v1\/workspace_agents\/agtch_/);
  assert.match(calls[0].options.headers["Idempotency-Key"], /^[a-f0-9]{32}$/);
});

test("completed assignment cannot execute again", async () => {
  let called = false;
  const completed = "sec-ac0c314a-a0d1-4f4a-bfa6-36405c1e1ccb";
  const result = await receiveWorkspaceAgentEvent({
    eventName: "issue_comment",
    event: ownerCommand(completed),
    env: { AGENT_ACCESS_TOKEN: "wat_test_token_value_long_enough", WORKSPACE_AGENT_TRIGGER_ID: "agtch_test123" },
    fetch: async () => { called = true; throw new Error("network-must-not-run"); },
  });
  assert.equal(called, false);
  assert.equal(result.state, "already-complete");
  assert.equal(result.modelExecution, false);
});

test("GitHub receiver is read-only, owner-bound, pinned, and secret-backed", async () => {
  const [source, gateway] = await Promise.all([
    readFile(new URL("../.github/workflows/workspace-agent-receiver.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/cloud-task-gateway.yml", import.meta.url), "utf8"),
  ]);
  assert.match(source, /branches: \[main\]/);
  assert.match(source, /coordination\/assignments\/\*\.json/);
  assert.match(source, /github\.actor == github\.repository_owner/);
  assert.match(source, /permissions:\s*\n  contents: read/);
  assert.doesNotMatch(source, /contents: write|pull-requests: write|pull_request_target/);
  assert.match(source, /actions\/checkout@[a-f0-9]{40}/);
  assert.match(source, /actions\/setup-node@[a-f0-9]{40}/);
  assert.match(source, /AGENT_ACCESS_TOKEN: \$\{\{ secrets\.AGENT_ACCESS_TOKEN \}\}/);
  assert.match(source, /WORKSPACE_AGENT_TRIGGER_ID: \$\{\{ secrets\.WORKSPACE_AGENT_TRIGGER_ID \}\}/);
  assert.match(gateway, /steps\.gateway\.outputs\.mode == 'desktop'/);
  assert.match(gateway, /actions\.createWorkflowDispatch/);
  assert.match(gateway, /workflow_id: "workspace-agent-receiver\.yml"/);
  assert.doesNotMatch(gateway, /secrets\.AGENT_ACCESS_TOKEN|secrets\.WORKSPACE_AGENT_TRIGGER_ID/);
  assert.match(gateway, /steps\.workspace_receiver\.outcome == 'failure'/);
});
