import test from "node:test";
import assert from "node:assert/strict";
import { buildCodexCloudExecArgs, parseDestinyGithubTaskIssue } from "../src/destiny-github-task.mjs";

const taskId = "dct-0123456789abcdef01234567";
const repository = "michaeljwilliams0123/mahoraga";
const owner = "michaeljwilliams0123";
const prompt = `Implement only the bounded Destiny probe ${taskId}. Create one marker file and open a PR. Do not review code.`;

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

test("GitHub task rejects multiple machine envelopes instead of selecting the first", () => {
  const candidate = issue();
  candidate.body = `${candidate.body}\n\n${candidate.body}`;
  assert.throws(
    () => parseDestinyGithubTaskIssue(candidate, { repository, owner }),
    /destiny-github-task-marker-ambiguous/,
  );
});
