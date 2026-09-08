import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCodexCloudExecArgs,
  buildDestinyWorkReceipt,
  parseDestinyGithubTaskIssue,
  parseDestinyWorkTaskPullRequest,
  planDestinyWorkExecution,
  validateDestinyWorkReceipt,
} from "../src/destiny-github-task.mjs";

const taskId = "dct-0123456789abcdef01234567";
const workTaskId = "dwt-0123456789abcdef01234567";
const repository = "michaeljwilliams0123/mahoraga";
const owner = "michaeljwilliams0123";
const prompt = `Implement only the bounded Destiny probe ${taskId}. Create one marker file and open a PR. Do not review code.`;
const objective = "Create one bounded implementation artifact without reviewing code.";

function issue(overrides = {}) {
  const payload = { schemaVersion: 1, kind: "destiny-codex-task", taskId, repository, prompt, attempts: 1, implementationOnly: true, codeReview: false };
  return {
    number: 183,
    state: "open",
    user: { login: owner },
    title: `Destiny Codex task ${taskId}`,
    body: `<!-- MAHORAGA_DESTINY_TASK_V1\n${JSON.stringify(payload)}\nMAHORAGA_DESTINY_TASK_V1 -->`,
    ...overrides,
  };
}

function workPr(payloadOverrides = {}, overrides = {}) {
  const payload = {
    schemaVersion: 1,
    kind: "destiny-work-task",
    taskId: workTaskId,
    implementationOnly: true,
    codeReview: false,
    attempts: 1,
    objective,
    ...payloadOverrides,
  };
  return {
    number: 238,
    state: "open",
    user: { login: owner },
    base: { repo: { full_name: repository } },
    title: `Destiny Work task ${workTaskId}`,
    body: `<!-- MAHORAGA_DESTINY_WORK_V1\n${JSON.stringify(payload)}\nMAHORAGA_DESTINY_WORK_V1 -->`,
    ...overrides,
  };
}

test("owner-authored GitHub task parses into one bounded Codex cloud execution", () => {
  const task = parseDestinyGithubTaskIssue(issue(), { repository, owner });
  assert.equal(task.taskId, taskId);
  assert.equal(task.issueNumber, 183);
  assert.equal(task.prompt, prompt);
  assert.deepEqual(buildCodexCloudExecArgs("env_destiny_mahoraga", task), ["cloud", "exec", "--env", "env_destiny_mahoraga", "--attempts", "1", prompt]);
});

test("GitHub task authorization and policy are fail-closed", () => {
  assert.throws(() => parseDestinyGithubTaskIssue(issue({ user: { login: "someone-else" } }), { repository, owner }), /destiny-github-task-author-invalid/);
  assert.throws(() => parseDestinyGithubTaskIssue(issue({ state: "closed" }), { repository, owner }), /destiny-github-task-state-invalid/);
  assert.throws(() => parseDestinyGithubTaskIssue(issue({ pull_request: { url: "x" } }), { repository, owner }), /destiny-github-task-pr-invalid/);
  const bad = issue();
  bad.body = bad.body.replace('"implementationOnly":true', '"implementationOnly":false');
  assert.throws(() => parseDestinyGithubTaskIssue(bad, { repository, owner }), /destiny-github-task-policy-invalid/);
  assert.throws(() => buildCodexCloudExecArgs("", parseDestinyGithubTaskIssue(issue(), { repository, owner })), /destiny-codex-environment-id-invalid/);
});

test("Destiny Work PR marker parses into a bounded shared-owner execution lane", () => {
  const task = parseDestinyWorkTaskPullRequest(workPr(), { repository, owner });
  assert.deepEqual(task, {
    schemaVersion: 1,
    taskId: workTaskId,
    repository,
    pullRequest: 238,
    objective,
    attempts: 1,
    implementationOnly: true,
    codeReview: false,
    executorLane: "destiny-work-event",
  });
  const plan = planDestinyWorkExecution(task);
  assert.deepEqual(plan, {
    execute: true,
    reason: "pending",
    taskId: workTaskId,
    receiptPath: `coordination/destiny-work-receipts/${workTaskId}.json`,
  });
});

test("Destiny Work task envelope fails closed on duplicate, broadened, or unsafe markers", () => {
  const duplicate = workPr();
  duplicate.body = `${duplicate.body}\n${duplicate.body}`;
  assert.throws(() => parseDestinyWorkTaskPullRequest(duplicate, { repository, owner }), /destiny-work-task-marker-ambiguous/);

  assert.throws(() => parseDestinyWorkTaskPullRequest(workPr({ codeReview: true }), { repository, owner }), /destiny-work-task-policy-invalid/);
  assert.throws(() => parseDestinyWorkTaskPullRequest(workPr({ attempts: 2 }), { repository, owner }), /destiny-work-task-policy-invalid/);
  assert.throws(() => parseDestinyWorkTaskPullRequest(workPr({ surprise: "broaden" }), { repository, owner }), /destiny-work-task-schema-invalid/);
  assert.throws(() => parseDestinyWorkTaskPullRequest(workPr({ taskId: "DWT-0123456789abcdef01234567" }), { repository, owner }), /destiny-work-task-id-invalid/);
  assert.throws(() => parseDestinyWorkTaskPullRequest(workPr({}, { user: { login: "someone-else" } }), { repository, owner }), /destiny-work-task-author-invalid/);
  assert.throws(() => parseDestinyWorkTaskPullRequest(workPr({}, { state: "closed" }), { repository, owner }), /destiny-work-task-state-invalid/);
  assert.throws(() => parseDestinyWorkTaskPullRequest(workPr({}, { base: { repo: { full_name: "other/repo" } } }), { repository, owner }), /destiny-work-task-repository-mismatch/);
});

test("Destiny Work completion receipt is content-free and replay-safe", () => {
  const task = parseDestinyWorkTaskPullRequest(workPr(), { repository, owner });
  const receipt = buildDestinyWorkReceipt(task);
  assert.deepEqual(receipt, {
    schemaVersion: 1,
    kind: "destiny-work-receipt",
    taskId: workTaskId,
    status: "completed",
    executorLane: "destiny-work-event",
  });
  assert.equal(JSON.stringify(receipt).includes(objective), false);
  assert.deepEqual(validateDestinyWorkReceipt(receipt, workTaskId), receipt);
  assert.deepEqual(planDestinyWorkExecution(task, { existingReceipt: receipt }), {
    execute: false,
    reason: "already-completed",
    taskId: workTaskId,
    receiptPath: `coordination/destiny-work-receipts/${workTaskId}.json`,
  });

  assert.throws(() => validateDestinyWorkReceipt({ ...receipt, taskId: "dwt-aaaaaaaaaaaaaaaaaaaaaaaa" }, workTaskId), /destiny-work-receipt-task-mismatch/);
  assert.throws(() => validateDestinyWorkReceipt({ ...receipt, objective }, workTaskId), /destiny-work-receipt-schema-invalid/);
});
