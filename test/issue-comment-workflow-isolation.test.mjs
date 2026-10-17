import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function workflow(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("bounded dispatch workflows do not subscribe to repository-wide issue comments", async () => {
  const [receiver, gateway] = await Promise.all([
    workflow(".github/workflows/workspace-agent-receiver.yml"),
    workflow(".github/workflows/cloud-task-gateway.yml"),
  ]);

  assert.doesNotMatch(receiver, /^\s*issue_comment\s*:/m);
  assert.doesNotMatch(gateway, /^\s*issue_comment\s*:/m);
  assert.match(receiver, /^\s*workflow_dispatch\s*:/m);
  assert.match(gateway, /^\s*workflow_dispatch\s*:/m);
});

test("cloud gateway remains owner-bound and explicitly dispatches desktop assignments", async () => {
  const [receiver, gateway] = await Promise.all([
    workflow(".github/workflows/workspace-agent-receiver.yml"),
    workflow(".github/workflows/cloud-task-gateway.yml"),
  ]);

  assert.doesNotMatch(gateway, /git push origin HEAD:main/);
  assert.match(receiver, /route_policy:/);
  assert.match(gateway, /issue_number:/);
  assert.match(gateway, /command:/);
  assert.match(gateway, /if:\s*github\.actor == github\.repository_owner/);
  assert.match(gateway, /gh pr create --base main/);
  assert.match(gateway, /Stage validated dispatch through protected pull request/);
  assert.doesNotMatch(gateway, /actions\.createWorkflowDispatch|git push origin HEAD:main/);
  assert.match(receiver, /branches: \[main\]/);
});
